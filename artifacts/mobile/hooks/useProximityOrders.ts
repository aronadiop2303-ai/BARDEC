import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useMyProximityShop } from '@/hooks/useMyProximityShop';
import { useAuth } from '@/context/AuthContext';
import { scheduleLocalNotification, requestNotificationPermission } from '@/lib/notifications';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProximityOrderItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export type ProximityOrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export interface ProximityOrder {
  id: string;
  proximity_shop_id: string;
  customer_id: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: ProximityOrderItem[];
  subtotal: number;
  total: number;
  status: ProximityOrderStatus;
  cancelled_by?: 'customer' | 'vendor' | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

/** ProximityOrder enriched with the shop name — used on the customer side */
export interface CustomerProximityOrder extends ProximityOrder {
  shop_name: string;
}
export const DEMO_ORDERS: ProximityOrder[] = [
  {
    id: 'demo-order-1',
    proximity_shop_id: 'demo-shop',
    customer_id: 'demo-user-1',
    customer_name: 'Aminata Diallo',
    customer_phone: '+221 77 123 4567',
    items: [
      { product_id: 'p1', name: 'Pain de mie complet', quantity: 2, unit_price: 750, total: 1500 },
      { product_id: 'p2', name: 'Croissant au beurre', quantity: 3, unit_price: 400, total: 1200 },
    ],
    subtotal: 2700,
    total: 2700,
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'demo-order-2',
    proximity_shop_id: 'demo-shop',
    customer_id: 'demo-user-2',
    customer_name: 'Modou Fall',
    customer_phone: '+221 76 987 6543',
    items: [
      { product_id: 'p3', name: 'Baguette tradition', quantity: 4, unit_price: 300, total: 1200 },
    ],
    subtotal: 1200,
    total: 1200,
    status: 'confirmed',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'demo-order-3',
    proximity_shop_id: 'demo-shop',
    customer_id: 'demo-user-3',
    customer_name: 'Fatou Ndiaye',
    customer_phone: '+221 78 555 0011',
    items: [
      { product_id: 'p4', name: 'Éclair chocolat', quantity: 6, unit_price: 500, total: 3000 },
      { product_id: 'p5', name: 'Tarte aux pommes', quantity: 1, unit_price: 2500, total: 2500 },
    ],
    subtotal: 5500,
    total: 5500,
    status: 'delivered',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'demo-order-4',
    proximity_shop_id: 'demo-shop',
    customer_id: 'demo-user-4',
    customer_name: 'Oumar Sy',
    customer_phone: '+221 77 442 3310',
    items: [
      { product_id: 'p6', name: 'Gâteau d\'anniversaire', quantity: 1, unit_price: 15000, total: 15000 },
    ],
    subtotal: 15000,
    total: 15000,
    status: 'cancelled',
    cancelled_by: 'customer',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

// ── Vendor-initiated cancellation guard ─────────────────────────────────────
//
// The Realtime UPDATE subscription cannot distinguish who triggered a status
// change to 'cancelled' (customer via cancel_my_proximity_order, or vendor via
// update_proximity_order_status).  This Set is populated by useUpdateOrderStatus
// whenever the vendor explicitly cancels an order so the UPDATE handler can
// suppress the false "customer cancelled" notification.
const _vendorCancelledOrderIds = new Set<string>();

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchShopOrders(shopId: string): Promise<ProximityOrder[]> {
  if (!isSupabaseConfigured || !supabase) return DEMO_ORDERS;

  const { data, error } = await supabase
    .from('proximity_orders')
    .select('*')
    .eq('proximity_shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProximityOrder[];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useProximityOrders() {
  const { shop } = useMyProximityShop();
  const shopId = shop?.id ?? null;
  const shopName = shop?.name ?? 'votre boutique';
  const qc = useQueryClient();

  // ── Supabase Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !shopId) return;

    // Request notification permission once when the subscription starts
    requestNotificationPermission().catch(() => {/* ignore */});

    const channel = supabase
      .channel(`proximity_orders:shop:${shopId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proximity_orders',
          filter: `proximity_shop_id=eq.${shopId}`,
        },
        (payload) => {
          const newOrder = payload.new as ProximityOrder;

          // Prepend the new order into the cache immediately
          qc.setQueryData<ProximityOrder[]>(
            ['proximity_orders', shopId],
            (prev) => [newOrder, ...(prev ?? [])],
          );

          // Fire a local push notification to alert the vendor
          scheduleLocalNotification(
            '🛒 Nouvelle commande !',
            `Un client vient de passer une commande chez ${shopName}.`,
            { type: 'new_proximity_order', orderId: newOrder.id },
            1,
          ).catch(() => {/* ignore notification failures */});
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proximity_orders',
          filter: `proximity_shop_id=eq.${shopId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as ProximityOrder;

          // Update the cached order in place so the vendor screen refreshes immediately
          qc.setQueryData<ProximityOrder[]>(
            ['proximity_orders', shopId],
            (prev) =>
              (prev ?? []).map((o) =>
                o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o,
              ),
          );

          // Alert the vendor only when the cancellation was customer-initiated.
          // Vendor-initiated cancellations are pre-registered in
          // _vendorCancelledOrderIds by useUpdateOrderStatus before the RPC runs,
          // so we can reliably distinguish the two paths here.
          if (updatedOrder.status === 'cancelled') {
            if (_vendorCancelledOrderIds.has(updatedOrder.id)) {
              // Vendor cancelled this order themselves — consume the flag and skip.
              _vendorCancelledOrderIds.delete(updatedOrder.id);
            } else {
              // No pre-registration → this cancellation came from the customer.
              scheduleLocalNotification(
                '❌ Commande annulée',
                'Un client a annulé sa commande.',
                { type: 'proximity_order_cancelled', orderId: updatedOrder.id },
                1,
              ).catch(() => {/* ignore notification failures */});
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [shopId, shopName, qc]);
  // ───────────────────────────────────────────────────────────────────────────

  return useQuery({
    queryKey: ['proximity_orders', shopId],
    queryFn: () => (shopId ? fetchShopOrders(shopId) : DEMO_ORDERS),
    enabled: true, // always fetch (use demo when no shopId)
    staleTime: 1000 * 30, // refresh every 30s
    refetchInterval: 1000 * 30,
  });
}

/** Update the status of a proximity order via security-definer RPC (vendor only, status field only) */
export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: ProximityOrderStatus }) => {
      if (!isSupabaseConfigured || !supabase) {
        // Demo mode: return mock success without touching DB
        return;
      }
      // Register vendor-initiated cancellations BEFORE the RPC so the Realtime
      // UPDATE event (which arrives asynchronously) sees the flag in time.
      if (status === 'cancelled') {
        _vendorCancelledOrderIds.add(orderId);
      }
      // Uses a SECURITY DEFINER function that only allows changing the status column,
      // preventing vendors from altering totals, items, or customer fields.
      // cancelled_by is derived server-side ('vendor') — never sent from the client.
      const { error } = await supabase.rpc('update_proximity_order_status', {
        p_order_id: orderId,
        p_status: status,
      });
      if (error) {
        // Roll back the guard flag so a retry doesn't permanently suppress alerts.
        _vendorCancelledOrderIds.delete(orderId);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proximity_orders'] });
    },
  });
}

async function fetchMyOrders(customerId: string): Promise<CustomerProximityOrder[]> {
  if (!isSupabaseConfigured || !supabase) return DEMO_CUSTOMER_ORDERS;

  const { data, error } = await supabase
    .from('proximity_orders')
    .select('*, proximity_shops(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map(row => ({
    ...row,
    shop_name: row.proximity_shops?.name ?? 'Commerce',
  })) as CustomerProximityOrder[];
}
/** Notify the vendor of a new incoming order (called after placing) */
export async function notifyVendorNewOrder(shopName: string) {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleLocalNotification(
    '🛒 Nouvelle commande !',
    `Un client vient de passer une commande chez ${shopName}.`,
    { type: 'new_proximity_order' },
    1,
  );
}

/** Notify the customer when their order status changes */
export async function notifyCustomerOrderStatus(
  shopName: string,
  newStatus: ProximityOrderStatus,
) {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  const messages: Partial<Record<ProximityOrderStatus, { title: string; body: string }>> = {
    confirmed: {
      title: '✅ Commande confirmée',
      body:  `${shopName} a confirmé ta commande. Elle sera bientôt prête.`,
    },
    delivered: {
      title: '🎉 Commande livrée',
      body:  `Ta commande chez ${shopName} a été livrée !`,
    },
    cancelled: {
      title: '❌ Commande annulée',
      body:  `Ta commande chez ${shopName} a été annulée.`,
    },
  };
  const msg = messages[newStatus];
  if (msg) {
    await scheduleLocalNotification(msg.title, msg.body, { type: 'proximity_order_status', shopName, newStatus }, 1);
  }
}

/**
 * Lets a customer cancel one of their own pending orders.
 * In Supabase mode: calls the `cancel_my_proximity_order` SECURITY DEFINER RPC
 *   which verifies customer_id = auth.uid() and status = 'pending'.
 * In demo mode: optimistically updates the query cache so the UI reflects the
 *   cancellation immediately without touching the database.
 */
export function useCancelMyOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const customerId = user?.id ?? null;

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!isSupabaseConfigured || !supabase) {
        // Demo mode — update the cache directly so the customer UI reflects the
        // cancellation immediately.
        // NOTE: no vendor push notification is sent in demo mode because there is
        // no Supabase Realtime channel to deliver the UPDATE event.  In production
        // the vendor's useProximityOrders UPDATE subscription handles it automatically.
        qc.setQueryData<CustomerProximityOrder[]>(
          ['my_proximity_orders', customerId],
          (prev) =>
            (prev ?? []).map((o) =>
              o.id === orderId
                ? { ...o, status: 'cancelled' as ProximityOrderStatus, cancelled_by: 'customer' as const }
                : o,
            ),
        );
        return;
      }
      // The cancel_my_proximity_order RPC automatically sets cancelled_by = 'customer'.
      const { error } = await supabase.rpc('cancel_my_proximity_order', {
        p_order_id: orderId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_proximity_orders', customerId] });
    },
  });
}

/** Returns the current customer's proximity orders (demo-safe) */
export function useMyProximityOrders() {
  const { user } = useAuth();
  const customerId = user?.id ?? null;

  return useQuery({
    queryKey: ['my_proximity_orders', customerId],
    queryFn: () => (customerId ? fetchMyOrders(customerId) : DEMO_CUSTOMER_ORDERS),
    enabled: true,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  });
}

/** Demo orders shown to customers in demo mode */
export const DEMO_CUSTOMER_ORDERS: CustomerProximityOrder[] = [
  {
    id: 'demo-cust-order-1',
    proximity_shop_id: 'demo-shop-1',
    shop_name: 'Boulangerie Teranga',
    customer_id: 'demo-customer',
    customer_name: 'Moi',
    items: [
      { product_id: 'p1', name: 'Pain de mie complet', quantity: 2, unit_price: 750, total: 1500 },
      { product_id: 'p2', name: 'Croissant au beurre', quantity: 3, unit_price: 400, total: 1200 },
    ],
    subtotal: 2700,
    total: 2700,
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'demo-cust-order-2',
    proximity_shop_id: 'demo-shop-2',
    shop_name: 'Épicerie du Plateau',
    customer_id: 'demo-customer',
    customer_name: 'Moi',
    items: [
      { product_id: 'p3', name: 'Tomates fraîches (1 kg)', quantity: 2, unit_price: 500, total: 1000 },
      { product_id: 'p4', name: 'Lait concentré Nestlé', quantity: 1, unit_price: 450, total: 450 },
    ],
    subtotal: 1450,
    total: 1450,
    status: 'confirmed',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'demo-cust-order-3',
    proximity_shop_id: 'demo-shop-3',
    shop_name: 'Chez Mariama Couture',
    customer_id: 'demo-customer',
    customer_name: 'Moi',
    items: [
      { product_id: 'p5', name: 'Tissu wax 6 yards', quantity: 1, unit_price: 8500, total: 8500 },
    ],
    subtotal: 8500,
    total: 8500,
    status: 'delivered',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'demo-cust-order-4',
    proximity_shop_id: 'demo-shop-1',
    shop_name: 'Boulangerie Teranga',
    customer_id: 'demo-customer',
    customer_name: 'Moi',
    items: [
      { product_id: 'p6', name: 'Gâteau d\'anniversaire', quantity: 1, unit_price: 12000, total: 12000 },
    ],
    subtotal: 12000,
    total: 12000,
    status: 'cancelled',
    cancelled_by: 'vendor',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
];

// ── Realtime subscription for customer order status changes ──────────────────
//
// This hook is mounted globally (in the root layout) — NOT in the My Orders
// screen — so status-change notifications fire regardless of which screen is
// open.  AsyncStorage persists the last-known status so:
//   • Each transition triggers exactly one notification (deduplication).
//   • The first open after an app restart does NOT fire spurious notifications.

const STORAGE_KEY_PREFIX = 'prox_order_status:';

async function loadPersistedStatuses(
  customerId: string,
): Promise<Record<string, ProximityOrderStatus>> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${customerId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function persistStatuses(
  customerId: string,
  statuses: Record<string, ProximityOrderStatus>,
) {
  try {
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${customerId}`,
      JSON.stringify(statuses),
    );
  } catch { /* storage failure is non-fatal */ }
}

/**
 * Mount this hook once at the app root (inside AuthProvider + QueryClientProvider).
 * It opens a Supabase Realtime channel scoped to the current customer's orders,
 * detects status transitions, fires local notifications, and invalidates the
 * my_proximity_orders query cache — all independently of whether the Orders
 * screen is mounted.
 */
export function useCustomerOrdersRealtime() {
  const { user } = useAuth();
  const customerId = user?.id ?? null;
  const qc = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !customerId) return;

    // Seed in-memory status map from AsyncStorage so the first realtime event
    // can detect a transition even if it arrives before the query loads.
    const knownStatuses: Record<string, ProximityOrderStatus> = {};
    let seeded = false;

    loadPersistedStatuses(customerId).then(stored => {
      Object.assign(knownStatuses, stored);
      seeded = true;
    });

    requestNotificationPermission().catch(() => { /* ignore */ });

    const channel = supabase
      .channel(`customer_orders:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proximity_orders',
          filter: `customer_id=eq.${customerId}`,
        },
        async (payload) => {
          const updated = payload.new as ProximityOrder & { proximity_shop_id: string };
          const newStatus = updated.status;
          const orderId = updated.id;

          // Wait for AsyncStorage seed on the first event (race guard).
          if (!seeded) {
            await loadPersistedStatuses(customerId).then(s => {
              Object.assign(knownStatuses, s);
              seeded = true;
            });
          }

          const prevStatus = knownStatuses[orderId];

          // Only notify if this is a genuine transition we haven't seen before.
          if (prevStatus !== newStatus) {
            knownStatuses[orderId] = newStatus;
            persistStatuses(customerId, knownStatuses);

            // Resolve shop name from the query cache (best-effort).
            const cached = qc.getQueryData<CustomerProximityOrder[]>([
              'my_proximity_orders',
              customerId,
            ]);
            const order = cached?.find(o => o.id === orderId);
            const shopName = order?.shop_name ?? 'Le commerce';

            notifyCustomerOrderStatus(shopName, newStatus).catch(() => { /* ignore */ });
          }

          // Always refresh the customer orders cache.
          qc.invalidateQueries({ queryKey: ['my_proximity_orders', customerId] });
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [customerId, qc]);
}
