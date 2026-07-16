# BARDEC — Événements de commande en temps réel pour agents IA

Les agents IA externes n'ont pas besoin de faire du polling sur le MCP server pour savoir si une commande a changé de statut. La table `orders` est déjà publiée sur **Supabase Realtime** (`supabase_realtime` publication) — il suffit de s'y abonner via WebSocket avec la clé anon publique.

---

## Architecture

```
Agent IA (JS/Python)
    │
    ├─ POST /functions/v1/mcp-server   ← appels outils (lecture/écriture)
    │
    └─ WebSocket (Supabase Realtime)   ← écoute des changements en temps réel
           │
           └─ table: orders (INSERT + UPDATE)
              filtré par customer_id ou tout changement de statut
```

---

## Prérequis Supabase

Vérifier que la publication Realtime est active pour `orders` (déjà dans `schema.sql`) :

```sql
-- Doit retourner une ligne avec tablename = 'orders'
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'orders';
```

Si absent :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

---

## Exemple JavaScript — Abonnement Realtime

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://<project-ref>.supabase.co',
  '<SUPABASE_ANON_KEY>'   // clé publique anon (pas la service role key)
);

// ── Option A : tous les changements de commandes (INSERT + UPDATE) ──────────
const allOrdersChannel = supabase
  .channel('orders-all')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'orders' },
    (payload) => {
      console.log('[BARDEC] Order event:', payload.eventType);
      console.log('  Order ID   :', payload.new?.id ?? payload.old?.id);
      console.log('  New status :', payload.new?.status);
      console.log('  Old status :', payload.old?.status);

      // Déclencher une action agent selon le nouveau statut
      handleOrderChange(payload);
    }
  )
  .subscribe((status) => {
    console.log('[BARDEC] Realtime status:', status);
  });

// ── Option B : commandes d'un client spécifique ─────────────────────────────
const customerId = 'uuid-du-client';

const customerOrdersChannel = supabase
  .channel(`orders-customer-${customerId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `customer_id=eq.${customerId}`,
    },
    (payload) => {
      console.log(`[BARDEC] Order updated for customer ${customerId}:`, payload.new?.status);
    }
  )
  .subscribe();

// ── Option C : nouvelles commandes d'un vendeur (INSERT) ───────────────────
// Note: filtrer par vendor_id n'est pas possible directement (vendor n'est pas
// une colonne sur orders), mais vous pouvez filtrer sur proximity_shop_id :
const shopId = 'uuid-de-la-boutique';

const shopOrdersChannel = supabase
  .channel(`orders-shop-${shopId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: `proximity_shop_id=eq.${shopId}`,
    },
    (payload) => {
      console.log('[BARDEC] New proximity order received:', payload.new?.id);
      // Appeler le MCP server pour récupérer les détails complets
      callMcpTool('get_order_status', { order_id: payload.new.id })
        .then(details => console.log('Full order:', details));
    }
  )
  .subscribe();

// ── Fonction utilitaire : appel MCP tool depuis le même agent ───────────────
async function callMcpTool(toolName, args) {
  const response = await fetch(
    'https://<project-ref>.supabase.co/functions/v1/mcp-server',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'bdc_your_mcp_key_here',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    }
  );
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return JSON.parse(body.result.content[0].text);
}

// ── Handler exemple : réagir aux changements de statut ──────────────────────
async function handleOrderChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'UPDATE' && oldRow?.status !== newRow?.status) {
    switch (newRow.status) {
      case 'shipped':
        console.log(`📦 Order ${newRow.order_number} shipped. Tracking: ${newRow.tracking_number}`);
        // → Envoyer notification client, mettre à jour CRM, etc.
        break;
      case 'completed':
        console.log(`✅ Order ${newRow.order_number} delivered.`);
        // → Déclencher enquête satisfaction, facture finale, etc.
        break;
      case 'cancelled':
        console.log(`❌ Order ${newRow.order_number} cancelled.`);
        // → Rembourser via process_refund MCP tool si nécessaire
        break;
    }
  }

  if (eventType === 'INSERT') {
    console.log(`🛒 New order ${newRow.order_number} placed (${newRow.total} XOF)`);
  }
}

// ── Désabonnement propre ─────────────────────────────────────────────────────
// await supabase.removeChannel(allOrdersChannel);
```

---

## Exemple Python (avec `realtime-py`)

```bash
pip install realtime
```

```python
import asyncio
from realtime import AsyncRealtimeClient

SUPABASE_URL = "https://<project-ref>.supabase.co"
SUPABASE_ANON_KEY = "<SUPABASE_ANON_KEY>"

async def main():
    client = AsyncRealtimeClient(
        f"{SUPABASE_URL}/realtime/v1",
        SUPABASE_ANON_KEY,
    )
    await client.connect()

    channel = client.channel("orders-realtime")
    await channel.on_postgres_changes(
        event="*",
        schema="public",
        table="orders",
        callback=lambda payload: print("Order event:", payload),
    ).subscribe()

    # Garder la connexion ouverte
    await asyncio.sleep(3600)

asyncio.run(main())
```

---

## Notes de sécurité

- Utiliser la **clé anon** (`EXPO_PUBLIC_SUPABASE_ANON_KEY`) pour Realtime, **jamais** la service role key côté client.
- Les politiques RLS s'appliquent : sans session authentifiée, seules les données publiquement accessibles sont reçues. Pour un agent serveur qui doit tout voir, il peut utiliser un JWT signé avec la service role key comme `access_token` dans la connexion Realtime.
- Les filtres Realtime (`filter: 'customer_id=eq.xxx'`) nécessitent que la colonne soit indexée pour de bonnes performances — `idx_orders_customer` existe déjà dans `schema.sql`.

---

## Combiner Realtime + MCP (pattern recommandé)

```
1. Agent s'abonne à Realtime → reçoit l'événement brut (ID + statut)
2. Agent appelle get_order_status via MCP → récupère les détails complets
3. Agent réagit (CRM, notification, refund, etc.)
```

Ce pattern évite de surcharger le MCP server avec du polling, tout en gardant les outils MCP comme source de vérité pour les données détaillées.
