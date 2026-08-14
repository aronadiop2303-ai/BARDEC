import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OMNI_TOOLS, OMNI_TOOL_NAMES } from './lib/mcp-tools.ts';
import { callMcpTool, McpToolError } from './lib/mcp-client.ts';
import { buildSystemPrompt } from './lib/system-prompt.ts';
import { updateMemory } from './lib/memory.ts';
import { ClaudeContentBlock, OmniMemory, OmniRequestBody } from './lib/types.ts';

const ALLOWED_ORIGINS = new Set([
  'https://bardec-ard27.vercel.app',
  'https://bardec-aronadiop2303-6278-ard27.vercel.app',
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: unknown, status: number, cors: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = Deno.env.get('OMNI_MODEL') ?? 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 4;
const MAX_HISTORY_MESSAGES = 20;

async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
): Promise<{ content: ClaudeContentBlock[] }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY manquant dans les secrets de la fonction.');
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: OMNI_TOOLS,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur API Claude (${response.status}) : ${errText}`);
  }

  return response.json();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const CORS = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non supportée, utiliser POST.' }, 405, CORS);
  }

  let body: OmniRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corps de requête JSON invalide.' }, 400, CORS);
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return jsonResponse({ error: 'Le champ "message" est requis.' }, 400, CORS);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Authentification requise.' }, 401, CORS);
  }

  const userClient: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Session invalide ou expirée.' }, 401, CORS);
  }

  try {
    let conversationId = body.conversation_id;
    if (conversationId) {
      const { data: existing, error } = await userClient
        .from('omni_conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();
      if (error || !existing) {
        return jsonResponse({ error: 'Conversation introuvable.' }, 404, CORS);
      }
    } else {
      const { data: created, error } = await userClient
        .from('omni_conversations')
        .insert({ user_id: user.id, title: body.message.slice(0, 60) })
        .select('id')
        .single();
      if (error || !created) {
        throw new Error(`Impossible de créer la conversation : ${error?.message}`);
      }
      conversationId = created.id;
    }

    const { data: historyRows } = await userClient
      .from('omni_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    const history = (historyRows ?? []).reverse();

    const { data: memoryRow } = await userClient
      .from('omni_memory')
      .select('summary, preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const memory: OmniMemory | null = memoryRow
      ? { summary: memoryRow.summary, preferences: memoryRow.preferences ?? {} }
      : null;

    await userClient
      .from('omni_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: body.message });

    const systemPrompt = buildSystemPrompt(memory);
    const claudeMessages: Array<{ role: string; content: unknown }> = [
      ...history.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
      { role: 'user', content: body.message },
    ];

    const toolsUsed: string[] = [];
    let finalReply = '';
    const mcpOptions = {
      endpoint: Deno.env.get('MCP_SERVER_URL') ?? '',
      apiKey: Deno.env.get('OMNI_MCP_API_KEY') ?? '',
    };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const claudeResponse = await callClaude(systemPrompt, claudeMessages);

      const toolUseBlocks = claudeResponse.content.filter((b) => b.type === 'tool_use');
      const textBlocks = claudeResponse.content.filter((b) => b.type === 'text');

      if (toolUseBlocks.length === 0) {
        finalReply = textBlocks.map((b) => b.text).join('\n');
        break;
      }

      claudeMessages.push({ role: 'assistant', content: claudeResponse.content });

      const toolResults: ClaudeContentBlock[] = [];
      for (const block of toolUseBlocks) {
        if (!block.name || !OMNI_TOOL_NAMES.has(block.name)) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Outil "${block.name}" non autorisé pour OMNI v0.1.`,
          });
          continue;
        }
        try {
          const result = await callMcpTool(mcpOptions, block.name, block.input ?? {});
          toolsUsed.push(block.name);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          const message = err instanceof McpToolError ? err.message : "Erreur lors de l'appel de l'outil.";
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Erreur: ${message}` });
        }
      }

      claudeMessages.push({ role: 'user', content: toolResults });

      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        finalReply =
          textBlocks.map((b) => b.text).join('\n') ||
          "Je n'ai pas pu terminer cette recherche, peux-tu reformuler ta demande ?";
      }
    }

    await userClient.from('omni_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: finalReply,
      tool_calls: toolsUsed.length > 0 ? toolsUsed : null,
    });

    const updatedMemory = updateMemory(memory, body.message, finalReply);
    await userClient.from('omni_memory').upsert(
      {
        user_id: user.id,
        summary: updatedMemory.summary,
        preferences: updatedMemory.preferences,
      },
      { onConflict: 'user_id' },
    );

    return jsonResponse(
      { conversation_id: conversationId, reply: finalReply, tools_used: toolsUsed },
      200,
      CORS,
    );
  } catch (err) {
    console.error('omni-agent error:', err);
    const message = err instanceof Error ? err.message : 'Erreur interne.';
    return jsonResponse({ error: message }, 500, CORS);
  }
});
