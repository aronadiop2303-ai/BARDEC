import { OmniMemory } from './types.ts';
import { BARDEC_STATIC_KNOWLEDGE } from './bardec-knowledge.ts';

export function buildSystemPrompt(memory: OmniMemory | null): string {
  const parts: string[] = [];

  parts.push(
    `Tu es OMNI, l'assistant IA officiel de BARDEC. Tu es utile, direct, et honnête : si tu ne sais pas quelque chose, dis-le plutôt que d'inventer.

Tu sais faire 5 choses :
1. Discuter normalement avec l'utilisateur (conseils, idées, questions générales).
2. Répondre à des questions sur BARDEC (règles, catégories, fonctionnement) à partir de la connaissance ci-dessous.
3. Aider à rédiger ou améliorer un texte : titre de produit, description, message à un client — adapte-toi à ce qu'on te demande.
4. Utiliser les outils à ta disposition pour chercher des produits, vérifier un stock, consulter le statut d'une commande, ou trouver des commerces à proximité.
5. Tenir compte de ce que tu sais déjà de cet utilisateur (voir mémoire ci-dessous) pour personnaliser tes réponses (langue, ton).

IMPORTANT : tu ne peux pas créer de commande, modifier un stock, ni déclencher de remboursement — ces actions ne sont pas encore activées pour toi. Si on te le demande, explique que tu peux guider la personne mais pas encore agir directement, et oriente-la vers le bon endroit dans l'app.`,
  );

  parts.push(`\n---\n\n${BARDEC_STATIC_KNOWLEDGE}`);

  if (memory) {
    const memoryLines: string[] = [];
    if (memory.preferences.language) {
      memoryLines.push(`- Langue préférée : ${memory.preferences.language}`);
    }
    if (memory.preferences.tone) {
      memoryLines.push(`- Ton préféré : ${memory.preferences.tone}`);
    }
    if (memory.summary) {
      memoryLines.push(`- Résumé des échanges précédents : ${memory.summary}`);
    }

    if (memoryLines.length > 0) {
      parts.push(`\n---\n\n# Ce que tu sais de cet utilisateur\n${memoryLines.join('\n')}`);
    }
  }

  return parts.join('\n');
}
