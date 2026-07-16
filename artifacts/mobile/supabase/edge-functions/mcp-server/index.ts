/**
 * BARDEC MCP Server — Supabase Edge Function
 * Model Context Protocol (JSON-RPC 2.0 over HTTP, stateless POST)
 *
 * Auth: X-API-Key header  OR  Authorization: Bearer bdc_xxx
 * Permissions stored in api_keys.permissions TEXT[]:
 *   products.read  products.write
 *   orders.read    orders.write
 *   messages.read  messages.write
 *
 * 12 tools:
 *   READ  (7): search_products, get_product_details, get_order_status,
 *              list_orders_by_customer, check_stock, nearby_shops,
 *              get_vendor_dashboard_summary
 *   WRITE (5): update_order_status, create_order, update_stock,
 *              process_refund, send_customer_message
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

interface ApiKeyRecord {
  id: string;
  permissions: string[];
}

type SupabaseClient = ReturnType<typeof createClient>;

// ─────────────────────────────────────────────────────────────────────────────
// CORS / response helpers
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Content-Type': 'application/json',
};

function rpcSuccess(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: CORS,
  });
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): Response {
  const err: JsonRpcErrorBody = { code, message };
  if (data !== undefined) err.data = data;
  // JSON-RPC errors always return HTTP 200 with error in body
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: err }), {
    status: 200,
    headers: CORS,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool manifest — what MCP clients see via tools/list
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  // ── READ ────────────────────────────────────────────────────────────────────
  {
    name: 'search_products',
    permission: 'products.read',
    description: 'Search active marketplace products by keyword, category, or vendor.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search (name, tags)' },
        category: { type: 'string', description: 'Exact category slug' },
        vendor_id: { type: 'string', description: 'Filter by vendor UUID' },
        min_price: { type: 'number', description: 'Minimum public price (XOF)' },
        max_price: { type: 'number', description: 'Maximum public price (XOF)' },
        limit: { type: 'number', description: 'Max results, 1–100 (default 20)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
    },
  },
  {
    name: 'get_product_details',
    permission: 'products.read',
    description: 'Get full details of a product including reviews and stock level.',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string', description: 'Product UUID' },
        include_reviews: { type: 'boolean', description: 'Include recent reviews (default true)' },
      },
    },
  },
  {
    name: 'get_order_status',
    permission: 'orders.read',
    description: 'Get the current status and details of an order by order number or UUID.',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string', description: 'Order UUID or order_number (e.g. BDC-2025-001000)' },
      },
    },
  },
  {
    name: 'list_orders_by_customer',
    permission: 'orders.read',
    description: 'List orders for a specific customer, optionally filtered by status or date range.',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: {
        customer_id: { type: 'string', description: 'Customer user UUID' },
        status: { type: 'string', description: 'order_status filter (pending | approved | shipped | completed | cancelled …)' },
        from_date: { type: 'string', description: 'ISO-8601 start date (inclusive)' },
        to_date: { type: 'string', description: 'ISO-8601 end date (inclusive)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'check_stock',
    permission: 'products.read',
    description: 'Check the current stock level of one or more products.',
    inputSchema: {
      type: 'object',
      required: ['product_ids'],
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of product UUIDs (max 50)',
        },
      },
    },
  },
  {
    name: 'nearby_shops',
    permission: 'products.read',
    description: 'Find proximity shops within a given radius of a GPS coordinate.',
    inputSchema: {
      type: 'object',
      required: ['lat', 'lng'],
      properties: {
        lat: { type: 'number', description: 'Latitude in decimal degrees' },
        lng: { type: 'number', description: 'Longitude in decimal degrees' },
        radius_km: { type: 'number', description: 'Search radius in kilometres (default 5)' },
        category: { type: 'string', description: 'Optional category filter' },
      },
    },
  },
  {
    name: 'get_vendor_dashboard_summary',
    permission: 'orders.read',
    description: 'Aggregate sales and order statistics for a vendor.',
    inputSchema: {
      type: 'object',
      required: ['vendor_id'],
      properties: {
        vendor_id: { type: 'string', description: 'Vendor user UUID' },
        from_date: { type: 'string', description: 'ISO-8601 start date for aggregation window' },
        to_date: { type: 'string', description: 'ISO-8601 end date for aggregation window' },
      },
    },
  },
  // ── WRITE ───────────────────────────────────────────────────────────────────
  {
    name: 'update_order_status',
    permission: 'orders.write',
    description: 'Update the status of an existing order (e.g. mark as shipped, completed, cancelled).',
    inputSchema: {
      type: 'object',
      required: ['order_id', 'status'],
      properties: {
        order_id: { type: 'string', description: 'Order UUID' },
        status: {
          type: 'string',
          enum: ['pending', 'pending_approval', 'approved', 'shipped', 'ready_for_delivery', 'out_for_delivery', 'completed', 'cancelled'],
        },
        tracking_number: { type: 'string', description: 'Carrier tracking number (optional)' },
        notes: { type: 'string', description: 'Internal admin notes' },
      },
    },
  },
  {
    name: 'create_order',
    permission: 'orders.write',
    description: 'Create a new order for a customer with one or more product items.',
    inputSchema: {
      type: 'object',
      required: ['customer_id', 'items'],
      properties: {
        customer_id: { type: 'string', description: 'Customer user UUID' },
        items: {
          type: 'array',
          description: 'Order line items',
          items: {
            type: 'object',
            required: ['productId', 'quantity', 'unitPrice'],
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number', description: 'Unit price in XOF' },
              name: { type: 'string', description: 'Product name (for the snapshot)' },
            },
          },
        },
        payment_method: { type: 'string', description: 'wave | orange_money | mtn_momo | cash_on_delivery | bank_transfer | card | paypal | net30' },
        delivery_type: { type: 'string', description: 'home | drone | relay_point | store_pickup (default home)' },
        shipping_address: { type: 'object', description: 'Delivery address JSONB' },
        notes: { type: 'string' },
        customer_type: { type: 'string', description: 'B2C | B2B (default B2C)' },
        company_id: { type: 'string', description: 'Company UUID for B2B orders' },
        shipping_cost: { type: 'number', description: 'Shipping cost in XOF (default 0)' },
      },
    },
  },
  {
    name: 'update_stock',
    permission: 'products.write',
    description: 'Set or adjust the stock quantity of a product.',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string', description: 'Product UUID' },
        stock_quantity: { type: 'number', description: 'New absolute stock quantity (mutually exclusive with delta)' },
        delta: { type: 'number', description: 'Signed quantity change (+N to add, -N to deduct). Ignored if stock_quantity is set.' },
      },
    },
  },
  {
    name: 'process_refund',
    permission: 'orders.write',
    description: 'Open a Trade Assurance dispute and mark the order payment as refunded.',
    inputSchema: {
      type: 'object',
      required: ['order_id', 'opened_by', 'reason'],
      properties: {
        order_id: { type: 'string', description: 'Order UUID' },
        opened_by: { type: 'string', description: 'UUID of the user requesting the refund' },
        reason: { type: 'string', description: 'Short reason (e.g. "item not received")' },
        description: { type: 'string', description: 'Detailed description' },
        refund_amount: { type: 'number', description: 'Refund amount in XOF (defaults to order total)' },
      },
    },
  },
  {
    name: 'send_customer_message',
    permission: 'messages.write',
    description: 'Send a message from a sender to a customer. Finds or creates the conversation automatically.',
    inputSchema: {
      type: 'object',
      required: ['sender_id', 'customer_id', 'content'],
      properties: {
        sender_id: { type: 'string', description: 'UUID of the message sender' },
        customer_id: { type: 'string', description: 'UUID of the recipient (customer)' },
        content: { type: 'string', description: 'Message text' },
        type: { type: 'string', enum: ['text', 'quote', 'image', 'file'], description: 'Message type (default text)' },
        metadata: { type: 'object', description: 'Optional metadata (e.g. file_url, quoted_message_id)' },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────────────────────

async function runTool(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {

    // ── search_products ──────────────────────────────────────────────────────
    case 'search_products': {
      const limit = Math.min(Number(args.limit ?? 20), 100);
      const offset = Number(args.offset ?? 0);
      let q = db.from('products')
        .select('id, name_i18n, category, price_public, price_wholesale, stock_quantity, rating, review_count, images, tags, vendor_id, is_active, created_at')
        .eq('is_active', true)
        .range(offset, offset + limit - 1);
      if (args.category) q = q.eq('category', String(args.category));
      if (args.vendor_id) q = q.eq('vendor_id', String(args.vendor_id));
      if (args.min_price !== undefined) q = q.gte('price_public', Number(args.min_price));
      if (args.max_price !== undefined) q = q.lte('price_public', Number(args.max_price));
      if (args.query) {
        // tags array-contains OR name_i18n fr/en text match
        q = q.or(
          `tags.cs.{${String(args.query)}},name_i18n->>fr.ilike.%${String(args.query)}%,name_i18n->>en.ilike.%${String(args.query)}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { products: data, count: data?.length ?? 0, offset, limit };
    }

    // ── get_product_details ──────────────────────────────────────────────────
    case 'get_product_details': {
      const { data: product, error } = await db
        .from('products').select('*').eq('id', String(args.product_id)).single();
      if (error) throw new Error('Product not found');

      let reviews = null;
      if (args.include_reviews !== false) {
        const { data: rv } = await db
          .from('reviews')
          .select('id, user_id, rating, comment, verified, created_at')
          .eq('product_id', String(args.product_id))
          .order('created_at', { ascending: false })
          .limit(10);
        reviews = rv;
      }
      return { product, reviews };
    }

    // ── get_order_status ─────────────────────────────────────────────────────
    case 'get_order_status': {
      const orderId = String(args.order_id);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const q = isUuid
        ? db.from('orders').select('*').eq('id', orderId).single()
        : db.from('orders').select('*').eq('order_number', orderId).single();
      const { data, error } = await q;
      if (error) throw new Error('Order not found');
      return { order: data };
    }

    // ── list_orders_by_customer ──────────────────────────────────────────────
    case 'list_orders_by_customer': {
      const limit = Math.min(Number(args.limit ?? 20), 100);
      const offset = Number(args.offset ?? 0);
      let q = db.from('orders')
        .select('id, order_number, status, total, payment_status, payment_method, delivery_type, tracking_number, created_at, updated_at')
        .eq('customer_id', String(args.customer_id))
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (args.status) q = q.eq('status', String(args.status));
      if (args.from_date) q = q.gte('created_at', String(args.from_date));
      if (args.to_date) q = q.lte('created_at', String(args.to_date));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { orders: data, count: data?.length ?? 0, offset, limit };
    }

    // ── check_stock ──────────────────────────────────────────────────────────
    case 'check_stock': {
      const ids = (args.product_ids as string[]).slice(0, 50);
      const { data, error } = await db
        .from('products')
        .select('id, name_i18n, stock_quantity, is_active')
        .in('id', ids);
      if (error) throw new Error(error.message);
      return { stock: data };
    }

    // ── nearby_shops ─────────────────────────────────────────────────────────
    case 'nearby_shops': {
      const { data, error } = await db.rpc('nearby_shops', {
        user_lat: Number(args.lat),
        user_lng: Number(args.lng),
        radius_km: Number(args.radius_km ?? 5),
        filter_category: args.category ? String(args.category) : null,
      });
      if (error) throw new Error(error.message);
      return { shops: data, count: (data as unknown[])?.length ?? 0 };
    }

    // ── get_vendor_dashboard_summary ─────────────────────────────────────────
    case 'get_vendor_dashboard_summary': {
      const vendorId = String(args.vendor_id);

      // Fetch vendor profile
      const { data: vendor } = await db
        .from('vendors')
        .select('id, company_name, kyc_status, verified, total_sales, avg_rating, response_rate')
        .eq('id', vendorId)
        .single();

      // Fetch orders that contain this vendor's products
      // items column is required for vendor-product matching below
      let ordersQ = db.from('orders')
        .select('id, status, total, payment_status, created_at, items')
        .order('created_at', { ascending: false });
      if (args.from_date) ordersQ = ordersQ.gte('created_at', String(args.from_date));
      if (args.to_date) ordersQ = ordersQ.lte('created_at', String(args.to_date));
      const { data: allOrders } = await ordersQ;

      // Fetch this vendor's products to identify their orders
      const { data: products } = await db
        .from('products')
        .select('id, name_i18n, stock_quantity, rating, review_count, is_active')
        .eq('vendor_id', vendorId);

      const productIds = new Set((products ?? []).map((p: { id: string }) => p.id));

      // Filter orders that mention vendor's products
      const vendorOrders = (allOrders ?? []).filter((o: { items?: unknown }) => {
        try {
          const items = Array.isArray(o.items) ? o.items : JSON.parse(String(o.items ?? '[]'));
          return items.some((item: { productId?: string }) => productIds.has(item.productId ?? ''));
        } catch { return false; }
      });

      const totalRevenue = vendorOrders.reduce((sum: number, o: { total?: number }) => sum + (o.total ?? 0), 0);
      const byStatus = vendorOrders.reduce((acc: Record<string, number>, o: { status?: string }) => {
        acc[o.status ?? 'unknown'] = (acc[o.status ?? 'unknown'] ?? 0) + 1;
        return acc;
      }, {});

      return {
        vendor,
        summary: {
          total_orders: vendorOrders.length,
          total_revenue_xof: totalRevenue,
          orders_by_status: byStatus,
          total_products: products?.length ?? 0,
          active_products: (products ?? []).filter((p: { is_active?: boolean }) => p.is_active).length,
        },
        products: products?.slice(0, 20),
      };
    }

    // ── update_order_status ──────────────────────────────────────────────────
    case 'update_order_status': {
      const patch: Record<string, unknown> = { status: String(args.status) };
      if (args.tracking_number) patch.tracking_number = String(args.tracking_number);
      if (args.notes) patch.notes = String(args.notes);
      if (args.status === 'completed') patch.delivered_at = new Date().toISOString();

      const { data, error } = await db.from('orders')
        .update(patch)
        .eq('id', String(args.order_id))
        .select('id, order_number, status, tracking_number, updated_at')
        .single();
      if (error) throw new Error(error.message);
      return { order: data, updated: true };
    }

    // ── create_order ─────────────────────────────────────────────────────────
    case 'create_order': {
      const items = args.items as Array<{ productId: string; quantity: number; unitPrice: number; name?: string }>;
      const shippingCost = Number(args.shipping_cost ?? 0);
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const total = subtotal + shippingCost;

      const { data, error } = await db.from('orders').insert({
        customer_id: String(args.customer_id),
        customer_type: String(args.customer_type ?? 'B2C'),
        company_id: args.company_id ? String(args.company_id) : null,
        items: JSON.stringify(items),
        subtotal,
        shipping_cost: shippingCost,
        tax_amount: 0,
        total,
        payment_method: args.payment_method ? String(args.payment_method) : null,
        delivery_type: String(args.delivery_type ?? 'home'),
        shipping_address: args.shipping_address ?? null,
        notes: args.notes ? String(args.notes) : null,
        status: 'pending',
        payment_status: 'pending',
      }).select('id, order_number, status, total, created_at').single();
      if (error) throw new Error(error.message);
      return { order: data, created: true };
    }

    // ── update_stock ─────────────────────────────────────────────────────────
    case 'update_stock': {
      const productId = String(args.product_id);
      let newQty: number;

      if (args.stock_quantity !== undefined) {
        newQty = Number(args.stock_quantity);
      } else if (args.delta !== undefined) {
        // Fetch current stock
        const { data: cur, error: curErr } = await db
          .from('products').select('stock_quantity').eq('id', productId).single();
        if (curErr) throw new Error('Product not found');
        newQty = Math.max(0, Number(cur.stock_quantity) + Number(args.delta));
      } else {
        throw new Error('Provide stock_quantity (absolute) or delta (relative)');
      }

      const { data, error } = await db.from('products')
        .update({ stock_quantity: newQty })
        .eq('id', productId)
        .select('id, name_i18n, stock_quantity, updated_at')
        .single();
      if (error) throw new Error(error.message);
      return { product: data, updated: true };
    }

    // ── process_refund ───────────────────────────────────────────────────────
    case 'process_refund': {
      const orderId = String(args.order_id);

      // Get order total for default refund_amount
      const { data: order, error: orderErr } = await db
        .from('orders').select('id, total, payment_status').eq('id', orderId).single();
      if (orderErr) throw new Error('Order not found');

      const refundAmount = args.refund_amount !== undefined
        ? Number(args.refund_amount)
        : Number(order.total);

      // Open Trade Assurance dispute
      const { data: dispute, error: dErr } = await db.from('disputes').insert({
        order_id: orderId,
        opened_by: String(args.opened_by),
        status: 'open',
        reason: String(args.reason),
        description: args.description ? String(args.description) : null,
        refund_amount: refundAmount,
      }).select('id, status, reason, refund_amount, created_at').single();
      if (dErr) throw new Error(dErr.message);

      // Mark order payment as refunded
      await db.from('orders').update({ payment_status: 'refunded' }).eq('id', orderId);

      return {
        dispute,
        order_id: orderId,
        payment_status: 'refunded',
        refund_amount: refundAmount,
      };
    }

    // ── send_customer_message ────────────────────────────────────────────────
    case 'send_customer_message': {
      const senderId = String(args.sender_id);
      const customerId = String(args.customer_id);

      // Find or create conversation between sender and customer
      const { data: existingConvs } = await db
        .from('conversations')
        .select('id, participants')
        .contains('participants', [senderId, customerId]);

      let conversationId: string;
      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else {
        const { data: newConv, error: convErr } = await db
          .from('conversations')
          .insert({ participants: [senderId, customerId] })
          .select('id')
          .single();
        if (convErr) throw new Error(convErr.message);
        conversationId = newConv.id;
      }

      // Insert message
      const { data: msg, error: msgErr } = await db.from('messages').insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: String(args.content),
        type: String(args.type ?? 'text'),
        metadata: (args.metadata as object) ?? {},
      }).select('id, conversation_id, sender_id, content, type, created_at').single();
      if (msgErr) throw new Error(msgErr.message);

      // Update conversation last_message
      await db.from('conversations').update({
        last_message: String(args.content).slice(0, 200),
        last_msg_at: new Date().toISOString(),
      }).eq('id', conversationId);

      return { message: msg, conversation_id: conversationId, sent: true };
    }

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { rpcCode: -32601 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main request handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Only POST is accepted' }), {
      status: 405,
      headers: CORS,
    });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let rpc: JsonRpcRequest;
  try {
    rpc = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error: invalid JSON');
  }
  if (rpc.jsonrpc !== '2.0' || !rpc.method) {
    return rpcError(rpc?.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request');
  }

  const id = rpc.id ?? null;

  // ── Supabase client (service role bypasses RLS) ─────────────────────────────
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ── API key authentication ──────────────────────────────────────────────────
  const rawKey =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!rawKey) {
    return rpcError(id, -32001, 'Authentication required — provide X-API-Key header or Authorization: Bearer <key>');
  }

  const { data: keyData } = await db
    .from('api_keys')
    .select('id, permissions')
    .eq('key', rawKey)
    .eq('active', true)
    .single<ApiKeyRecord>();

  if (!keyData) {
    return rpcError(id, -32001, 'Invalid or inactive API key');
  }

  const permissions: string[] = keyData.permissions ?? [];

  // Fire-and-forget: update last_used
  db.from('api_keys')
    .update({ last_used: new Date().toISOString() })
    .eq('id', keyData.id);

  // ── MCP protocol ───────────────────────────────────────────────────────────

  // initialize — MCP handshake
  if (rpc.method === 'initialize') {
    return rpcSuccess(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'bardec-mcp', version: '1.0.0' },
    });
  }

  // tools/list — filtered by caller's permissions
  if (rpc.method === 'tools/list') {
    const visible = TOOLS.filter(t => permissions.includes(t.permission));
    return rpcSuccess(id, {
      tools: visible.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  }

  // tools/call — dispatch
  if (rpc.method === 'tools/call') {
    const p = (rpc.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const toolName = p.name;
    const toolArgs = p.arguments ?? {};

    if (!toolName) return rpcError(id, -32602, 'Missing params.name');

    const toolDef = TOOLS.find(t => t.name === toolName);
    if (!toolDef) return rpcError(id, -32601, `Unknown tool: ${toolName}`);

    if (!permissions.includes(toolDef.permission)) {
      return rpcError(
        id, -32003,
        `Forbidden: your API key does not have the '${toolDef.permission}' permission`,
      );
    }

    let result: unknown = null;
    let toolError: string | null = null;

    try {
      result = await runTool(db, toolName, toolArgs);
    } catch (err) {
      toolError = err instanceof Error ? err.message : String(err);
    }

    // Audit log (fire-and-forget)
    db.from('audit_logs').insert({
      action: `mcp.${toolName}`,
      user_agent: 'MCP-Client',
      details: {
        api_key_id: keyData.id,
        params: toolArgs,
        success: toolError === null,
        ...(toolError ? { error: toolError } : {}),
      },
    });

    if (toolError !== null) {
      return rpcError(id, -32000, toolError);
    }

    return rpcSuccess(id, {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    });
  }

  return rpcError(id, -32601, `Method not found: ${rpc.method}`);
});
