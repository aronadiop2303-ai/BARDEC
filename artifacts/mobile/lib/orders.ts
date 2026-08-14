import { Order } from '@/constants/mockData';

/** Map a raw Supabase `orders` row to the app's `Order` shape. */
export function mapDbOrder(row: any): Order {
  return {
    id:                  row.id,
    orderNumber:         row.order_number ?? row.id,
    status:              row.status ?? 'pending',
    items:               Array.isArray(row.items)
      ? row.items.map((item: any) => ({
          productId:   item.product_id ?? item.id ?? '',
          productName: item.product_name ?? item.name ?? '—',
          quantity:    item.quantity ?? 1,
          price:       item.price ?? 0,
          image:       item.image ?? '',
        }))
      : [],
    subtotal:            row.subtotal ?? row.total ?? 0,
    shipping:            row.shipping_cost ?? 0,
    tax:                 row.tax_amount ?? 0,
    total:               row.total ?? 0,
    date:                row.created_at
      ? new Date(row.created_at).toLocaleDateString('fr-FR')
      : '—',
    trackingNumber:      row.tracking_number ?? undefined,
    purchaseOrderNumber: row.purchase_order_number ?? undefined,
    estimatedDelivery:   row.estimated_delivery ?? undefined,
  };
}
