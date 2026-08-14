/**
 * usePendingApprovalsCount
 *
 * Real count of orders awaiting B2B approval, for the BUYER/APPROVER badges
 * on the profile screen and the home B2B dashboard. `user.pendingApprovals`
 * is never populated for real accounts (no such column on `users`), so this
 * queries `orders` directly. RLS itself scopes the result correctly per role
 * (orders_customer sees only the buyer's own orders, orders_approver sees
 * the whole company's queue) — no need to branch on role here.
 */
import { useState, useEffect } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export function usePendingApprovalsCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !supabase) return;
    supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval')
      .then(({ count: n }) => setCount(n ?? 0));
  }, [enabled]);

  return count;
}
