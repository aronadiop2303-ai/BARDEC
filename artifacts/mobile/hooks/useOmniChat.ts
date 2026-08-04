import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface OmniChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
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
      const userMessage: OmniChatMessage = { id: generateLocalId(), role: 'user', content: trimmed };
      const pendingMessage: OmniChatMessage = {
        id: generateLocalId(),
        role: 'assistant',
        content: '',
        pending: true,
      };
      setMessages((prev) => [...prev, userMessage, pendingMessage]);
      setIsSending(true);

      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error('OMNI n\'est pas disponible en mode démo. Configure Supabase pour l\'activer.');
        }
        const { data, error: invokeError } = await supabase.functions.invoke('omni-agent', {
          body: {
            conversation_id: conversationId ?? undefined,
            message: trimmed,
            ...(context ? { context } : {}),
          },
        });

        if (invokeError) throw invokeError;
        if (!data?.reply) throw new Error('Réponse vide reçue.');

        if (data.conversation_id && data.conversation_id !== conversationId) {
          setConversationId(data.conversation_id);
          await AsyncStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversation_id);
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === pendingMessage.id ? { ...m, content: data.reply, pending: false } : m)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMessage.id
              ? { ...m, content: "Désolé, je n'ai pas pu répondre. Réessaie dans un instant.", pending: false }
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

  const startNewConversation = useCallback(async () => {
    setConversationId(null);
    setMessages([]);
    await AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  return { messages, isSending, error, sendMessage, startNewConversation };
}
