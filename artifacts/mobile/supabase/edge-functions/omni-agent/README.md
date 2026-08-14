# OMNI Agent — Setup Guide

**Runtime**: Supabase Edge Function (Deno), `verify_jwt: true`
**Endpoint**: `POST https://asawazxocogumygptdwh.supabase.co/functions/v1/omni-agent`
**Model**: provider-agnostic — see [Model Layer](#model-layer) below.

OMNI is BARDEC's conversational AI assistant. It keeps a per-user conversation
history in Supabase (3 normalized tables) and can call BARDEC catalog/order/shop
tools through the `mcp-server` edge function.

> Note (2026-08-14): this file previously documented an older, single-table,
> OpenAI-based design (`omni_conversations` with a JSONB `messages` column).
> That was never what got deployed. This version matches what is actually
> live — verified directly against the deployed function source and the
> production `omni_*` table schema.

---

## Model Layer

`lib/model-layer.ts` decouples OMNI from any single model provider — the
original blocker was being hard-stuck when the Anthropic account ran out of
credit. Two provider shapes exist today, both "ExternalModel" (hosted APIs
over HTTP); `ModelProvider` is the interface any future LocalModel /
HuggingFaceModel / FutureOmniModel provider would implement to plug into the
same chain:

- **Anthropic-shaped** — Anthropic itself, and DeepSeek's Anthropic-compatible
  endpoint (`https://api.deepseek.com/anthropic`). Identical request/response
  format (Messages API, `x-api-key`/`anthropic-version` headers) — just a
  different base URL, key, and model name. No translation needed.
- **OpenAI-shaped** — OpenRouter (Chat Completions format). Translated both
  ways: request (content-block messages/tools → OpenAI messages/function-tools)
  and response (`choices[0].message` → content blocks).

**Routing**: `MODEL_PROVIDER` secret (`anthropic` | `deepseek` | `openrouter`),
if set, forces that one provider with no fallback — useful for isolating a
provider during testing. Unset (default): automatic fallback chain, skipping
any provider whose key isn't configured, falling through to the next on
failure — **DeepSeek (free tier) → OpenRouter (backup) → Anthropic (paid,
last resort)**.

### Secrets

Set these under **Supabase Dashboard → Edge Functions → omni-agent → Secrets**.
At least one of `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY`
must be set, or every request fails immediately with "no provider configured".

| Secret | Required | Value |
|---|---|---|
| `DEEPSEEK_API_KEY` | For the DeepSeek path (free tier, tried first) | Generated at platform.deepseek.com — sensitive, provided out-of-band. |
| `DEEPSEEK_MODEL` | Optional | Default `deepseek-v4-flash`. DeepSeek's model names churn fast (`deepseek-chat`/`deepseek-reasoner` were deprecated 2026-07-24) — override here if the default goes stale. |
| `OPENROUTER_API_KEY` | For the OpenRouter path (backup) | Generated at openrouter.ai — sensitive, provided out-of-band. |
| `OPENROUTER_MODEL` | Optional | Default `deepseek/deepseek-chat` — check which free/cheap models are actually available on your OpenRouter account and adjust. |
| `MODEL_PROVIDER` | Optional | Forces a single provider (`anthropic`/`deepseek`/`openrouter`); omit for automatic fallback. |
| `ANTHROPIC_API_KEY` | For the Anthropic path (paid, last resort) | A real Anthropic API key — sensitive, provided out-of-band. |
| `OMNI_MODEL` | Optional | Anthropic model name, default `claude-sonnet-5`. |
| `MCP_SERVER_URL` | For tool use (search/stock/order lookups) | `https://asawazxocogumygptdwh.supabase.co/functions/v1/mcp-server` |
| `OMNI_MCP_API_KEY` | For tool use | The `api_keys` row named `omni-agent-v0.1` (read-only permissions) — copy its `key` column value from the `api_keys` table. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically by the
Supabase runtime.

Without `MCP_SERVER_URL`/`OMNI_MCP_API_KEY`, chat replies still work once a
model provider is configured — tool calls (search a product, check an order
status, etc.) just fail individually and the model is told the tool errored,
so it answers from general knowledge instead.

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
