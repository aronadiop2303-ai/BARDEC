import { OmniMemory } from './types.ts';

const FRENCH_MARKERS = ['bonjour', 'merci', 'commande', 'produit', 'je', 'vous', 'salut'];
const ENGLISH_MARKERS = ['hello', 'thanks', 'order', 'product', 'please', 'hi'];

export function detectLanguage(message: string): 'fr' | 'en' | null {
  const lower = message.toLowerCase();
  const frScore = FRENCH_MARKERS.filter((w) => lower.includes(w)).length;
  const enScore = ENGLISH_MARKERS.filter((w) => lower.includes(w)).length;

  if (frScore === 0 && enScore === 0) return null;
  return frScore >= enScore ? 'fr' : 'en';
}

const MAX_SUMMARY_LENGTH = 500;

export function updateMemory(
  current: OmniMemory | null,
  userMessage: string,
  assistantReply: string,
): OmniMemory {
  const base: OmniMemory = current ?? { summary: null, preferences: {} };

  const detectedLanguage = detectLanguage(userMessage);
  const preferences = { ...base.preferences };
  if (detectedLanguage && !preferences.language) {
    preferences.language = detectedLanguage;
  }

  const latestExchange = `Utilisateur: ${userMessage} | OMNI: ${assistantReply}`;
  const combined = base.summary ? `${base.summary}\n${latestExchange}` : latestExchange;
  const summary =
    combined.length > MAX_SUMMARY_LENGTH
      ? combined.slice(combined.length - MAX_SUMMARY_LENGTH)
      : combined;

  return { summary, preferences };
}
