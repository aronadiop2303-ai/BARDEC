/**
 * CustomerOrdersNotifier
 *
 * A zero-UI component mounted once at the app root.  It keeps a Supabase
 * Realtime channel open for the current customer's proximity orders and fires
 * local push notifications whenever an order status changes — independently of
 * whether the My Orders screen is visible.
 */
import { useCustomerOrdersRealtime } from '@/hooks/useProximityOrders';

export default function CustomerOrdersNotifier() {
  useCustomerOrdersRealtime();
  return null;
}
