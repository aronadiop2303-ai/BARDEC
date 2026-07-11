/**
 * BARDEC Webhook System
 *
 * Architecture ouverte pour intégrations futures:
 * - Make / n8n / Zapier
 * - CrewAI / LangGraph (agents IA)
 * - ERP / CRM externes
 *
 * Les webhooks sortants notifient une URL externe lors d'événements clés.
 * Les webhooks entrants permettent de créer/modifier des données depuis l'extérieur.
 */

import { supabase } from './supabase';

export type WebhookEvent =
  | 'order.created'
  | 'order.approved'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.cancelled'
  | 'order.disputed'
  | 'user.registered'
  | 'vendor.approved'
  | 'vendor.rejected'
  | 'message.new'
  | 'payment.completed'
  | 'review.created'
  | 'dispute.opened'
  | 'dispute.resolved';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  version: '1.0';
  data: Record<string, unknown>;
  metadata?: {
    source: 'bardec';
    environment: 'production' | 'development';
    userId?: string;
  };
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  retryCount: number;
}

// ─────────────────────────────────────────────
// OUTGOING: Fire webhook to external endpoints
// ─────────────────────────────────────────────

export async function fireWebhook(event: WebhookEvent, data: Record<string, unknown>, userId?: string): Promise<void> {
  if (!supabase) {
    console.log('[BARDEC Webhook] Demo mode — would fire:', event, data);
    return;
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    version: '1.0',
    data,
    metadata: {
      source: 'bardec',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      userId,
    },
  };

  // In production, this calls a Supabase Edge Function that dispatches to registered endpoints
  await supabase.functions.invoke('fire-webhook', { body: payload });
}

// ─────────────────────────────────────────────
// OUTGOING: Convenience wrappers per event
// ─────────────────────────────────────────────

export const webhooks = {
  orderCreated: (order: Record<string, unknown>, userId?: string) =>
    fireWebhook('order.created', order, userId),

  orderApproved: (orderId: string, approverId: string) =>
    fireWebhook('order.approved', { orderId, approverId }),

  orderShipped: (orderId: string, trackingNumber: string, carrier: string) =>
    fireWebhook('order.shipped', { orderId, trackingNumber, carrier }),

  orderDelivered: (orderId: string, signatureUrl?: string) =>
    fireWebhook('order.delivered', { orderId, signatureUrl }),

  vendorApproved: (vendorId: string, adminId: string) =>
    fireWebhook('vendor.approved', { vendorId, adminId }),

  disputeOpened: (disputeId: string, orderId: string, reason: string) =>
    fireWebhook('dispute.opened', { disputeId, orderId, reason }),

  disputeResolved: (disputeId: string, resolution: string, refundAmount?: number) =>
    fireWebhook('dispute.resolved', { disputeId, resolution, refundAmount }),
};

// ─────────────────────────────────────────────
// INCOMING: Process webhooks from external tools
// Endpoint: POST /api/webhooks/inbound (via Express API server)
// ─────────────────────────────────────────────

export async function processInboundWebhook(
  event: string,
  data: Record<string, unknown>,
  apiKey: string
): Promise<{ success: boolean; message: string }> {
  // Validate API key
  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    return { success: false, message: 'Invalid API key' };
  }

  switch (event) {
    case 'order.status_update':
      // External system (e.g., ERP) updates order status
      if (supabase && data.orderId && data.status) {
        await supabase.from('orders').update({ status: data.status }).eq('id', data.orderId);
      }
      return { success: true, message: 'Order status updated' };

    case 'product.sync':
      // External catalog sync
      if (supabase && data.products && Array.isArray(data.products)) {
        for (const product of data.products) {
          await supabase.from('products').upsert(product, { onConflict: 'external_id' });
        }
      }
      return { success: true, message: `${(data.products as unknown[])?.length ?? 0} products synced` };

    case 'inventory.update':
      // Stock update from warehouse system
      if (supabase && data.productId && typeof data.quantity === 'number') {
        await supabase.from('products')
          .update({ stock_quantity: data.quantity })
          .eq('id', data.productId);
      }
      return { success: true, message: 'Inventory updated' };

    default:
      return { success: false, message: `Unknown event: ${event}` };
  }
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!supabase) return apiKey === 'demo_key';
  const { data } = await supabase
    .from('api_keys')
    .select('id, active')
    .eq('key', apiKey)
    .eq('active', true)
    .single();
  return !!data;
}

// ─────────────────────────────────────────────
// REST API endpoints documentation
// Available at: GET /api/docs (via Express)
// ─────────────────────────────────────────────

export const API_DOCUMENTATION = {
  openapi: '3.0.0',
  info: {
    title: 'BARDEC REST API',
    version: '1.0.0',
    description: 'API REST publique BARDEC — B2B & B2C Marketplace',
  },
  servers: [{ url: '/api', description: 'BARDEC API' }],
  endpoints: [
    { method: 'GET', path: '/products', description: 'Liste des produits avec filtres', auth: 'api_key' },
    { method: 'GET', path: '/products/:id', description: 'Détail produit', auth: 'api_key' },
    { method: 'GET', path: '/orders', description: 'Liste des commandes', auth: 'bearer' },
    { method: 'GET', path: '/orders/:id', description: 'Détail commande', auth: 'bearer' },
    { method: 'POST', path: '/orders', description: 'Créer une commande', auth: 'bearer' },
    { method: 'PATCH', path: '/orders/:id/status', description: 'Mettre à jour statut commande', auth: 'admin' },
    { method: 'GET', path: '/users', description: 'Liste utilisateurs (admin)', auth: 'admin' },
    { method: 'POST', path: '/webhooks/inbound', description: 'Recevoir webhook entrant', auth: 'api_key' },
    { method: 'GET', path: '/docs', description: 'Documentation API (OpenAPI)', auth: 'none' },
  ],
};
