/**
 * useVendorPendingOrdersCount
 *
 * Count of orders containing this vendor's products that still need vendor
 * action (new or approved, not yet shipped) — drives the badge on the
 * Vendor Dashboard tab. Relies on the orders_vendor RLS policy to scope
 * results; returns 0 (not an error) if that policy can't be evaluated.
 *
 * Also kept live via Realtime (any orders INSERT — orders_vendor RLS scopes
 * what this client actually receives to orders containing this vendor's own
 * products) and fires a local notification when a brand new order lands,
 * same pattern as hooks/useProximityOrders.ts / useActiveOrdersCount.ts.
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { requestNotificationPermission, scheduleLocalNotification } from '@/lib/notifications';

const NEEDS_ACTION_STATUSES = ['pending', 'approved'];

export function useVendorPendingOrdersCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured || !supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const vendorId = authData.user?.id;
    if (!vendorId) return;

    const { data: prods } = await supabase.from('products').select('id').eq('vendor_id', vendorId);
    const productIds = new Set((prods ?? []).map((p: { id: string }) => p.id));
    if (productIds.size === 0) { setCount(0); return; }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('items')
      .in('status', NEEDS_ACTION_STATUSES)
      .limit(200);
    if (error) { console.warn('Vendor pending orders count error:', error.message); return; }

    const n = (orders ?? []).filter((o: { items: unknown }) => {
      const items = Array.isArray(o.items) ? (o.items as Array<{ product_id?: string }>) : [];
      return items.some((item) => item.product_id && productIds.has(item.product_id));
    }).length;
    setCount(n);
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !supabase) return;
    requestNotificationPermission().catch(() => {/* ignore */});

    // Pas de filter= ici — product_id vit dans le JSONB `items`, pas dans une
    // colonne filtrable par Realtime. orders_vendor (RLS) limite déjà ce que
    // ce client reçoit réellement aux commandes contenant ses propres
    // produits, donc chaque INSERT livré ici est légitimement pour ce vendeur.
    const channel = supabase
      .channel('vendor_new_orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          refresh();
          const row = payload.new as { order_number?: string };
          scheduleLocalNotification(
            '🛒 Nouvelle commande reçue',
            `Commande ${row.order_number ?? ''} à traiter.`,
            { type: 'new_order', orderNumber: row.order_number },
          ).catch(() => {/* ignore */});
        },
      )
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [enabled, refresh]);

  return count;
}
