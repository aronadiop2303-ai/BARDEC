// ─── OMNI Model Layer ──────────────────────────────────────────────────────
//
// Abstracts OMNI from any single model provider so it isn't hard-blocked by
// one provider running out of credit. Two provider "shapes" exist today,
// both under the ExternalModel umbrella (hosted APIs reached over HTTP):
//
//   - Anthropic-shaped: Anthropic itself, and DeepSeek's Anthropic-compatible
//     endpoint (https://api.deepseek.com/anthropic) — same request/response
//     format (Messages API), same x-api-key/anthropic-version headers, just
//     a different base URL, key, and model name. No translation needed.
//   - OpenAI-shaped: OpenRouter — Chat Completions format. Needs translation
//     both ways (request: content-block messages/tools → OpenAI messages/
//     function-tools; response: choices[0].message → content blocks).
//
// LocalModel / HuggingFaceModel / FutureOmniModel are not implemented — no
// current need — but any of them just has to satisfy the ModelProvider
// interface below (systemPrompt + messages + tools in, content blocks out)
// to plug into the same fallback chain.
//
// Routing:
//   - MODEL_PROVIDER env var ("anthropic" | "deepseek" | "openrouter"), if
//     set, forces that one provider — no fallback, useful for testing a
//     specific provider in isolation.
//   - Unset (default): automatic fallback chain in priority order, skipping
//     any provider whose API key secret isn't configured, falling through
//     to the next on failure: DeepSeek (free tier) → OpenRouter (backup) →
//     Anthropic (paid, last resort).

import { ClaudeContentBlock, ClaudeToolDefinition } from './types.ts';

export interface ModelMessage {
  role: string; // 'user' | 'assistant'
  content: unknown; // string, or an array of ClaudeContentBlock (Anthropic-shaped) — the canonical internal format
}

export interface ModelCallResult {
  content: ClaudeContentBlock[];
}

export interface ModelProvider {
  name: string;
  isConfigured(): boolean;
  call(
    systemPrompt: string,
    messages: ModelMessage[],
    tools: ClaudeToolDefinition[],
  ): Promise<ModelCallResult>;
}

const MAX_TOKENS = 1024;

// ── Anthropic-shaped provider (Anthropic, DeepSeek's /anthropic endpoint) ──

function makeAnthropicCompatibleProvider(opts: {
  name: string;
  url: string;
  apiKeyEnv: string;
  model: string;
}): ModelProvider {
  return {
    name: opts.name,
    isConfigured: () => !!Deno.env.get(opts.apiKeyEnv),
    async call(systemPrompt, messages, tools) {
      const apiKey = Deno.env.get(opts.apiKeyEnv);
      if (!apiKey) throw new Error(`${opts.apiKeyEnv} manquant.`);

      const response = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages,
          tools,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API ${opts.name} (${response.status}) : ${errText}`);
      }

      const json = await response.json();
      return { content: (json.content ?? []) as ClaudeContentBlock[] };
    },
  };
}

// ── OpenAI-shaped provider (OpenRouter) ─────────────────────────────────────

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** Anthropic-shaped messages (+ system prompt) → OpenAI chat message array. */
function toOpenAiMessages(systemPrompt: string, messages: ModelMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of messages) {
    const content = msg.content;

    if (typeof content === 'string') {
      out.push({ role: msg.role as OpenAiMessage['role'], content });
      continue;
    }
    if (!Array.isArray(content)) continue;
    const blocks = content as ClaudeContentBlock[];

    if (msg.role === 'assistant') {
      const textParts: string[] = [];
      const toolCalls: NonNullable<OpenAiMessage['tool_calls']> = [];
      for (const block of blocks) {
        if (block.type === 'text' && block.text) textParts.push(block.text);
        if (block.type === 'tool_use' && block.id && block.name) {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          });
        }
      }
      out.push({
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // role === 'user': each tool_result block becomes its own `tool` message
    // (OpenAI doesn't support bundling several tool results into one user
    // message the way Anthropic does); any plain text becomes a user message.
    const textParts: string[] = [];
    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: String(block.content ?? '') });
      } else if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      }
    }
    if (textParts.length > 0) out.push({ role: 'user', content: textParts.join('\n') });
  }

  return out;
}

/** Anthropic tool definitions → OpenAI function-tool definitions. */
function toOpenAiTools(tools: ClaudeToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** OpenAI chat-completion response → Anthropic-shaped content blocks. */
function fromOpenAiResponse(json: any): ClaudeContentBlock[] {
  const message = json?.choices?.[0]?.message;
  if (!message) throw new Error('Réponse API invalide (pas de message).');

  const blocks: ClaudeContentBlock[] = [];
  if (typeof message.content === 'string' && message.content.length > 0) {
    blocks.push({ type: 'text', text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leave empty on malformed JSON */ }
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
    }
  }
  return blocks;
}

function makeOpenAiCompatibleProvider(opts: {
  name: string;
  url: string;
  apiKeyEnv: string;
  model: string;
  extraHeaders?: Record<string, string>;
}): ModelProvider {
  return {
    name: opts.name,
    isConfigured: () => !!Deno.env.get(opts.apiKeyEnv),
    async call(systemPrompt, messages, tools) {
      const apiKey = Deno.env.get(opts.apiKeyEnv);
      if (!apiKey) throw new Error(`${opts.apiKeyEnv} manquant.`);

      const response = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(opts.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: MAX_TOKENS,
          messages: toOpenAiMessages(systemPrompt, messages),
          ...(tools.length > 0 ? { tools: toOpenAiTools(tools) } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API ${opts.name} (${response.status}) : ${errText}`);
      }

      const json = await response.json();
      return { content: fromOpenAiResponse(json) };
    },
  };
}

// ── Fallback orchestration ──────────────────────────────────────────────────

function buildProviderChain(): ModelProvider[] {
  const providers: Record<string, ModelProvider> = {
    deepseek: makeAnthropicCompatibleProvider({
      name: 'deepseek',
      url: 'https://api.deepseek.com/anthropic/v1/messages',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      // DeepSeek is on a fast model-naming churn (deepseek-chat/-reasoner are
      // being retired in favour of deepseek-v4-flash/-pro) — override via
      // DEEPSEEK_MODEL if this default goes stale.
      model: Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-v4-flash',
    }),
    openrouter: makeOpenAiCompatibleProvider({
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      model: Deno.env.get('OPENROUTER_MODEL') ?? 'deepseek/deepseek-chat',
      extraHeaders: {
        'HTTP-Referer': 'https://bardec-ard27.vercel.app',
        'X-Title': 'BARDEC OMNI',
      },
    }),
    anthropic: makeAnthropicCompatibleProvider({
      name: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      model: Deno.env.get('OMNI_MODEL') ?? 'claude-sonnet-5',
    }),
  };

  const forced = Deno.env.get('MODEL_PROVIDER')?.trim().toLowerCase();
  if (forced) {
    const provider = providers[forced];
    if (!provider) {
      throw new Error(`MODEL_PROVIDER="${forced}" inconnu (attendu : anthropic, deepseek, ou openrouter).`);
    }
    return [provider];
  }

  return [providers.deepseek, providers.openrouter, providers.anthropic].filter((p) => p.isConfigured());
}

/**
 * Calls the model, trying each configured provider in priority order and
 * falling through to the next on failure. Throws with every provider's
 * error attached if all of them fail (or none are configured).
 */
export async function callModel(
  systemPrompt: string,
  messages: ModelMessage[],
  tools: ClaudeToolDefinition[],
): Promise<ModelCallResult> {
  const chain = buildProviderChain();
  if (chain.length === 0) {
    throw new Error(
      'Aucun fournisseur de modèle configuré (DEEPSEEK_API_KEY, OPENROUTER_API_KEY, ou ANTHROPIC_API_KEY).',
    );
  }

  const errors: string[] = [];
  for (const provider of chain) {
    try {
      return await provider.call(systemPrompt, messages, tools);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${message}`);
      console.warn(`[omni-agent] provider "${provider.name}" failed, trying next —`, message);
    }
  }
  throw new Error(`Tous les fournisseurs de modèle ont échoué — ${errors.join(' | ')}`);
}
