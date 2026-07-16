import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useMyProximityShop } from '@/hooks/useMyProximityShop';
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
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

// ── Demo data ────────────────────────────────────────────────────────────────

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
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

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
      // Uses a SECURITY DEFINER function that only allows changing the status column,
      // preventing vendors from altering totals, items, or customer fields.
      const { error } = await supabase.rpc('update_proximity_order_status', {
        p_order_id: orderId,
        p_status: status,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proximity_orders'] });
    },
  });
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
