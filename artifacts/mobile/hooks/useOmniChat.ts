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

function generateLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface OmniContext {
  type: 'product' | 'order' | 'shop';
  data: Record<string, unknown>;
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

    setConversationId(null);
    setIsSending(false);
    AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY).catch(() => {});

    setMessages((prev) => {
      // Drop any pending assistant messages from the previous topic, then
      // append a visual separator if there was any prior history.
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
      };
      setMessages((prev) => [...prev, userMessage, pendingMessage]);
      setIsSending(true);

      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error(
            "OMNI n'est pas disponible en mode démo. Configure Supabase pour l'activer.",
          );
        }

        // omni-agent requires a real authenticated session — it rejects the
        // anon key with 401 "Session invalide". Fail with a clear message
        // up front instead of a doomed request.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          throw new Error('Connecte-toi pour discuter avec OMNI.');
        }

        // The deployed omni-agent function only supports a single non-streaming
        // JSON reply (no SSE) — conversation_id/message in, { reply,
        // conversation_id } out.
        const { data, error: invokeError } = await supabase.functions.invoke(
          'omni-agent',
          {
            body: {
              conversation_id: conversationId ?? undefined,
              message: trimmed,
            },
          },
        );

        // Context may have changed while the request was in flight — discard
        if (generationRef.current !== requestGeneration) return;

        if (invokeError) {
          // FunctionsHttpError only carries a generic message by default —
          // read the real { error: "..." } body off its .context response.
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
              ? { ...m, content: data.reply, pending: false }
              : m,
          ),
        );
      } catch (err) {
        // Ignore errors from stale requests
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

  const startNewConversation = useCallback(async () => {
    generationRef.current += 1;
    setConversationId(null);
    setMessages([]);
    setIsSending(false);
    await AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  return { messages, isSending, error, sendMessage, startNewConversation };
}
