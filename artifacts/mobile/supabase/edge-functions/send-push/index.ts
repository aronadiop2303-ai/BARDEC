/**
 * BARDEC Edge Function: send-push
 * Sends Expo push notifications for two cases:
 *  - mode "order": order status changed, notify the buyer + vendor(s) of
 *    that order (excluding whoever triggered the change).
 *  - mode "admin_broadcast": admin-authored notification to one user, a
 *    whole role, or everyone.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type OrderEvent = 'approved' | 'shipped' | 'out_for_delivery' | 'completed' | 'cancelled';

const ORDER_MESSAGES: Record<OrderEvent, { title: string; body: (orderNumber: string) => string }> = {
  approved:         { title: '✅ Commande approuvée',   body: (n) => `Commande ${n} approuvée et en traitement.` },
  shipped:          { title: '📦 Commande expédiée',    body: (n) => `Commande ${n} en route. Suivez votre livraison.` },
  out_for_delivery: { title: '🚚 Livraison en cours',   body: (n) => `Commande ${n} sera livrée aujourd'hui.` },
  completed:        { title: '🎉 Livraison confirmée',  body: (n) => `Commande ${n} livrée. Laissez un avis !` },
  cancelled:        { title: '❌ Commande annulée',     body: (n) => `Commande ${n} a été annulée.` },
};

const PRODUCT_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface OrderPayload {
  mode: 'order';
  order_id: string;
  event: OrderEvent;
}
interface BroadcastPayload {
  mode: 'admin_broadcast';
  title: string;
  body: string;
  target: { type: 'user'; user_id: string } | { type: 'role'; role: string } | { type: 'all' };
}
type Payload = OrderPayload | BroadcastPayload;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Authentification requise.' }, 401);

    // Caller-scoped client — respects RLS, used to verify the caller is
    // actually allowed to act on the thing they're asking to notify about.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Authentification invalide.' }, 401);

    // Service-role client — needed to read OTHER users' push_tokens/roles,
    // which RLS never allows for a non-admin caller.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const payload: Payload = await req.json();

    let recipientIds: string[] = [];
    let title = '';
    let body = '';

    if (payload.mode === 'order') {
      if (!payload.order_id || !payload.event) {
        return jsonResponse({ error: 'order_id et event requis.' }, 400);
      }
      const msg = ORDER_MESSAGES[payload.event];
      if (!msg) return jsonResponse({ error: 'event inconnu.' }, 400);

      // RLS-gated visibility check: the caller must be someone who can
      // legitimately see this order (customer/vendor/approver/admin) —
      // same trust boundary as the status UPDATE that triggered this call.
      const { data: visible, error: visErr } = await userClient
        .from('orders').select('id').eq('id', payload.order_id).single();
      if (visErr || !visible) return jsonResponse({ error: 'Commande introuvable ou accès refusé.' }, 403);

      const { data: order, error: orderErr } = await admin
        .from('orders').select('order_number, customer_id, items').eq('id', payload.order_id).single();
      if (orderErr || !order) return jsonResponse({ error: 'Commande introuvable.' }, 404);

      title = msg.title;
      body = msg.body(order.order_number);

      const productIds = ((order.items ?? []) as Array<{ product_id?: string }>)
        .map(it => it.product_id)
        .filter((id): id is string => !!id && PRODUCT_ID_RE.test(id));

      let vendorIds: string[] = [];
      if (productIds.length > 0) {
        const { data: products } = await admin.from('products').select('vendor_id').in('id', productIds);
        vendorIds = [...new Set((products ?? []).map((p: { vendor_id: string }) => p.vendor_id))];
      }
      recipientIds = [...new Set([order.customer_id, ...vendorIds])].filter(id => id !== user.id);

    } else if (payload.mode === 'admin_broadcast') {
      const { data: callerRow } = await admin.from('users').select('role').eq('id', user.id).single();
      if (callerRow?.role !== 'ADMIN') return jsonResponse({ error: 'Réservé aux administrateurs.' }, 403);
      if (!payload.title?.trim() || !payload.body?.trim()) {
        return jsonResponse({ error: 'title et body requis.' }, 400);
      }
      title = payload.title.trim();
      body = payload.body.trim();

      if (payload.target?.type === 'user') {
        if (!payload.target.user_id) return jsonResponse({ error: 'target.user_id requis.' }, 400);
        recipientIds = [payload.target.user_id];
      } else if (payload.target?.type === 'role') {
        if (!payload.target.role) return jsonResponse({ error: 'target.role requis.' }, 400);
        const { data: rows } = await admin.from('users').select('id').eq('role', payload.target.role);
        recipientIds = (rows ?? []).map((r: { id: string }) => r.id);
      } else if (payload.target?.type === 'all') {
        const { data: rows } = await admin.from('users').select('id');
        recipientIds = (rows ?? []).map((r: { id: string }) => r.id);
      } else {
        return jsonResponse({ error: 'target invalide.' }, 400);
      }
    } else {
      return jsonResponse({ error: 'mode invalide.' }, 400);
    }

    if (recipientIds.length === 0) return jsonResponse({ recipients: 0, tokens: 0 }, 200);

    const { data: tokenRows } = await admin.from('push_tokens').select('token').in('user_id', recipientIds);
    const tokens = [...new Set((tokenRows ?? []).map((t: { token: string }) => t.token))];

    if (tokens.length === 0) return jsonResponse({ recipients: recipientIds.length, tokens: 0 }, 200);

    // Expo's push API accepts up to 100 messages per request.
    const messages = tokens.map(to => ({ to, title, body, sound: 'default' }));
    const chunks: (typeof messages)[] = [];
    for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

    await Promise.allSettled(
      chunks.map(chunk =>
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
        }),
      ),
    );

    return jsonResponse({ recipients: recipientIds.length, tokens: tokens.length }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
