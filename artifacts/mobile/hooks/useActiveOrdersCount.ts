/**
 * useActiveOrdersCount
 *
 * Returns the number of "active" orders relevant to the current role, for
 * the badge on the Orders tab in the bottom navigation bar:
 *  - Approvers: pending_approval orders they can act on (RLS-scoped to
 *    their company via orders_approver — no customer_id filter, an
 *    approver's own customer_id rarely owns any of these orders).
 *  - Everyone else: their own orders (pending | pending_approval | shipped |
 *    out_for_delivery).
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const ACTIVE_STATUSES = ['pending', 'pending_approval', 'shipped', 'out_for_delivery'];

export function useActiveOrdersCount(isApprover = false): number {
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

  return count;
}
