# OMNI Agent — Setup Guide

**Runtime**: Supabase Edge Function (Deno)  
**Endpoint**: `POST https://<project-ref>.supabase.co/functions/v1/omni-agent`

OMNI is BARDEC's conversational AI assistant. It keeps a per-user conversation history in Supabase so context survives between sessions.

---

## Prerequisites

Two one-time setup steps are required before the function works correctly. Skip either and OMNI will return a 503 (missing API key) or forget every conversation (missing table).

---

## Step 1 — Apply the database migration

OMNI stores conversation history in an `omni_conversations` table. Run the migration **once** in the Supabase SQL Editor:

1. Open **Supabase Dashboard → SQL Editor**
2. Paste and run the contents of [`../../omni_conversations_schema.sql`](../../omni_conversations_schema.sql):

```sql
-- ═══════════════════════════════════════════════════════════════
-- OMNI AI Conversations table
-- Run this in the Supabase SQL editor to enable OMNI chat history.
--
-- Note: only authenticated users get persistent history.
-- Anonymous callers receive AI replies but no conversation is stored.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS omni_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_omni_conv_user
  ON omni_conversations(user_id);

-- Row-level security: each user sees only their own conversations.
ALTER TABLE omni_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omni_conv_owner" ON omni_conversations
  FOR ALL
  USING (user_id = auth.uid());
```

**Without this table**, every request silently falls back to an empty history — OMNI replies but never remembers anything.

---

## Step 2 — Set the OPENAI_API_KEY secret

The function calls OpenAI's `gpt-4o-mini` model. It reads the key from the Supabase Edge Function secrets environment, **not** from the app's `.env`.

1. Open **Supabase Dashboard → Project Settings → Edge Functions → Secrets**
2. Add a secret named exactly `OPENAI_API_KEY` with your OpenAI API key as the value
3. Click **Save**

**Without this secret**, every request returns:

```json
{ "error": "OPENAI_API_KEY not configured" }
```

with HTTP status `503`.

---

## Deploy

```bash
supabase functions deploy omni-agent --project-ref <YOUR_PROJECT_REF>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase runtime — no extra configuration needed beyond the `OPENAI_API_KEY` secret above.

---

## Request format

```json
{
  "conversation_id": "<uuid or omit to start new>",
  "message": "Où en est ma commande BDC-2025-001042 ?",
  "context": {
    "type": "order",
    "data": { "order_id": "...", "status": "pending", "..." : "..." }
  },
  "stream": true
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | ✅ | The user's message |
| `conversation_id` | UUID | — | Omit to start a new conversation |
| `context` | object | — | Injects product / order / shop data into the system prompt |
| `stream` | boolean | — | `true` → Server-Sent Events; `false` (default) → JSON |

---

## Response formats

### Streaming (`stream: true`) — Server-Sent Events

```
data: {"chunk":"Votre commande"}
data: {"chunk":" est en cours de traitement."}
data: {"done":true,"conversation_id":"<uuid>"}
```

On error:

```
data: {"error":"OpenAI error 429: ..."}
```

### Non-streaming (`stream: false`) — JSON

```json
{ "reply": "Votre commande est en cours de traitement.", "conversation_id": "<uuid>" }
```

---

## Conversation persistence

- **Authenticated users** (valid Supabase JWT): conversation is stored and reloaded on subsequent requests. Pass the returned `conversation_id` to continue the thread.
- **Anonymous callers**: OMNI replies normally but nothing is persisted. `conversation_id` is `null` in the response.
- History is trimmed to the last **30 messages** before writing to avoid unbounded growth.
- The service-role client always filters by `user_id` — a user cannot read or write another user's conversations even without RLS.

---

## Authorization

Pass the user's Supabase JWT as a Bearer token to get persistent history:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/omni-agent \
  -H "Authorization: Bearer <supabase-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Bonjour OMNI !", "stream": false}'
```

Without the `Authorization` header the request still succeeds — OMNI replies but nothing is stored.
