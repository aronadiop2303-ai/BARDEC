/**
 * useActiveOrdersCount
 *
 * Returns the number of the authenticated user's BARDEC orders that are
 * currently "active" (pending, awaiting approval, shipped, or out-for-delivery).
 * Used to drive the badge on the Orders tab in the bottom navigation bar.
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const ACTIVE_STATUSES = ['pending', 'pending_approval', 'shipped', 'out_for_delivery'];

export function useActiveOrdersCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;
    const { count: n, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', uid)
      .in('status', ACTIVE_STATUSES);
    if (!error) setCount(n ?? 0);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return count;
}
