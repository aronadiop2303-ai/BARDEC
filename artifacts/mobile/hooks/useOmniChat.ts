import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface OmniChatMessage {
  id: string;
  role: 'user' | 'assistant';
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

  useEffect(() => {
    AsyncStorage.getItem(CONVERSATION_STORAGE_KEY).then((stored) => {
      if (stored) setConversationId(stored);
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

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
          await sendStreaming(trimmed, pendingId);
        } else {
          await sendNonStreaming(trimmed, pendingId);
        }
      } catch (err) {
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
        setIsSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, isSending, context],
  );

  /** Streaming path via fetch + ReadableStream + SSE parsing */
  async function sendStreaming(text: string, pendingId: string): Promise<void> {
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
      },
    );

    if (!res.ok) {
      throw new Error(`Erreur serveur: ${res.status}`);
    }

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

      finishMessage(pendingId, fullContent, newConvId);
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

    finishMessage(pendingId, accumulated, newConvId);
  }

  /** Fallback: non-streaming via supabase.functions.invoke */
  async function sendNonStreaming(text: string, pendingId: string): Promise<void> {
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

    if (invokeError) throw invokeError;
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
  ) {
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
    setConversationId(null);
    setMessages([]);
    await AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  return { messages, isSending, error, sendMessage, startNewConversation };
}
