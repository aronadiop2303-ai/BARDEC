/**
 * useActiveOrdersCount
 *
 * Returns the number of "active" orders relevant to the current role, for
 * the badge on the Orders tab in the bottom navigation bar:
 *  - Approvers: pending_approval orders they can act on (RLS-scoped to
 *    their company via orders_approver — no customer_id filter, an
 *    approver's own customer_id rarely owns any of these orders). Also
 *    kept live via Realtime (INSERT/UPDATE on their company's orders) —
 *    same count, same query, just re-run whenever it might have changed —
 *    and fires a local notification when a new order lands needing their
 *    approval, same pattern already used for proximity orders (see
 *    hooks/useProximityOrders.ts).
 *  - Everyone else: their own orders (pending | pending_approval | shipped |
 *    out_for_delivery).
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { requestNotificationPermission, scheduleLocalNotification } from '@/lib/notifications';

const ACTIVE_STATUSES = ['pending', 'pending_approval', 'shipped', 'out_for_delivery'];

export function useActiveOrdersCount(isApprover = false, companyId?: string | null): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;

    const query = isApprover
      ? supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval')
      : supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', uid)
          .in('status', ACTIVE_STATUSES);

    const { count: n, error } = await query;
    if (!error) setCount(n ?? 0);
  }, [isApprover]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime — badge en direct + notification locale à l'arrivée d'une
  // nouvelle commande à approuver. Filtré par company_id (colonne simple,
  // supportée par les filtres Realtime de Supabase) plutôt que par statut :
  // toute commande B2B insérée démarre déjà à pending_approval côté serveur
  // (voir checkout.tsx), donc une INSERT sur la société de l'approbateur est
  // par construction une commande à approuver.
  useEffect(() => {
    if (!isApprover || !companyId || !isSupabaseConfigured || !supabase) return;
    requestNotificationPermission().catch(() => {/* ignore */});

    const channel = supabase
      .channel(`approver_orders:company:${companyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        (payload) => {
          refresh();
          const row = payload.new as { status?: string; order_number?: string };
          if (row.status === 'pending_approval') {
            scheduleLocalNotification(
              '📋 Nouvelle commande à approuver',
              `La commande ${row.order_number ?? ''} attend ta validation.`,
              { type: 'pending_approval', orderNumber: row.order_number },
            ).catch(() => {/* ignore */});
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [isApprover, companyId, refresh]);

  return count;
}
