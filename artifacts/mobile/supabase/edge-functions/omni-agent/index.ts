/**
 * OMNI Agent — Supabase Edge Function
 * Conversational AI assistant for BARDEC.
 *
 * Supports both:
 *   • Streaming (SSE) when body.stream === true
 *   • Standard JSON response otherwise
 *
 * Body: { conversation_id?: string, message: string, context?: OmniContext, stream?: boolean }
 *
 * SSE format (streaming):
 *   data: {"chunk":"token text"}\n\n
 *   data: {"done":true,"conversation_id":"xxx"}\n\n
 *   data: {"error":"..."}\n\n   (on failure)
 *
 * JSON format (non-streaming):
 *   { reply: string, conversation_id: string | null }
 *
 * Authorization:
 *   Conversation history is only persisted for authenticated (JWT) users.
 *   All DB reads/writes are scoped by user_id — the service-role client always
 *   includes an explicit `user_id = <uid>` filter for defence-in-depth on top of RLS.
 *   Anonymous callers receive AI replies but no conversation is stored.
 *
 * Streaming + persistence:
 *   Chunks are accumulated server-side. After OpenAI sends [DONE], the full
 *   conversation (history + user message + assistant reply) is written atomically
 *   before the final SSE event is emitted. On stream error, nothing is persisted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OmniContext {
  type: 'product' | 'order' | 'shop';
  data: Record<string, unknown>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type ServiceClient = ReturnType<typeof createClient>;

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(context?: OmniContext): string {
  const base = `Tu es OMNI, l'assistant IA de BARDEC — une marketplace B2B et B2C.
Tu aides les utilisateurs avec leurs commandes, produits, et questions sur la plateforme.
Réponds toujours en français. Sois concis, clair, et utile.
Si tu ne sais pas quelque chose, dis-le honnêtement.`;

  if (!context) return base;

  const extra: Record<string, string> = {
    product: `\n\nContexte produit : ${JSON.stringify(context.data)}`,
    order:   `\n\nContexte commande : ${JSON.stringify(context.data)}`,
    shop:    `\n\nContexte boutique : ${JSON.stringify(context.data)}`,
  };
  return base + (extra[context.type] ?? '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation persistence
// (authenticated users only; requires omni_conversations table — see schema file)
// ─────────────────────────────────────────────────────────────────────────────

async function loadHistory(
  db: ServiceClient,
  conversationId: string,
  userId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('omni_conversations')
    .select('messages')
    .eq('id', conversationId)
    .eq('user_id', userId)   // ownership check (service-role ignores RLS)
    .single();

  if (error || !data) return [];
  return (data.messages as ChatMessage[]) ?? [];
}

async function saveConversation(
  db: ServiceClient,
  conversationId: string | null,
  messages: ChatMessage[],
  userId: string,
): Promise<string> {
  const now = new Date().toISOString();
  const trimmed = messages.slice(-30);

  if (conversationId) {
    const { error } = await db
      .from('omni_conversations')
      .update({ messages: trimmed, updated_at: now })
      .eq('id', conversationId)
      .eq('user_id', userId);  // ownership check on write

    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
    return conversationId;
  }

  const { data, error } = await db
    .from('omni_conversations')
    .insert({ user_id: userId, messages: trimmed, updated_at: now })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'no data'}`);
  }
  return data.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT → user ID (returns null for anonymous / invalid tokens)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserId(
  db: ServiceClient,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data, error } = await db.auth.getUser(authHeader.slice(7));
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI body builder
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function openAIBody(messages: ChatMessage[], stream: boolean) {
  return {
    model: 'gpt-4o-mini',
    messages,
    stream,
    max_tokens: 1024,
    temperature: 0.7,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming response
//
// Chunks are accumulated server-side. After [DONE] the full conversation
// (history + userMessage + assembled reply) is persisted before the final
// SSE event is emitted so both turns are always stored together.
// On any error nothing is written to the DB.
// ─────────────────────────────────────────────────────────────────────────────

function streamReply(opts: {
  openaiKey: string;
  chatMessages: ChatMessage[];      // messages sent to OpenAI (includes system)
  storageMessages: ChatMessage[];   // prior history WITHOUT system prompt (for DB)
  userMessage: string;
  db: ServiceClient;
  userId: string | null;
  existingConvId: string | null;
}): Response {
  const { openaiKey, chatMessages, storageMessages, userMessage, db, userId, existingConvId } = opts;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const write = (obj: Record<string, unknown>) =>
    writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      const upstreamRes = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(openAIBody(chatMessages, true)),
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        await write({ error: `OpenAI error ${upstreamRes.status}: ${errText}` });
        return;
      }

      const reader = upstreamRes.body!.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      let assembled = '';   // full assistant reply accumulated here

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();

          if (raw === '[DONE]') {
            // ── Persist both turns atomically before signalling done ──────────
            let finalConvId: string | null = existingConvId;
            if (userId && assembled) {
              const fullHistory: ChatMessage[] = [
                ...storageMessages,
                { role: 'user', content: userMessage },
                { role: 'assistant', content: assembled },
              ];
              try {
                finalConvId = await saveConversation(db, existingConvId, fullHistory, userId);
              } catch (e) {
                // Persist failure — still emit done so the client can show the reply
                console.error('Failed to persist conversation:', String(e));
              }
            }
            await write({ done: true, conversation_id: finalConvId });
            continue;
          }

          try {
            const parsed = JSON.parse(raw);
            const chunk: string = parsed?.choices?.[0]?.delta?.content ?? '';
            if (chunk) {
              assembled += chunk;
              await write({ chunk });
            }
          } catch {
            // malformed delta — skip
          }
        }
      }
    } catch (e) {
      await write({ error: String(e) });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 503);

  let body: {
    conversation_id?: string;
    message: string;
    context?: OmniContext;
    stream?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { conversation_id, message, context, stream = false } = body;
  if (!message?.trim()) return json({ error: 'message is required' }, 400);

  // Service-role client for DB (explicit user_id filter on every query)
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const userId = await resolveUserId(db, req.headers.get('authorization'));

  // Load prior history (authenticated only; ownership enforced in query)
  let history: ChatMessage[] = [];
  let resolvedConvId: string | null = null;

  if (userId && conversation_id) {
    history = await loadHistory(db, conversation_id, userId);
    if (history.length > 0) resolvedConvId = conversation_id;
  }

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history,
    { role: 'user', content: message.trim() },
  ];

  // ── Streaming path ──────────────────────────────────────────────────────────
  if (stream) {
    return streamReply({
      openaiKey,
      chatMessages,
      storageMessages: history,  // excludes system prompt
      userMessage: message.trim(),
      db,
      userId,
      existingConvId: resolvedConvId,
    });
  }

  // ── Non-streaming path ──────────────────────────────────────────────────────
  const openaiRes = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify(openAIBody(chatMessages, false)),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return json({ error: `OpenAI error ${openaiRes.status}: ${errText}` }, 502);
  }

  const openaiData = await openaiRes.json();
  const reply: string =
    openaiData?.choices?.[0]?.message?.content ?? "Désolé, je n'ai pas pu répondre.";

  let finalConvId: string | null = null;
  if (userId) {
    const updatedMessages: ChatMessage[] = [
      ...history,
      { role: 'user', content: message.trim() },
      { role: 'assistant', content: reply },
    ];
    try {
      finalConvId = await saveConversation(db, resolvedConvId, updatedMessages, userId);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }

  return json({ reply, conversation_id: finalConvId });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
