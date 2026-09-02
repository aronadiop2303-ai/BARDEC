/**
 * BARDEC Edge Function: payment-gateway
 *
 * Generic entry point for "charge this provider for this amount" — the
 * shape a real Wave/Orange Money/MTN MoMo/card integration would eventually
 * use. As of this file, it is a deliberately inert stub:
 *
 *   - No payment API key is read from anywhere (no Deno.env.get for any
 *     gateway secret — none exist yet, and none should be added until the
 *     KYB contracts referenced in BUGS.md are signed).
 *   - No fetch() call to any payment gateway domain exists in this file.
 *   - REAL_PAYMENTS_ENABLED below is hardcoded false and is the ONLY switch
 *     that could ever let this function attempt a real charge. Flipping it
 *     is a deliberate, reviewed code change — not a config toggle, not a
 *     database flag. Until it flips, calling this function can only ever
 *     return a 501 and touch nothing.
 *
 * Today's real payment flow (Wave/Orange Money/MTN MoMo) does NOT go
 * through this function at all — it's the existing manual-proof flow in
 * checkout.tsx (pay peer-to-peer via the provider's own app, upload a
 * screenshot to payment_proof_url, admin verifies). This function exists
 * so that a future real integration has one place to land instead of being
 * bolted onto checkout.tsx directly — see BUGS.md for what's still missing
 * before it can ever be turned on (real API keys, webhook endpoint,
 * refund/failure handling).
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

// The only way this function will ever move real money: a manual code
// change to `true` here, done deliberately once a real gateway is wired in
// below (real API call, real webhook handler deployed separately, real
// keys in env). Never set from a request, a DB row, or an env var.
const REAL_PAYMENTS_ENABLED = false;

interface ChargeRequest {
  provider_code: string;
  amount: number;
  order_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Authentification requise.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Authentification invalide.' }, 401);

    const payload = (await req.json()) as Partial<ChargeRequest>;
    if (!payload.provider_code || !payload.amount || !payload.order_id) {
      return jsonResponse({ error: 'provider_code, amount et order_id requis.' }, 400);
    }

    // Confirms the provider is a real, admin-configured row rather than an
    // arbitrary string — but existing/active in payment_providers is NOT
    // enough by itself to authorize a real charge (see REAL_PAYMENTS_ENABLED
    // above). This lookup happens even in stub mode purely to give a
    // meaningful error (unknown provider vs. not-yet-implemented).
    const { data: provider } = await userClient
      .from('payment_providers')
      .select('code, name, active')
      .eq('code', payload.provider_code)
      .maybeSingle();

    if (!provider) {
      return jsonResponse({ error: `Fournisseur de paiement inconnu: ${payload.provider_code}` }, 404);
    }

    if (!REAL_PAYMENTS_ENABLED) {
      return jsonResponse({
        error: 'not_implemented',
        message: `Intégration réelle non branchée pour ${provider.name}. Utilise le flux de preuve de paiement manuelle existant (checkout.tsx) en attendant.`,
      }, 501);
    }

    // Unreachable while REAL_PAYMENTS_ENABLED is false. Left unimplemented
    // on purpose — this is exactly the code that must never exist until
    // real provider credentials, KYB, and a webhook confirmation endpoint
    // are all in place (see BUGS.md).
    return jsonResponse({ error: 'not_implemented' }, 501);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
