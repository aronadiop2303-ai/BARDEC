/**
 * BARDEC Edge Function: payment-gateway-webhook
 *
 * IPN (Instant Payment Notification) PayDunya. Endpoint public
 * (verify_jwt=false — PayDunya n'envoie jamais de JWT Supabase), authentifié
 * autrement :
 *
 *   - PayDunya poste en application/x-www-form-urlencoded avec des clés
 *     imbriquées façon PHP (`data[invoice][token]=...`), jamais du JSON.
 *   - Le corps de la requête n'est JAMAIS une source de vérité : on récupère
 *     seulement le token, puis on rappelle nous-mêmes l'API PayDunya
 *     (GET .../checkout-invoice/confirm/[token], avec nos propres clés) pour
 *     obtenir le statut réel. orders.payment_status n'est mis à jour que sur
 *     la base de CETTE réponse, jamais sur la foi du POST reçu.
 *   - Un hash SHA-512 du Master Key est aussi présent dans le POST — vérifié
 *     ici à titre de garde-fou supplémentaire (log si absent/différent),
 *     mais ce n'est pas lui qui autorise la mise à jour : c'est l'appel
 *     confirm() ci-dessus.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function parseBracketFormData(raw: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const params = new URLSearchParams(raw);
  for (const [rawKey, value] of params.entries()) {
    const parts = rawKey.replace(/\]/g, '').split('[').filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        node[key] = value;
      } else {
        if (typeof node[key] !== 'object' || node[key] === null) {
          node[key] = {};
        }
        node = node[key] as Record<string, unknown>;
      }
    }
  }
  return root;
}

async function sha512Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const parsed = parseBracketFormData(rawBody);
    const data = (parsed.data ?? parsed) as Record<string, unknown>;
    const invoice = (data.invoice ?? {}) as Record<string, unknown>;
    const token = (invoice.token ?? data.token) as string | undefined;

    if (!token) {
      return new Response(JSON.stringify({ error: 'token_manquant' }), { status: 400 });
    }

    // Garde-fou informatif seulement — ne conditionne aucune mise à jour.
    const masterKey = Deno.env.get('PAYDUNYA_MASTER_KEY') ?? '';
    const expectedHash = await sha512Hex(masterKey);
    if (typeof data.hash === 'string' && data.hash !== expectedHash) {
      console.warn('payment-gateway-webhook: hash IPN inattendu, ignoré (confirm() reste la source de vérité)');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: txn, error: txnError } = await serviceClient
      .from('payment_transactions')
      .select('id, order_id, amount, mode, status')
      .eq('gateway_token', token)
      .maybeSingle();

    if (txnError || !txn) {
      console.error('payment-gateway-webhook: token inconnu', token);
      return new Response(JSON.stringify({ error: 'transaction_inconnue' }), { status: 404 });
    }

    // Double vérification obligatoire : on rappelle PayDunya avec nos
    // propres clés, on ne fait jamais confiance au corps du webhook.
    const baseUrl = paydunyaBaseUrl(txn.mode);
    const confirmRes = await fetch(`${baseUrl}/checkout-invoice/confirm/${token}`, {
      method: 'GET',
      headers: paydunyaHeaders(),
    });
    const confirmData = await confirmRes.json().catch(() => null);

    if (!confirmData || confirmData.response_code !== '00') {
      console.error('payment-gateway-webhook: confirm() a échoué', confirmData);
      return new Response(JSON.stringify({ error: 'confirm_echec' }), { status: 502 });
    }

    const statusRaw = String(confirmData.status ?? '').toLowerCase();
    const confirmedAmount = Number(confirmData.invoice?.total_amount ?? NaN);
    const amountMatches = Number.isFinite(confirmedAmount) && confirmedAmount === Number(txn.amount);

    let newTxnStatus: 'pending' | 'completed' | 'cancelled' | 'failed' = 'pending';
    let newOrderPaymentStatus: 'paid' | 'failed' | null = null;

    if (!amountMatches) {
      console.error('payment-gateway-webhook: montant confirmé différent du montant créé', {
        token, expected: txn.amount, confirmed: confirmedAmount,
      });
    } else if (statusRaw === 'completed') {
      newTxnStatus = 'completed';
      newOrderPaymentStatus = 'paid';
    } else if (statusRaw === 'cancelled') {
      newTxnStatus = 'cancelled';
      newOrderPaymentStatus = 'failed';
    } else if (statusRaw === 'failed') {
      newTxnStatus = 'failed';
      newOrderPaymentStatus = 'failed';
    }

    await serviceClient
      .from('payment_transactions')
      .update({
        status: newTxnStatus,
        confirm_response: confirmData,
        confirmed_at: newTxnStatus !== 'pending' ? new Date().toISOString() : null,
      })
      .eq('id', txn.id);

    if (newOrderPaymentStatus) {
      // Ne jamais rétrograder une commande déjà marquée payée (notification
      // dupliquée/tardive).
      await serviceClient
        .from('orders')
        .update({ payment_status: newOrderPaymentStatus })
        .eq('id', txn.order_id)
        .neq('payment_status', 'paid');
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('payment-gateway-webhook: exception', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
