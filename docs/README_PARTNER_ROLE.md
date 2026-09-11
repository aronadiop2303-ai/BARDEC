# BARDEC — Architecture du rôle Partenaire

> Objectif : faire du rôle **Partenaire** une architecture extensible, sécurisée et découplée, capable d'accueillir de nouveaux types de partenaires sans devoir refondre le Core BARDEC.

---

## 1. Principe fondamental

Le rôle **Partenaire** est un rôle principal de BARDEC destiné aux acteurs externes qui collaborent avec l'écosystème BARDEC.

Le principe architectural est :

```text
RÔLE
  ↓
TYPE DE PARTENAIRE
  ↓
PERMISSIONS
  ↓
PÉRIMÈTRE DE DONNÉES
  ↓
ACTIONS AUTORISÉES
```

Un partenaire ne doit donc pas recevoir automatiquement les permissions d'un autre partenaire.

Son accès doit être déterminé par son **type**, ses **permissions**, son **périmètre** et son **statut**.

---

## 2. Partenaire comme rôle extensible

`Partenaire` doit être considéré comme une catégorie principale et extensible.

Exemples de types pouvant être représentés :

- Livreur externe
- Coursier
- Transporteur
- Entreprise logistique
- Fournisseur
- Grossiste
- Partenaire commercial
- Point relais
- Entrepôt
- Partenaire de paiement
- Banque / finance
- Partenaire technologique
- Fournisseur API
- Partenaire IA
- Prestataire de services
- Technicien / réparateur
- Agent commercial
- Marketing / média / créateur
- Institution / ONG / organisme
- Formation
- Investisseur / financeur
- Partenaire stratégique
- Partenaire international
- Autre partenaire

Cette liste n'est pas fermée.

---

## 3. Principe d'extensibilité

BARDEC ne doit pas dépendre d'une liste figée de types de partenaires.

Un nouveau type doit pouvoir être ajouté sans modifier toute l'architecture du système.

Conceptuellement :

```text
Partner
  ├── PartnerType
  ├── Permissions
  ├── DataScope
  ├── AllowedActions
  ├── Status
  └── Metadata
```

Le type `Autre` doit permettre de représenter un partenaire futur qui n'existait pas lors de la conception initiale.

---

## 4. Séparation rôle / type / permission

Il ne faut pas confondre :

```text
Rôle = Partenaire
```

avec :

```text
Type = Transporteur
```

ou :

```text
Type = Fournisseur
```

ou :

```text
Type = Partenaire IA
```

Le système doit conserver cette hiérarchie :

```text
Partenaire
    ↓
Type de partenaire
    ↓
Permissions
    ↓
Périmètre de données
    ↓
Actions autorisées
```

---

## 5. Principe du moindre privilège

Un partenaire doit recevoir uniquement les accès nécessaires à sa mission.

Exemple :

```text
Transporteur
    ↓
Commandes qui lui sont attribuées
    ↓
Informations nécessaires à la livraison
    ↓
Actions logistiques autorisées
```

Il ne doit pas obtenir automatiquement :

- toutes les commandes ;
- tous les utilisateurs ;
- tous les vendeurs ;
- toutes les données financières ;
- toutes les données administratives ;
- les données d'autres partenaires.

---

## 6. Périmètre des données

L'autorisation d'un partenaire doit pouvoir être limitée par :

- organisation ;
- entreprise ;
- boutique ;
- entrepôt ;
- zone géographique ;
- commande ;
- livraison ;
- produit ;
- client ;
- contrat ;
- mission ;
- période ;
- ressource attribuée.

Conceptuellement :

```text
Partner
   ↓
Scope
   ├── Organisation
   ├── Zone
   ├── Ressource
   ├── Mission
   └── Période
```

---

## 7. Permissions

Les permissions doivent être séparées du type de partenaire lorsque cela apporte une valeur architecturale.

Exemples :

```text
partner.read
partner.update
partner.view_orders
partner.view_products
partner.manage_delivery
partner.update_delivery_status
partner.view_documents
partner.upload_documents
partner.view_payments
partner.receive_assignments
partner.manage_inventory
partner.contact_customer
```

Un type de partenaire peut recevoir un ensemble de permissions par défaut, mais les permissions doivent rester contrôlables.

---

## 8. Actions autorisées

Une action doit être évaluée selon :

```text
Utilisateur
    ↓
Rôle
    ↓
Type de partenaire
    ↓
Permission
    ↓
Périmètre
    ↓
Ressource ciblée
    ↓
Action
```

Exemple :

```text
Transporteur
→ modifier le statut
→ uniquement d'une livraison qui lui est attribuée
```

---

## 9. Statut du partenaire

Le système doit pouvoir distinguer le type d'un partenaire de son état.

Exemples conceptuels :

```text
pending
under_review
approved
active
suspended
restricted
rejected
terminated
```

Un partenaire `approved` n'est pas nécessairement autorisé à effectuer toutes les actions.

Le statut et les permissions doivent rester deux concepts distincts.

---

## 10. Vérification / approbation

Selon le type de partenaire, BARDEC peut nécessiter une vérification préalable.

Conceptuellement :

```text
Demande
   ↓
Vérification
   ↓
Approbation
   ↓
Activation
   ↓
Permissions
```

Les exigences peuvent varier selon le type :

- identité ;
- entreprise ;
- documents ;
- licences ;
- coordonnées ;
- contrat ;
- informations financières ;
- capacité opérationnelle.

Ne pas appliquer les mêmes exigences à tous les partenaires si leur activité est différente.

---

## 11. Partenaire organisationnel

Un partenaire peut représenter une personne ou une organisation.

Architecture conceptuelle :

```text
Partner Account
      ↓
Organization
      ↓
Members / Users
      ↓
Roles / Permissions
```

Cela permet notamment de représenter :

- une entreprise logistique ;
- une banque ;
- un fournisseur ;
- une ONG ;
- un partenaire technologique ;
- une société internationale.

---

## 12. Plusieurs types pour une même organisation

Une organisation partenaire peut éventuellement exercer plusieurs activités.

Exemple :

```text
Entreprise X
 ├── Fournisseur
 ├── Transporteur
 └── Partenaire commercial
```

Ne pas imposer cette capacité si elle n'est pas nécessaire immédiatement, mais l'architecture doit éviter de l'interdire artificiellement.

---

## 13. Partenaire et fournisseurs externes

Le rôle Partenaire ne doit pas devenir une dépendance directe à un fournisseur technique.

Exemple :

```text
Partenaire de paiement
       ↓
PaymentPort
       ↓
PaymentAdapter
       ↓
Provider
```

Le type métier `Partenaire de paiement` appartient au domaine BARDEC.

Le fournisseur technique appartient à l'infrastructure.

Ces deux concepts doivent rester séparés.

---

## 14. Partenaire et architecture Ports / Adapters

Lorsqu'un partenaire représente une capacité externe, le Core peut utiliser un port stable.

Exemple :

```text
BARDEC CORE
     ↓
Partner Service / Port
     ↓
Partner Adapter
     ↓
External Partner System
```

Cela permet de connecter différents systèmes externes sans faire entrer leur logique propriétaire dans le Core.

---

## 15. API partenaires

Si BARDEC expose des APIs aux partenaires, l'accès doit être contrôlé par :

- authentification ;
- autorisation ;
- rôle ;
- type de partenaire ;
- permissions ;
- périmètre ;
- rate limiting ;
- validation ;
- journalisation ;
- rotation des credentials ;
- révocation ;
- expiration lorsque nécessaire.

Une API partenaire ne doit jamais être considérée comme une simple extension de l'accès utilisateur classique.

---

## 16. Webhooks partenaires

Pour les partenaires qui envoient des événements :

```text
Partner System
      ↓
Webhook Endpoint
      ↓
Verification
      ↓
Normalization
      ↓
BARDEC Core
```

Vérifier notamment :

- signature ;
- authentification ;
- timestamp ;
- replay attack ;
- idempotence ;
- schéma ;
- permissions ;
- journalisation.

---

## 17. Identifiants partenaires

BARDEC doit distinguer autant que possible :

```text
BARDEC_PARTNER_ID
```

et :

```text
EXTERNAL_PARTNER_ID
```

Même principe pour les ressources externes :

```text
BARDEC_ORDER_ID
EXTERNAL_ORDER_ID
```

Cela réduit le risque de lock-in et facilite les migrations.

---

## 18. Sécurité et RLS

Le rôle Partenaire doit être intégré à la stratégie globale d'autorisation et de RLS.

La règle fondamentale est :

> **Un partenaire ne doit accéder qu'aux données que son rôle, son type, ses permissions et son périmètre l'autorisent à consulter.**

Les contrôles doivent être vérifiés côté serveur / base de données lorsque les données sont sensibles.

L'interface mobile ou web ne doit jamais être considérée comme une frontière de sécurité suffisante.

---

## 19. Audit du rôle Partenaire

Avant toute implémentation ou modification, analyser le repository en lecture seule pour identifier :

- modèle utilisateur ;
- rôles existants ;
- permissions existantes ;
- tables utilisateurs ;
- tables partenaires éventuelles ;
- RLS ;
- policies ;
- routes ;
- écrans ;
- APIs ;
- Edge Functions ;
- notifications ;
- documents ;
- fichiers ;
- webhooks ;
- logs ;
- audit trail ;
- approbation ;
- suspension ;
- révocation.

---

## 20. Matrice des partenaires

La matrice cible doit pouvoir représenter :

| Type | Données accessibles | Actions | Permissions | Scope | Approbation |
|---|---|---|---|---|---|
| Livreur | Livraisons attribuées | Mettre à jour livraison | Livraison | Mission | Oui/selon activité |
| Fournisseur | Produits / commandes concernés | Gérer ressources autorisées | Fourniture | Contrat / organisation | Oui |
| Grossiste | Produits / stocks concernés | Gérer ressources autorisées | Stock / produit | Organisation | Oui |
| Transporteur | Missions logistiques | Mettre à jour livraison | Logistique | Mission / zone | Oui |
| Partenaire technologique | Ressources explicitement autorisées | Actions API autorisées | API | Contrat | Oui |
| Partenaire de paiement | Transactions nécessaires | Actions de paiement autorisées | Paiement | Périmètre contractuel | Oui |
| Autre | À définir | À définir | À définir | À définir | À définir |

Cette matrice est conceptuelle et doit être adaptée au code et aux besoins réels de BARDEC.

---

## 21. Type « Autre partenaire »

`Autre` ne doit pas signifier :

> accès général au système.

Il doit signifier :

> nouveau type à définir avec des permissions et un périmètre explicites.

Conceptuellement :

```text
Autre partenaire
      ↓
Définition du type
      ↓
Permissions
      ↓
Scope
      ↓
Actions
```

---

## 22. Extensibilité future

L'ajout d'un nouveau partenaire doit idéalement nécessiter principalement :

1. définition du type ;
2. définition des permissions ;
3. définition du périmètre ;
4. définition des actions ;
5. définition des règles d'approbation ;
6. définition des intégrations nécessaires.

Il ne doit pas nécessiter une refonte générale des rôles BARDEC.

---

## 23. Protection contre le sur-privilège

Interdictions architecturales :

- ne pas donner les permissions Admin à un partenaire ;
- ne pas confondre Approbateur et Partenaire ;
- ne pas confondre Contrôleur et Partenaire ;
- ne pas utiliser le frontend comme seule sécurité ;
- ne pas donner un accès global par défaut ;
- ne pas utiliser `Autre` comme rôle fourre-tout sans contrôle.

---

## 24. Compatibilité avec les autres rôles BARDEC

Le rôle Partenaire doit rester distinct des autres rôles principaux :

```text
Acheteur
Vendeur / Marchand
Approbateur
Contrôleur
Admin
Partenaire
```

Un même utilisateur ou une même organisation peut éventuellement avoir plusieurs relations avec BARDEC si l'architecture le permet, mais chaque relation doit être explicitement autorisée.

---

## 25. Architecture cible conceptuelle

```text
                         BARDEC
                            │
                    ┌───────▼───────┐
                    │   PARTENAIRE  │
                    └───────┬───────┘
                            │
                     TYPE DE PARTENAIRE
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
     Logistique         Fournisseur       Technologie
          │                 │                 │
          ▼                 ▼                 ▼
     Permissions       Permissions       Permissions
          │                 │                 │
          ▼                 ▼                 ▼
        Scope             Scope             Scope
          │                 │                 │
          ▼                 ▼                 ▼
       Actions           Actions           Actions
```

---

## 26. Principe final

Le rôle Partenaire doit être :

- extensible ;
- modulaire ;
- sécurisé ;
- contrôlable ;
- auditable ;
- compatible avec RLS ;
- compatible avec les APIs ;
- compatible avec les Ports / Adapters ;
- indépendant des fournisseurs lorsque nécessaire.

La règle fondamentale est :

> **Le type de partenaire détermine le contexte ; les permissions déterminent ce qu'il peut faire ; le périmètre détermine sur quelles données il peut le faire.**

---

## 27. Règle de modification

Ce document décrit l'architecture cible et les principes d'audit.

Avant toute modification du code BARDEC :

1. auditer l'existant ;
2. vérifier les rôles actuels ;
3. vérifier les permissions ;
4. vérifier les RLS ;
5. vérifier les routes et APIs ;
6. vérifier les données ;
7. proposer la modification minimale ;
8. obtenir une validation explicite ;
9. implémenter progressivement ;
10. tester avant toute migration.

**Aucune modification du code n'est imposée par ce document.**
