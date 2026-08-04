// ─── BARDEC Static Knowledge ──────────────────────────────────────────────────
// Injected verbatim into every system prompt so OMNI always knows
// the platform's rules, policies and capabilities.

export const BARDEC_KNOWLEDGE = `
## À propos de BARDEC
BARDEC est une marketplace B2B et B2C opérant principalement en Afrique francophone.
Elle met en relation des acheteurs professionnels (B2B), des consommateurs (B2C),
et des vendeurs/fournisseurs locaux et internationaux.

## Fonctionnalités clés
- Catalogue produits avec prix public (B2C) et prix gros (B2B)
- Paiement en plusieurs modes : carte, virement, Net-30 (crédit B2B)
- Gestion des commandes avec suivi en temps réel (pending → shipped → completed)
- BARDEC Proximity : commandes de proximité auprès des boutiques locales
- Tableaux de bord vendeur : gestion des stocks, commandes, analytics
- Tableau de bord admin : supervision globale, gestion des utilisateurs

## Rôles utilisateurs
- CUSTOMER : acheteur grand public (prix public)
- BUYER : acheteur B2B (prix gros, crédit disponible)
- APPROVER : validateur de bons de commande pour son entreprise
- VENDOR : vendeur/fournisseur avec tableau de bord dédié
- ADMIN : administrateur de la plateforme

## Statuts de commande
pending → pending_approval → approved → shipped → out_for_delivery → completed
(annulation possible : cancelled)

## Politique de retour
Retour accepté sous 30 jours pour tout produit défectueux ou non conforme.

## Support
Pour les problèmes urgents non résolus par OMNI, rediriger vers support@bardec.com.
`.trim();
