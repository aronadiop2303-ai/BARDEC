# BARDEC MCP Server

**Protocol**: JSON-RPC 2.0 over HTTP (stateless POST)  
**Runtime**: Supabase Edge Function (Deno)  
**Auth**: `X-API-Key` header **or** `Authorization: Bearer bdc_xxx`

---

## Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/mcp-server
```

---

## Deployment

```bash
supabase functions deploy mcp-server --project-ref <YOUR_PROJECT_REF>
```

No additional secrets need to be set — the function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Edge Function environment automatically.

---

## Create API Keys (run in Supabase SQL Editor)

### Full access key (read + write)

```sql
INSERT INTO api_keys (name, permissions)
VALUES (
  'My AI Agent — Full access',
  ARRAY[
    'products.read', 'products.write',
    'orders.read',   'orders.write',
    'messages.read', 'messages.write'
  ]
)
RETURNING id, key, permissions;
```

### Read-only key

```sql
INSERT INTO api_keys (name, permissions)
VALUES (
  'Analytics Bot — Read-only',
  ARRAY['products.read', 'orders.read', 'messages.read']
)
RETURNING id, key, permissions;
```

### Revoke a key

```sql
UPDATE api_keys SET active = false WHERE id = '<key-uuid>';
```

### View audit trail

```sql
SELECT action, details, created_at
FROM audit_logs
WHERE action LIKE 'mcp.%'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 12 Tools

### READ (7) — require `*.read` permission

| Tool | Permission | Description |
|---|---|---|
| `search_products` | `products.read` | Free-text search + filters on the product catalog |
| `get_product_details` | `products.read` | Full product data + recent reviews |
| `get_order_status` | `orders.read` | Order details by UUID or order number |
| `list_orders_by_customer` | `orders.read` | Order history for a customer |
| `check_stock` | `products.read` | Stock levels for up to 50 products |
| `nearby_shops` | `products.read` | Proximity shops sorted by distance (GPS) |
| `get_vendor_dashboard_summary` | `orders.read` | Sales & order aggregation for a vendor |

### WRITE (5) — require `*.write` permission

| Tool | Permission | Description |
|---|---|---|
| `update_order_status` | `orders.write` | Change order status (shipped, completed, cancelled…) |
| `create_order` | `orders.write` | Create a new order with line items |
| `update_stock` | `products.write` | Set absolute stock or apply a signed delta |
| `process_refund` | `orders.write` | Open a Trade Assurance dispute + mark order refunded |
| `send_customer_message` | `messages.write` | Send a message; auto-creates conversation if needed |

---

## JSON-RPC 2.0 Wire Format

Every request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": { "...": "..." }
  }
}
```

Success response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{\"order\": {...}}" }]
  }
}
```

Error response (HTTP 200 — errors are in the body per the spec):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": { "code": -32001, "message": "Invalid or inactive API key" }
}
```

### Error codes

| Code | Meaning |
|---|---|
| -32700 | Parse error — invalid JSON |
| -32600 | Invalid JSON-RPC 2.0 request |
| -32601 | Method or tool not found |
| -32602 | Missing required parameter |
| -32001 | Authentication required / invalid key |
| -32003 | Forbidden — insufficient permissions |
| -32000 | Tool execution error (see message) |

---

## curl Examples

### Discover available tools

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .
```

### Search products

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_products",
      "arguments": { "query": "riz", "category": "Alimentation", "limit": 5 }
    }
  }' | jq .
```

### Check order status

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_order_status",
      "arguments": { "order_id": "BDC-2025-001042" }
    }
  }' | jq .
```

### Find nearby shops (Dakar Plateau)

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 4,
    "method": "tools/call",
    "params": {
      "name": "nearby_shops",
      "arguments": { "lat": 14.6928, "lng": -17.4467, "radius_km": 3 }
    }
  }' | jq .
```

### Mark order as shipped

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 5,
    "method": "tools/call",
    "params": {
      "name": "update_order_status",
      "arguments": {
        "order_id": "uuid-here",
        "status": "shipped",
        "tracking_number": "DHL-9876543210"
      }
    }
  }' | jq .
```

### Deduct 2 units of stock

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 6,
    "method": "tools/call",
    "params": {
      "name": "update_stock",
      "arguments": { "product_id": "uuid-here", "delta": -2 }
    }
  }' | jq .
```

### Open a refund

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bdc_your_key_here" \
  -d '{
    "jsonrpc": "2.0", "id": 7,
    "method": "tools/call",
    "params": {
      "name": "process_refund",
      "arguments": {
        "order_id": "uuid-here",
        "opened_by": "customer-uuid-here",
        "reason": "Item not received",
        "description": "30 days elapsed, parcel lost in transit."
      }
    }
  }' | jq .
```

---

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bardec": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://<project-ref>.supabase.co/functions/v1/mcp-server"
      ],
      "env": {
        "API_KEY": "bdc_your_key_here"
      },
      "headers": {
        "X-API-Key": "${API_KEY}"
      }
    }
  }
}
```

Restart Claude Desktop — BARDEC tools will appear in the tool panel (🔧).

---

## LangChain / LangGraph Agent (Python)

```python
import httpx, json

BARDEC_MCP = "https://<project-ref>.supabase.co/functions/v1/mcp-server"
API_KEY = "bdc_your_key_here"

def call_bardec_tool(tool_name: str, arguments: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    resp = httpx.post(
        BARDEC_MCP,
        json=payload,
        headers={"X-API-Key": API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if "error" in body:
        raise RuntimeError(body["error"]["message"])
    return json.loads(body["result"]["content"][0]["text"])

# Usage
products = call_bardec_tool("search_products", {"query": "mangue", "limit": 5})
print(products)
```

---

## signUp → signIn Flow (Mobile App)

The mobile app (`AuthContext.tsx`) handles both demo mode and live Supabase:

**Demo mode** (no `EXPO_PUBLIC_SUPABASE_URL` set): any credentials work, roles switch via the role-switcher UI. No server calls.

**Live mode** (Supabase configured):

1. **Register**: `supabase.auth.signUp()` → inserts `users` row → optionally creates `companies` row (B2B).
2. **Email confirmation**: if `data.session` is `null` after signUp, the app returns `{ error: 'CONFIRM_EMAIL' }`. The UI should prompt the user to check their inbox.
3. **Disable email confirmation** (development / testing): in Supabase Dashboard → **Authentication → Providers → Email** → uncheck **"Enable email confirmations"**. After this, `signUp` returns a session immediately and registration is seamless.
4. **Auto-profile trigger** (recommended): the `users` table INSERT in step 1 relies on the client code calling `supabase.from('users').insert(...)` after signUp. If you want a server-side fallback, add a Supabase Database trigger on `auth.users` INSERT that copies `raw_user_meta_data` into `public.users`.
5. **Login**: `supabase.auth.signInWithPassword()` → `onAuthStateChange` fires → `fetchUserProfile()` loads the `users` row → `user` state is set.

**Action required** for a smooth first-run experience:  
→ Disable email confirmation in the Supabase Dashboard (Authentication → Providers → Email).
