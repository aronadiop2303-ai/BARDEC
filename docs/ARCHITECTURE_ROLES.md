# Architecture des rôles BARDEC

## Objectif

BARDEC conserve ses rôles existants et ajoute **Partenaire** comme sixième rôle principal. Cette évolution est additive : elle ne doit supprimer, remplacer ou réécrire aucun travail existant.

## Les 6 rôles principaux

1. **Acheteur** — recherche, commande, paiement, suivi et gestion de ses achats.
2. **Vendeur / Marchand** — catalogue, produits, commandes, stock et activité commerciale.
3. **Approbateur** — validation des opérations qui nécessitent une approbation selon les règles métier.
4. **Contrôleur** — contrôle, vérification, détection des anomalies/fraudes et suivi de conformité.
5. **Admin** — administration, gouvernance, configuration et supervision globale autorisée.
6. **Partenaire** — acteur externe collaborant avec BARDEC avec des permissions adaptées à son type de partenariat.

## Architecture du rôle Partenaire

`Partenaire` est un rôle-cadre extensible. Il ne doit pas être limité à un seul métier.

Types de partenaires prévus :

### Logistique
- Livreur externe
- Coursier
- Transporteur indépendant
- Entreprise logistique
- Gestionnaire de livraison

### Commerce et approvisionnement
- Fournisseur
- Grossiste
- Partenaire commercial
- Point relais
- Entrepôt / stockage

### Finance et paiement
- Partenaire de paiement
- Banque / établissement financier
- Partenaire financier
- Financeur

### Technologie
- Partenaire technologique
- Fournisseur d'API
- SaaS / infrastructure
- Partenaire IA

### Services
- Prestataire de services
- Technicien / réparateur
- Agent commercial
- Autre prestataire spécialisé

### Marketing et média
- Partenaire marketing
- Média
- Créateur / influenceur
- Partenaire de distribution

### Institutionnel et développement
- Institution
- ONG / organisme
- Partenaire de formation
- Investisseur / financeur
- Partenaire stratégique
- Partenaire international

### Extensibilité
- **Autre partenaire** : catégorie de secours permettant d'intégrer de futurs modèles sans refonte de l'architecture.

## Principe de permissions

Le rôle global ne suffit pas à déterminer les accès. Le modèle cible est :

**Rôle → Type de partenaire → Permissions → Périmètre de données → Actions autorisées**

Exemple : un livreur externe peut accéder uniquement aux livraisons qui lui sont attribuées, tandis qu'un partenaire de paiement possède un périmètre différent.

## Règle de non-régression

Cette architecture est une extension du système existant. Claude Code doit :

- ne supprimer aucun rôle, écran, table, fonction, politique RLS, route ou workflow existant ;
- ne pas remplacer une implémentation existante uniquement pour introduire Partenaire ;
- réutiliser les abstractions existantes lorsqu'elles sont compatibles ;
- préserver Auth, RLS, Supabase, navigation, paiements, commandes, proximité et les fonctionnalités déjà validées ;
- effectuer les changements par petites étapes vérifiables ;
- documenter tout conflit avant de modifier une fonctionnalité existante.

## Ordre recommandé d'implémentation

1. Documenter le rôle `partner` et ses sous-types.
2. Auditer le schéma actuel des rôles et permissions.
3. Vérifier les tables/profils et les politiques RLS existantes.
4. Ajouter uniquement les champs/tables nécessaires et compatibles avec l'existant.
5. Ajouter les routes et dashboards nécessaires sans modifier ceux des autres rôles.
6. Implémenter les permissions par type de partenaire.
7. Ajouter les tests Auth/RLS/navigation et les tests de non-régression.
8. Tester sur téléphone via Expo Go ; ne pas lancer d'émulateur Android.
9. Ne faire aucune migration destructive.

## État de cette spécification

Cette page constitue une **spécification d'architecture**. Elle ne demande pas à elle seule de modifier immédiatement toute l'application. Toute implémentation doit d'abord auditer l'existant et préserver les travaux déjà réalisés par Claude Code.
