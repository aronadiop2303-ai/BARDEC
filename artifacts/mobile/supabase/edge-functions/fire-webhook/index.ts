/**
 * BARDEC Edge Function: fire-webhook
 * Dispatches outbound webhooks to configured external endpoints.
 * Compatible with: Make, n8n, Zapier, CrewAI, LangGraph, ERPs.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  event: string;
  timestamp: string;
  version: '1.0';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: WebhookPayload = await req.json();

    // Fetch all active webhook configs for this event
    const { data: configs } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('active', true)
      .contains('events', [payload.event]);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dispatch to all endpoints concurrently
    const results = await Promise.allSettled(
      configs.map(async (config: any) => {
        const signature = await createHmacSignature(JSON.stringify(payload), config.secret);

        for (let attempt = 0; attempt <= config.retry_count; attempt++) {
          try {
            const response = await fetch(config.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Bardec-Signature': signature,
                'X-Bardec-Event': payload.event,
                'X-Bardec-Delivery': crypto.randomUUID(),
              },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              return { configId: config.id, status: 'delivered', httpStatus: response.status };
            }
          } catch (e) {
            if (attempt === config.retry_count) {
              return { configId: config.id, status: 'failed', error: String(e) };
            }
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      })
    );

    return new Response(
      JSON.stringify({ dispatched: configs.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function createHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return 'sha256=' + Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}
