/**
 * OMNI Agent — Supabase Edge Function
 *
 * Conversational AI assistant for BARDEC, powered by Anthropic Claude.
 * Supports streaming (SSE) and standard JSON responses.
 * Persists conversation history in 3 normalized tables:
 *   omni_conversations, omni_messages, omni_memory
 *
 * Request body:
 *   {
 *     conversation_id?: string   // omit to start a new conversation
 *     message:          string   // user's current message
 *     context?:         OmniContext   // what the user is currently viewing
 *     stream?:          boolean  // true → SSE chunks; false → JSON reply
 *     user_role?:       UserRole // for personalised system prompt
 *   }
 *
 * SSE events (stream=true):
 *   data: {"chunk":"…"}\n\n          — text token
 *   data: {"done":true,"conversation_id":"…"}\n\n
 *   data: {"error":"…"}\n\n          — on failure
 *
 * JSON response (stream=false):
 *   { reply: string, conversation_id: string | null }
 *
 * Auth: standard Supabase JWT (Authorization: Bearer <token>).
 * Anonymous callers receive replies but no history is persisted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { OmniRequest, ChatMessage }  from './lib/types.ts';
import { buildSystemPrompt }              from './lib/system-prompt.ts';
import { loadHistory, ensureConversation, appendMessages, loadMemory } from './lib/memory.ts';
import { MCP_TOOLS }                      from './lib/mcp-tools.ts';
import { resolveToolUses }                from './lib/mcp-client.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY  = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const MODEL          = Deno.env.get('OMNI_MODEL') ?? 'claude-sonnet-4-5';
const MAX_TOKENS     = 1024;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')         ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Supabase service-role client (bypasses RLS for writes after auth check) ──

function makeDb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
  });
}

// ─── JWT → userId ─────────────────────────────────────────────────────────────

async function resolveUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const db = makeDb();
  try {
    const { data, error } = await db.auth.getUser(authHeader.slice(7));
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ─── Anthropic helpers ────────────────────────────────────────────────────────

function anthropicHeaders() {
  return {
    'Content-Type':      'application/json',
    'x-api-key':         ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  };
}

interface AnthropicBody {
  model:      string;
  max_tokens: number;
  system:     string;
  messages:   Array<{ role: string; content: any }>;
  tools?:     unknown[];
  stream?:    boolean;
}

function buildAnthropicBody(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  stream: boolean,
  includeTools: boolean,
): AnthropicBody {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  return {
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages,
    ...(includeTools ? { tools: MCP_TOOLS } : {}),
    ...(stream       ? { stream: true }     : {}),
  };
}

// ─── Non-streaming call (with tool-use loop) ──────────────────────────────────

async function callAnthropic(
  body: AnthropicBody,
  userJwt: string,
): Promise<string> {
  const messages = [...body.messages];

  // Allow up to 3 tool-use rounds
  for (let round = 0; round < 3; round++) {
    const res = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: anthropicHeaders(),
      body:    JSON.stringify({ ...body, messages, stream: false }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic error ${res.status}: ${err}`);
    }

    const json = await res.json();

    // Check for tool_use blocks
    const toolUses = (json.content ?? []).filter((b: any) => b.type === 'tool_use');
    if (toolUses.length === 0 || json.stop_reason === 'end_turn') {
      // Extract final text
      const textBlock = (json.content ?? []).find((b: any) => b.type === 'text');
      return textBlock?.text ?? '';
    }

    // Resolve tool calls
    const toolResults = await resolveToolUses(
      toolUses.map((tu: any) => ({ id: tu.id, name: tu.name, input: tu.input })),
      userJwt,
    );

    // Append assistant turn + tool results and loop
    messages.push({ role: 'assistant', content: json.content });
    messages.push({ role: 'user',      content: toolResults });
  }

  return '(Impossible de résoudre la réponse après plusieurs tentatives.)';
}

// ─── Streaming call (no tool-use; simpler for real-time UX) ──────────────────

async function streamAnthropic(
  body: AnthropicBody,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method:  'POST',
    headers: anthropicHeaders(),
    body:    JSON.stringify({ ...body, stream: true, tools: undefined }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic stream error ${res.status}: ${err}`);
  }

  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;

      try {
        const evt = JSON.parse(raw);

        // Anthropic SSE: content_block_delta with text_delta
        if (
          evt.type === 'content_block_delta' &&
          evt.delta?.type === 'text_delta' &&
          evt.delta.text
        ) {
          accumulated += evt.delta.text;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ chunk: evt.delta.text })}\n\n`)
          );
        }
      } catch {
        // ignore malformed events
      }
    }
  }

  return accumulated;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // Parse body
  let body: OmniRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!body.message?.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const stream   = body.stream ?? false;
  const authHeader = req.headers.get('Authorization');
  const userId   = await resolveUserId(authHeader);
  const db       = makeDb();

  // Load history + memory (authenticated users only)
  let history: ChatMessage[] = [];
  let memory = [];

  if (userId && body.conversation_id) {
    try {
      history = await loadHistory(db, body.conversation_id, userId);
    } catch {
      // Non-fatal — start fresh if history load fails
    }
  }

  if (userId) {
    try {
      memory = await loadMemory(db, userId);
    } catch {
      // Non-fatal
    }
  }

  const systemPrompt = buildSystemPrompt(body.context, memory, body.user_role);
  const anthropicBody = buildAnthropicBody(
    systemPrompt,
    history,
    body.message,
    stream,
    !stream, // include tools only for non-streaming calls
  );

  // ── STREAMING ────────────────────────────────────────────────────────────────
  if (stream) {
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let reply = '';
        let convId: string | null = null;

        try {
          reply = await streamAnthropic(anthropicBody, controller, encoder);

          // Persist after stream completes
          if (userId && reply) {
            try {
              convId = await ensureConversation(db, body.conversation_id, userId, body.message);
              await appendMessages(db, convId, body.message, reply);
            } catch {
              // Non-fatal — reply was already streamed
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, conversation_id: convId })}\n\n`)
          );
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err?.message ?? 'Stream error' })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...CORS,
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  }

  // ── NON-STREAMING ─────────────────────────────────────────────────────────────
  try {
    const reply = await callAnthropic(
      anthropicBody,
      authHeader?.slice(7) ?? '',
    );

    let convId: string | null = null;
    if (userId && reply) {
      try {
        convId = await ensureConversation(db, body.conversation_id, userId, body.message);
        await appendMessages(db, convId, body.message, reply);
      } catch {
        // Non-fatal
      }
    }

    return new Response(
      JSON.stringify({ reply, conversation_id: convId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
