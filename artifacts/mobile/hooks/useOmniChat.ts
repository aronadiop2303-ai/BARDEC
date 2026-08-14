import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface OmniChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'separator';
  content: string;
  pending?: boolean;
  streaming?: boolean;
}

const CONVERSATION_STORAGE_KEY = 'omni:conversation_id';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function generateLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface OmniContext {
  type: 'product' | 'order' | 'shop';
  data: Record<string, unknown>;
}

/** True when the RN/browser environment supports ReadableStream body reads */
function supportsBodyStream(): boolean {
  try {
    return (
      typeof ReadableStream !== 'undefined' &&
      typeof TextDecoder !== 'undefined'
    );
  } catch {
    return false;
  }
}

/** Parse SSE lines from a raw text chunk and return extracted event payloads */
function parseSseChunk(raw: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    try {
      results.push(JSON.parse(payload));
    } catch {
      // malformed line — skip
    }
  }
  return results;
}

export function useOmniChat(context?: OmniContext) {
  const [messages, setMessages] = useState<OmniChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track serialised context so we can detect when it changes between renders
  const serializedContext = context ? JSON.stringify(context) : undefined;
  const prevContextRef = useRef<string | undefined>(serializedContext);

  /**
   * Generation counter — incremented every time the context resets.
   * Completion handlers compare their captured generation against this ref;
   * if it doesn't match the request is stale and its results are discarded.
   */
  const generationRef = useRef<number>(0);

  /**
   * AbortController for the currently in-flight fetch (streaming path).
   * Replaced on every new send; aborted on context reset.
   */
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Capture the generation at mount time. If a context reset fires before
    // the async read resolves, generationRef will have been incremented and
    // we discard the stale stored value rather than overwriting cleared state.
    const hydrateGeneration = generationRef.current;
    AsyncStorage.getItem(CONVERSATION_STORAGE_KEY).then((stored) => {
      if (stored && generationRef.current === hydrateGeneration) {
        setConversationId(stored);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset conversation when context changes (e.g. user opens OMNI from a different product/order)
  useEffect(() => {
    const current = context ? JSON.stringify(context) : undefined;
    if (current === prevContextRef.current) return;
    prevContextRef.current = current;

    // Invalidate any in-flight request so it cannot write back stale state
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setConversationId(null);
    setIsSending(false);
    AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY).catch(() => {});

    setMessages((prev) => {
      // Drop any pending/streaming assistant messages from the previous topic,
      // then append a visual separator if there was any prior history.
      const withoutPending = prev.filter((m) => !m.pending);
      if (withoutPending.length === 0) return [];
      return [
        ...withoutPending,
        {
          id: generateLocalId(),
          role: 'separator' as const,
          content: 'Nouveau sujet',
        },
      ];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedContext]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      // Capture the generation at the start of this request.
      // If the context resets while the request is running, generationRef will
      // have been incremented and all completion guards below will bail out.
      const requestGeneration = generationRef.current;

      setError(null);
      const userMessage: OmniChatMessage = {
        id: generateLocalId(),
        role: 'user',
        content: trimmed,
      };
      const pendingId = generateLocalId();
      const pendingMessage: OmniChatMessage = {
        id: pendingId,
        role: 'assistant',
        content: '',
        pending: true,
        streaming: false,
      };
      setMessages((prev) => [...prev, userMessage, pendingMessage]);
      setIsSending(true);

      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error(
            "OMNI n'est pas disponible en mode démo. Configure Supabase pour l'activer.",
          );
        }

        const canStream = supportsBodyStream() && !!supabaseUrl;

        if (canStream) {
          await sendStreaming(trimmed, pendingId, requestGeneration);
        } else {
          await sendNonStreaming(trimmed, pendingId, requestGeneration);
        }
      } catch (err) {
        // Ignore errors from aborted/stale requests
        if (generationRef.current !== requestGeneration) return;

        const message =
          err instanceof Error ? err.message : 'Une erreur est survenue.';
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  content: "Désolé, je n'ai pas pu répondre. Réessaie dans un instant.",
                  pending: false,
                  streaming: false,
                }
              : m,
          ),
        );
      } finally {
        if (generationRef.current === requestGeneration) {
          setIsSending(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, isSending, context],
  );

  /** Streaming path via fetch + ReadableStream + SSE parsing */
  async function sendStreaming(
    text: string,
    pendingId: string,
    requestGeneration: number,
  ): Promise<void> {
    // Create a fresh AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Get auth token from current session (optional — anonymous allowed)
    const sessionRes = await supabase!.auth.getSession();
    const token = sessionRes.data?.session?.access_token ?? supabaseAnonKey;

    const res = await fetch(
      `${supabaseUrl}/functions/v1/omni-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          message: text,
          stream: true,
          ...(context ? { context } : {}),
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      // The edge function returns { error: "..." } with the real cause (e.g.
      // a missing ANTHROPIC_API_KEY secret) — surface it instead of just the
      // HTTP status, which is all that was ever shown before.
      let detail = '';
      try {
        const body = await res.json();
        if (typeof body?.error === 'string') detail = ` — ${body.error}`;
      } catch {
        // response wasn't JSON — fall back to status-only message
      }
      throw new Error(`Erreur serveur (${res.status})${detail}`);
    }

    // Guard: context may have changed while the fetch was in flight
    if (generationRef.current !== requestGeneration) return;

    // Mark as actively streaming (shows content as it arrives)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === pendingId ? { ...m, streaming: true } : m,
      ),
    );

    // Read body as stream
    if (!res.body) {
      // Body not available — fall back to text parse
      const raw = await res.text();
      if (generationRef.current !== requestGeneration) return;

      const events = parseSseChunk(raw);
      let fullContent = '';
      let newConvId: string | null = null;

      for (const ev of events) {
        if (typeof ev.chunk === 'string') {
          fullContent += ev.chunk;
        }
        if (ev.done && typeof ev.conversation_id === 'string') {
          newConvId = ev.conversation_id;
        }
      }

      finishMessage(pendingId, fullContent, newConvId, requestGeneration);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let newConvId: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Bail out if the context was reset while we were reading
      if (generationRef.current !== requestGeneration) {
        reader.cancel().catch(() => {});
        return;
      }

      buffer += dec.decode(value, { stream: true });

      // Process complete SSE messages (delimited by \n\n)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const events = parseSseChunk(part);
        for (const ev of events) {
          if (ev.error) {
            throw new Error(String(ev.error));
          }
          if (typeof ev.chunk === 'string') {
            accumulated += ev.chunk;
            // Update message content in real time
            const snapshot = accumulated;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? { ...m, content: snapshot, streaming: true, pending: true }
                  : m,
              ),
            );
          }
          if (ev.done) {
            if (typeof ev.conversation_id === 'string') {
              newConvId = ev.conversation_id;
            }
          }
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const events = parseSseChunk(buffer);
      for (const ev of events) {
        if (typeof ev.chunk === 'string') {
          accumulated += ev.chunk;
        }
        if (ev.done && typeof ev.conversation_id === 'string') {
          newConvId = ev.conversation_id;
        }
      }
    }

    finishMessage(pendingId, accumulated, newConvId, requestGeneration);
  }

  /** Fallback: non-streaming via supabase.functions.invoke */
  async function sendNonStreaming(
    text: string,
    pendingId: string,
    requestGeneration: number,
  ): Promise<void> {
    const { data, error: invokeError } = await supabase!.functions.invoke(
      'omni-agent',
      {
        body: {
          conversation_id: conversationId ?? undefined,
          message: text,
          stream: false,
          ...(context ? { context } : {}),
        },
      },
    );

    // Context may have changed while the request was in flight — discard
    if (generationRef.current !== requestGeneration) return;

    if (invokeError) {
      // FunctionsHttpError only carries a generic message by default — read
      // the real { error: "..." } body off its .context response for detail.
      const ctx = (invokeError as any)?.context;
      let detail: string | null = null;
      if (ctx?.json) {
        const body = await ctx.json().catch(() => null);
        if (typeof body?.error === 'string') detail = body.error;
      }
      throw new Error(detail ?? invokeError.message);
    }
    if (!data?.reply) throw new Error('Réponse vide reçue.');

    if (data.conversation_id && data.conversation_id !== conversationId) {
      setConversationId(data.conversation_id);
      await AsyncStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversation_id);
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === pendingId
          ? { ...m, content: data.reply, pending: false, streaming: false }
          : m,
      ),
    );
  }

  function finishMessage(
    pendingId: string,
    content: string,
    newConvId: string | null,
    requestGeneration: number,
  ) {
    // Discard if the context was reset after this request started
    if (generationRef.current !== requestGeneration) return;

    if (newConvId && newConvId !== conversationId) {
      setConversationId(newConvId);
      AsyncStorage.setItem(CONVERSATION_STORAGE_KEY, newConvId).catch(() => {});
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === pendingId
          ? { ...m, content, pending: false, streaming: false }
          : m,
      ),
    );
  }

  const startNewConversation = useCallback(async () => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setConversationId(null);
    setMessages([]);
    setIsSending(false);
    await AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  return { messages, isSending, error, sendMessage, startNewConversation };
}
