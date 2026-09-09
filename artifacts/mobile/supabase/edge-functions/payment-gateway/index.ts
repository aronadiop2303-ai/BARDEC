/**
 * BARDEC Edge Function: payment-gateway
 *
 * Entry point for "charge this provider for this amount". Pour le
 * provider_code 'paydunya' : intégration réelle en mode SANDBOX (agrégateur
 * Wave/Orange Money/Free Money/carte pour l'Afrique de l'Ouest). Tous les
 * autres provider_code restent le stub 501 historique (aucune clé,
 * aucun appel réseau) jusqu'à leur propre intégration.
 *
 * Sécurité :
 *   - Les clés PayDunya (PAYDUNYA-MASTER-KEY / PAYDUNYA-PRIVATE-KEY /
 *     PAYDUNYA-TOKEN) ne sont JAMAIS en dur ici — lues depuis les secrets
 *     Edge Functions Supabase (Deno.env.get).
 *   - Le montant facturé n'est JAMAIS pris depuis la requête client : il est
 *     recalculé depuis orders.total en base pour la commande demandée.
 *   - PAYDUNYA_MODE pilote l'endpoint réel utilisé (sandbox-api vs api). Il
 *     vaut 'test' aujourd'hui — la bascule vers 'live' est un changement
 *     manuel du secret par Arona, jamais automatique, et nécessite un NINEA
 *     validé (voir BUGS.md).
 *   - orders.payment_status n'est JAMAIS mis à jour ici lors de la création
 *     de facture — uniquement plus tard par payment-gateway-webhook, après
 *     double vérification auprès de l'API PayDunya (jamais en faisant
 *     confiance à un corps de requête).
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

interface ChargeRequest {
  provider_code: string;
  order_id: string;
}

function paydunyaBaseUrl(mode: string): string {
  return mode === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';
}

function paydunyaHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': Deno.env.get('PAYDUNYA_MASTER_KEY') ?? '',
    'PAYDUNYA-PRIVATE-KEY': Deno.env.get('PAYDUNYA_PRIVATE_KEY') ?? '',
    'PAYDUNYA-TOKEN': Deno.env.get('PAYDUNYA_TOKEN') ?? '',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Authentification requise.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Authentification invalide.' }, 401);

    const payload = (await req.json()) as Partial<ChargeRequest>;
    if (!payload.provider_code || !payload.order_id) {
      return jsonResponse({ error: 'provider_code et order_id requis.' }, 400);
    }

    const { data: provider } = await userClient
      .from('payment_providers')
      .select('code, name, active')
      .eq('code', payload.provider_code)
      .maybeSingle();

    if (!provider || !provider.active) {
      return jsonResponse({ error: `Fournisseur de paiement inconnu ou inactif: ${payload.provider_code}` }, 404);
    }

    if (provider.code !== 'paydunya') {
      // Aucune autre intégration réelle n'existe encore — comportement
      // historique inchangé pour wave/orange_money/mtn_momo/bank_transfer/
      // card/paypal.
      return jsonResponse({
        error: 'not_implemented',
        message: `Intégration réelle non branchée pour ${provider.name}. Utilise le flux de preuve de paiement manuelle existant (checkout.tsx) en attendant.`,
      }, 501);
    }

    // ── Provider = paydunya : intégration réelle sandbox ──────────────────
    const { data: order, error: orderError } = await userClient
      .from('orders')
      .select('id, order_number, total, currency, payment_status')
      .eq('id', payload.order_id)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ error: 'Commande introuvable.' }, 404);
    }
    if (order.payment_status === 'paid') {
      return jsonResponse({ error: 'Cette commande est déjà payée.' }, 409);
    }

    // Montant recalculé depuis la base — jamais depuis la requête client.
    const amount = Math.round(Number(order.total));
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Montant de commande invalide.' }, 500);
    }

    const modeRaw = (Deno.env.get('PAYDUNYA_MODE') ?? '').trim().toLowerCase();
    const mode = modeRaw === 'live' ? 'live' : 'test';
    const baseUrl = paydunyaBaseUrl(mode);

    const invoiceBody = {
      invoice: {
        total_amount: amount,
        description: `Commande BARDEC ${order.order_number}`,
      },
      store: {
        name: 'BARDEC',
      },
      custom_data: {
        order_id: order.id,
      },
      actions: {
        callback_url: `${supabaseUrl}/functions/v1/payment-gateway-webhook`,
      },
    };

    const paydunyaRes = await fetch(`${baseUrl}/checkout-invoice/create`, {
      method: 'POST',
      headers: paydunyaHeaders(),
      body: JSON.stringify(invoiceBody),
    });
    const paydunyaData = await paydunyaRes.json().catch(() => null);

    if (!paydunyaData || paydunyaData.response_code !== '00' || !paydunyaData.token) {
      return jsonResponse({
        error: 'paydunya_error',
        message: paydunyaData?.response_text ?? paydunyaData?.description ?? 'Échec de création de la facture PayDunya.',
      }, 502);
    }

    // Écriture en base via service role — jamais via le client (aucune
    // policy INSERT n'existe pour les utilisateurs sur payment_transactions).
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { error: insertError } = await serviceClient.from('payment_transactions').insert({
      order_id: order.id,
      provider_code: 'paydunya',
      gateway_token: paydunyaData.token,
      mode,
      amount,
      currency: order.currency ?? 'XOF',
      status: 'pending',
      checkout_url: paydunyaData.response_text,
    });
    if (insertError) {
      return jsonResponse({ error: `Erreur d'enregistrement de la transaction: ${insertError.message}` }, 500);
    }

    return jsonResponse({
      checkout_url: paydunyaData.response_text,
      token: paydunyaData.token,
      mode,
    }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
