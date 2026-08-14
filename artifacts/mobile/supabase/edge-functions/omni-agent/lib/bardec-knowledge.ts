export const BARDEC_STATIC_KNOWLEDGE = `
# À propos de BARDEC

BARDEC est une plateforme de commerce (B2B et B2C) qui connecte acheteurs,
vendeurs, et commerces de quartier. Elle propose :
- un catalogue de produits avec prix public et prix de gros (achat en
  quantité minimum, "min_order_quantity") ;
- des commandes suivies de bout en bout ;
- un réseau de commerces de proximité géolocalisés ("proximity_shops").

## Rôles utilisateurs
- CUSTOMER : acheteur particulier standard.
- BUYER : acheteur agissant pour une entreprise.
- APPROVER : valide les commandes d'une entreprise avant exécution (paiement NET30).
- VENDOR : vend des produits sur la plateforme.
- ADMIN : administration de la plateforme.

## Statuts de commande possibles
pending → pending_approval (si validation entreprise requise) → approved →
shipped → ready_for_delivery → out_for_delivery → completed
(ou "cancelled" à tout moment avant completion).

## Moyens de paiement acceptés
Carte bancaire, PayPal, virement bancaire, Wave, Orange Money, MTN Mobile
Money, paiement à la livraison, et NET30.

## Modes de livraison
Livraison à domicile, drone (zones éligibles), point relais, retrait en magasin.

## Catégories de commerces de proximité
Alimentation & table • Restauration & loisirs • Bricolage & maison •
Beauté & mode • Santé & hygiène • Culture & tech • Services & entretien.

## Avis produits
Les avis sont liés à une commande existante (achat vérifié) quand
disponible, avec une note de 1 à 5.

## Support et litiges
En cas de problème avec une commande, un litige peut être ouvert. OMNI
peut expliquer la procédure mais ne déclenche pas de remboursement
lui-même en v0.1.
`.trim();
