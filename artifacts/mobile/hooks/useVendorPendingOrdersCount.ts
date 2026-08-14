/**
 * useVendorPendingOrdersCount
 *
 * Count of orders containing this vendor's products that still need vendor
 * action (new or approved, not yet shipped) — drives the badge on the
 * Vendor Dashboard tab. Relies on the orders_vendor RLS policy to scope
 * results; returns 0 (not an error) if that policy can't be evaluated.
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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

  return count;
}
