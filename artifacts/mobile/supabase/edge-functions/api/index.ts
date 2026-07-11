/**
 * BARDEC REST API — Supabase Edge Function
 * Endpoints publics documentés pour intégrations externes.
 * Auth: Bearer token (utilisateurs) ou X-API-Key (systèmes externes)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const apiKey = req.headers.get('x-api-key');
  const authHeader = req.headers.get('authorization');

  // GET /docs — API documentation
  if (path === '/docs') {
    return json({
      openapi: '3.0.0',
      info: { title: 'BARDEC API', version: '1.0.0', description: 'REST API — B2B & B2C Marketplace' },
      servers: [{ url: `${url.origin}/api`, description: 'BARDEC API' }],
      paths: {
        '/products': { get: { summary: 'List products', parameters: [
          { name: 'category', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'offset', in: 'query' }
        ]}},
        '/products/{id}': { get: { summary: 'Get product by ID' }},
        '/orders': { get: { summary: 'List orders (auth required)' }},
        '/orders/{id}': { get: { summary: 'Get order details' }},
        '/orders/{id}/status': { patch: { summary: 'Update order status (admin)' }},
        '/webhooks/inbound': { post: { summary: 'Receive inbound webhook (api-key required)' }},
      },
    });
  }

  // GET /products
  if (path === '/products' && req.method === 'GET') {
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit') ?? '20');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    let query = supabase.from('products').select('*').eq('is_active', true).range(offset, offset + limit - 1);
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 400);
    return json({ data, count: data?.length, offset, limit });
  }

  // GET /products/:id
  if (path.startsWith('/products/') && req.method === 'GET') {
    const id = path.split('/')[2];
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) return json({ error: 'Product not found' }, 404);
    return json({ data });
  }

  // POST /webhooks/inbound
  if (path === '/webhooks/inbound' && req.method === 'POST') {
    if (!apiKey) return json({ error: 'API key required' }, 401);
    const { data: keyData } = await supabase.from('api_keys').select('id, permissions').eq('key', apiKey).eq('active', true).single();
    if (!keyData) return json({ error: 'Invalid API key' }, 401);

    const body = await req.json();
    const { event, data } = body;
    // Log inbound webhook
    await supabase.from('audit_logs').insert({ action: `webhook.inbound.${event}`, details: data });
    return json({ success: true, received: event });
  }

  return json({ error: 'Not found', path }, 404);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
