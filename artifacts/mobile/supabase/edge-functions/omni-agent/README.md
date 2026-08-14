# OMNI Agent — Setup Guide

**Runtime**: Supabase Edge Function (Deno), `verify_jwt: true`
**Endpoint**: `POST https://asawazxocogumygptdwh.supabase.co/functions/v1/omni-agent`
**Model**: Anthropic Claude (`OMNI_MODEL` secret, default `claude-sonnet-5`)

OMNI is BARDEC's conversational AI assistant. It keeps a per-user conversation
history in Supabase (3 normalized tables) and can call BARDEC catalog/order/shop
tools through the `mcp-server` edge function.

> Note (2026-08-14): this file previously documented an older, single-table,
> OpenAI-based design (`omni_conversations` with a JSONB `messages` column).
> That was never what got deployed. This version matches what is actually
> live — verified directly against the deployed function source and the
> production `omni_*` table schema.

---

## Prerequisites — 3 secrets, all missing as of 2026-08-14

Set these under **Supabase Dashboard → Edge Functions → omni-agent → Secrets**.
Without `ANTHROPIC_API_KEY`, every request fails after the user's message is
already saved (confirmed: `omni_messages` in production only ever has `role:
'user'` rows, never `'assistant'` — the Claude call throws before a reply is
generated).

| Secret | Required | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | A real Anthropic API key — sensitive, provided out-of-band by the project owner. |
| `MCP_SERVER_URL` | For tool use (search/stock/order lookups) | `https://asawazxocogumygptdwh.supabase.co/functions/v1/mcp-server` |
| `OMNI_MCP_API_KEY` | For tool use | The `api_keys` row named `omni-agent-v0.1` (read-only permissions) — copy its `key` column value from the `api_keys` table. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically by the
Supabase runtime.

Without `MCP_SERVER_URL`/`OMNI_MCP_API_KEY`, chat replies still work once
`ANTHROPIC_API_KEY` is set — tool calls (search a product, check an order
status, etc.) just fail individually and Claude is told the tool errored, so
it answers from general knowledge instead.

---

## Database

3 tables already exist in production with RLS (`user_id = auth.uid()`),
applied via migration `omni_tables_v01` (2026-08-02):

- `omni_conversations (id, user_id, title, created_at, updated_at)`
- `omni_messages (id, conversation_id, role, content, tool_calls jsonb, created_at)`
- `omni_memory (id, user_id, summary text, preferences jsonb, updated_at)` — one row per user, upserted on `user_id`

No migration needed — this part is done.

---

## Request format

```json
{
  "conversation_id": "<uuid, omit to start a new conversation>",
  "message": "Où en est ma commande BDC-2026-001042 ?"
}
```

No `stream` field — the function always returns a single JSON reply (no SSE).
No `context` field either — it isn't read server-side yet; the mobile client
no longer sends one (see `hooks/useOmniChat.ts` in the mobile app).

**Authorization**: a real Supabase user JWT is required (`Authorization: Bearer
<jwt>`). The anon key is rejected with 401 `"Session invalide ou expirée."` —
there is no anonymous mode in this version.

## Response format

```json
{ "conversation_id": "<uuid>", "reply": "Votre commande est en cours de traitement.", "tools_used": ["get_order_status"] }
```

On failure: `{ "error": "<message>" }` with a 4xx/5xx status.

---

## CORS

Browser calls (Vercel web build) are restricted to:
- `https://bardec-ard27.vercel.app`
- `https://bardec-aronadiop2303-6278-ard27.vercel.app`

Native mobile requests (Expo Go, standalone app) aren't subject to CORS —
this only matters for the web build.

---

## Deploy

Deployed via the Supabase MCP `deploy_edge_function` tool (no local
`supabase` CLI session configured on this machine). To redeploy from the
CLI instead:

```bash
supabase functions deploy omni-agent --project-ref asawazxocogumygptdwh
```
