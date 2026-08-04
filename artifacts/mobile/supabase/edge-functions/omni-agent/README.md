# BARDEC OMNI Agent

Edge Function that powers **BARDEC AI / OMNI** (assistant commerce B2B & proximité).

**Runtime**: Supabase Edge Function (Deno)  
**Project**: `bardec` (Supabase)  
**Related UI**: `artifacts/mobile/app/chat-ai.tsx`

---

## What this function needs

| Requirement | Purpose |
|-------------|--------|
| Schema migration `omni_tables_v01` (or equivalent) | Tables / policies for chat history, agent context, rate limits |
| Secret `OPENAI_API_KEY` | Call OpenAI (e.g. GPT-4o-mini) from the Edge Function |
| Optional: `ANTHROPIC_API_KEY` | If the agent is wired to Claude instead of / in addition to OpenAI |
| Optional: `MCP_SERVER_URL` + `OMNI_MCP_API_KEY` | Call BARDEC MCP tools (orders, products, nearby shops) |

Never put API keys in the mobile app or in git. Only in **Supabase Edge Function Secrets**.

---

## 1. Schema migration

### Status in production

On the live Supabase project, migration **`omni_tables_v01`** may already appear under:

**Database → Migrations**

If it is already applied, you do **not** need to run it again.

### Apply manually (recommended — no agent secrets required)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project **bardec**
2. Go to **SQL Editor**
3. Paste and run the OMNI migration SQL from the repo (or from Replit task output), for example tables such as:
   - `omni_conversations` / `omni_messages` (chat history)
   - agent rate-limit / usage columns if present
   - RLS policies so users only read their own threads
4. Confirm under **Database → Migrations** that the migration is listed

### Apply via CLI (optional)

```bash
# From a machine with Supabase CLI linked to the project
supabase db push
# or
supabase migration up --project-ref <YOUR_PROJECT_REF>
```

### Do not

- Share `service_role` or personal access tokens in chat
- Let an IDE agent run migrations with a long-lived **SUPABASE_ACCESS_TOKEN** unless you create a **temporary** token and revoke it after

---

## 2. OPENAI_API_KEY setup

### Create the key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a key (restrict by project if possible)
3. Copy it once — it will not be shown again

### Add the secret in Supabase (dashboard)

1. Supabase → project **bardec**
2. **Edge Functions** → **Secrets** (or function **omni-agent** → Secrets)
3. **Add secret**:

| Name | Value |
|------|--------|
| `OPENAI_API_KEY` | `sk-...` (your key) |

4. Save

Names are case-sensitive. No spaces around the value.

### Add via CLI (optional)

```bash
supabase secrets set OPENAI_API_KEY=sk-your-key-here --project-ref <YOUR_PROJECT_REF>
```

### Other secrets often used with OMNI

| Secret | When |
|--------|------|
| `ANTHROPIC_API_KEY` | Agent uses Claude |
| `MCP_SERVER_URL` | URL of `mcp-server` Edge Function |
| `OMNI_MCP_API_KEY` | BARDEC API key (`bdc_...`) with needed MCP permissions |

See also: `artifacts/mobile/supabase/edge-functions/mcp-server/README.md`

---

## 3. Deploy the function

```bash
supabase functions deploy omni-agent --project-ref <YOUR_PROJECT_REF>
```

After changing secrets, redeploy if your workflow does not pick them up automatically:

```bash
supabase functions deploy omni-agent --project-ref <YOUR_PROJECT_REF>
```

### Endpoint

```text
POST https://<project-ref>.supabase.co/functions/v1/omni-agent
```

Call with the user’s JWT (or your designed auth header). Do not expose `OPENAI_API_KEY` to the client.

---

## 4. Verify

| Check | Expected |
|-------|----------|
| Secrets list | `OPENAI_API_KEY` present |
| Migrations | `omni_tables_v01` (or your OMNI migration) applied |
| Function logs | No “missing API key” / 401 from OpenAI |
| App chat | Real model replies (not only local mock in `chat-ai.tsx`) |

**Note:** `chat-ai.tsx` may still use **mock responses** until the frontend is wired to `omni-agent`. Migration + secret enable the **backend**; the app must call the function to use live AI.

---

## 5. Security checklist

- [ ] Keys only in Supabase Secrets (or CI secrets), never in git
- [ ] Rotate any key that was pasted in Replit chat / Discord / screenshots
- [ ] Prefer temporary Supabase access tokens for one-off agent tasks, then revoke
- [ ] RLS on OMNI tables so users cannot read other users’ chats
- [ ] Rate-limit agent calls (DB or Edge) to control OpenAI cost

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `Incorrect API key` / 401 from OpenAI | Wrong or revoked `OPENAI_API_KEY` |
| Function error “secret not found” | Secret name typo or not saved on the right project |
| Migration already exists | Safe to skip; do not re-apply blindly |
| Chat still “fake” answers | UI still on mock path in `chat-ai.tsx` — wire to Edge Function |
| Agent asks for `SUPABASE_ACCESS_TOKEN` | Decline and run SQL + secrets yourself in the dashboard |

---

## Related docs

- MCP server: `../mcp-server/README.md`
- Proximity schema: `../../proximity_schema.sql`
- Main schema: `../../schema.sql`
