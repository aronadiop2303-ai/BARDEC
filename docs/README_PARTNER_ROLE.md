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

---

# ANNEXE — Implémentation réelle (Fondation, 11 sept)

> Cette section documente ce qui a été **réellement implémenté** dans le repo (projet Supabase `asawazxocogumygptdwh`), suite à un audit qui a trouvé plusieurs écarts entre un brief de mission générique et l'architecture réelle de BARDEC : pas de `SELLER`/`CONTROLLER` (c'est `VENDOR`, pas de rôle contrôleur), pas de `supabase/migrations/` versionné (migrations appliquées en direct contre le projet Supabase), pas de `types/database.types.ts` généré, pas de dossier `src/adapters/`.

## A. Schéma

**Enum `user_role`** (existant) : `PARTNER` ajouté sans toucher aux 5 valeurs existantes (`CUSTOMER`, `BUYER`, `APPROVER`, `VENDOR`, `ADMIN`).

**Enum `partner_type`** (nouveau, extensible) :
```sql
create type partner_type as enum (
  'DELIVERY', 'TRANSPORTER', 'LOGISTICS', 'SUPPLIER', 'WHOLESALER',
  'COMMERCIAL', 'PICKUP_POINT', 'WAREHOUSE', 'FINANCIAL', 'TECH_API',
  'AI', 'SERVICE_PROVIDER', 'TECHNICIAN', 'MARKETING', 'INSTITUTION_NGO',
  'INVESTOR', 'STRATEGIC_INTL', 'OTHER'
);
```

**Enum `partner_status`** (machine à états, distincte du type — §9) :
```sql
create type partner_status as enum (
  'PENDING', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE',
  'SUSPENDED', 'RESTRICTED', 'REJECTED', 'TERMINATED'
);
```

**Table `public.partners`** :
```sql
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  partner_type partner_type not null,
  status partner_status not null default 'PENDING',
  company_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
Pas de contrainte `UNIQUE(user_id)` — conformément à la section 12 de ce document (une organisation peut à terme exercer plusieurs types de partenariat), même si ce n'est pas exploité aujourd'hui.

⚠️ Une table `delivery_partners` existait déjà (livreurs internes/API, enum `delivery_partner_type: internal|external_api`). C'est un concept **différent** (intégration technique de livraison, pas le rôle Partenaire générique). Pas de collision de nom, mais à ne pas confondre.

## B. RLS (testée empiriquement — transactions annulées, comptes réels)

| Opération | Règle | Vérifié |
|---|---|---|
| SELECT | `user_id = auth.uid()` OU `ADMIN` | ✅ un autre compte non-admin voit 0 ligne |
| INSERT | `user_id = auth.uid()` ET `status = 'PENDING'` | ✅ tentative d'insert avec `status='APPROVED'` directement → rejetée (42501) |
| UPDATE | `user_id = auth.uid()` OU `ADMIN`, mais un trigger fige `status`/`partner_type`/`user_id` pour un non-admin | ✅ tentative d'auto-approbation + changement de type → les deux silencieusement annulés, `metadata`/`company_name` restent modifiables |
| DELETE | `ADMIN` uniquement | ✅ 0 ligne supprimée par un non-admin |
| Élévation `users.role → 'PARTNER'` | ADMIN uniquement (RLS `users_update_self` + trigger `prevent_user_field_escalation`, inchangés) | ✅ `current_user_role()` reflète bien `PARTNER` après élévation ; le compte garde l'accès à ses propres données (`users`, `partners`) ; aucune policy existante (`orders_approver`, `orders_admin`…) ne référence `PARTNER`, donc aucun accès non désiré n'est accordé automatiquement |

Trigger : `protect_partner_status()` — même pattern que `protect_order_sensitive_fields()`/`prevent_user_field_escalation()` déjà en place sur `orders`/`users`.

**Décision volontaire** : `PARTNER` n'a **pas** été ajouté aux rôles auto-sélectionnables à l'inscription (`users_insert_self`, policy inchangée). Un utilisateur candidate via `partners` indépendamment de son `users.role` actuel ; l'élévation vers `role='PARTNER'` reste une action manuelle ADMIN (base de données directe — comme **tout** changement de rôle dans BARDEC aujourd'hui : il n'existe aucune UI de changement de rôle dans l'admin, pour aucun rôle).

## C. Types TypeScript

- `artifacts/mobile/types/partner.ts` (nouveau — ce repo n'a pas de `database.types.ts` généré, chaque écran déclare ses interfaces à la frontière Supabase) : `PartnerType`, `PartnerStatus`, `PartnerRow`, et l'interface `PartnerAdapter` (Ports/Adapters, §14) avec `initialize()` / `getCapabilities()` / `validateConfig()`.
- `artifacts/mobile/constants/mockData.ts` : `UserRole` étendu avec `'PARTNER'` ; `User` étendu avec `partnerType?`/`partnerStatus?` (optionnels, no-op pour les 5 rôles existants).
- `artifacts/mobile/components/RoleBadge.tsx` : couleur badge ajoutée pour `PARTNER`. Libellé **non traduit** dans les 20 langues (`constants/translations.ts` est un `Record<TranslationKey, string>` strict répété sur 20 blocs de langue — y ajouter une clé correctement est un vrai chantier i18n séparé, volontairement non fait ici pour ne pas risquer une régression sur les 5 rôles déjà traduits). Repli sur le libellé anglais `"Partner"`.

## D. Auth & Navigation

- `context/AuthContext.tsx` : nouvelle fonction `enrichWithPartner()` (même pattern que `enrichWithCompany()`) — no-op pour tout rôle ≠ `PARTNER`, sinon lit la ligne `partners` la plus récente de l'utilisateur et peuple `partnerType`/`partnerStatus`.
- `app/(app)/(tabs)/_layout.tsx` : garde ajoutée — un compte `PARTNER` avec statut `PENDING`/`UNDER_REVIEW` est redirigé vers `app/(app)/partner-pending.tsx` au lieu de monter la bottom bar. Aucun impact sur les flux Acheteur/Vendeur/Approbateur/Admin (même principe que les gardes de rôle ajoutées le 11 sept sur `admin.tsx`/`vendor-dashboard.tsx`).
- `app/(app)/partner-pending.tsx` : écran d'attente minimal (statut, type de partenaire, déconnexion). Aucun espace partenaire fonctionnel au-delà — voir "Post-lancement" ci-dessous.

## E. Comment approuver un partenaire (procédure actuelle — pas d'UI dédiée)

1. Le candidat s'authentifie normalement (rôle existant inchangé) puis une ligne est insérée dans `partners` (`status='PENDING'`) — **côté client, aucun écran de candidature n'a été construit dans cette fondation** (voir Post-lancement) ; l'insertion peut pour l'instant se faire via une requête directe respectant la RLS (`user_id = auth.uid()`, `status = 'PENDING'`).
2. Un ADMIN passe la ligne en `UNDER_REVIEW` puis `APPROVED`/`REJECTED` :
   ```sql
   update partners set status = 'APPROVED' where id = '<partner_id>';
   ```
   (autorisé par RLS + trigger uniquement pour un compte `ADMIN` réel — vérifié empiriquement.)
3. Si l'organisation doit obtenir des permissions BARDEC plus larges que "voir/éditer sa propre ligne partenaire", un ADMIN élève manuellement son compte :
   ```sql
   update users set role = 'PARTNER' where id = '<user_id>';
   ```
   Cette étape est **volontairement séparée** de l'approbation `partners.status` (doc §9 : statut et permissions restent deux concepts distincts) et reste manuelle, comme tout changement de rôle dans BARDEC aujourd'hui.

## F. Étendre avec un nouveau type de partenaire (via l'adapter)

1. Ajouter la valeur au enum Postgres `partner_type` (migration `ALTER TYPE ... ADD VALUE`) et à l'union TypeScript `PartnerType` (`types/partner.ts`).
2. Implémenter `PartnerAdapter` pour ce type (capacités, validation de `metadata`) — aucun adapter concret n'existe encore, l'interface est prête à être implémentée au cas par cas.
3. Ne **jamais** dupliquer la logique RLS par type dans cette fondation : le périmètre par type (doc §6-§7) est un chantier post-lancement distinct, pas une modification de la table `partners` elle-même.

## G. Réservé pour la phase post-lancement (explicitement hors périmètre de cette fondation)

- Écran de candidature partenaire côté client (formulaire `partner_type` + `company_name` + `metadata`).
- Permissions granulaires (`partner.read`, `partner.manage_delivery`, …) et périmètre de données par type (doc §6-§8) — la fondation ne pose que rôle + type + statut, pas encore le système de permissions/scope détaillé.
- Élévation automatique `users.role → 'PARTNER'` déclenchée par l'approbation (aujourd'hui manuelle, par design — voir section E).
- Traduction du libellé "Partenaire" dans les 20 langues actives (`constants/translations.ts`).
- Ajout de `PARTNER` à la liste des rôles ciblables par l'admin dans l'onglet Notifications (`admin.tsx`) — trouvé pendant l'implémentation, non fait pour rester dans le périmètre strict de la mission.
- Adapters concrets par type de partenaire (`DeliveryPartnerAdapter`, `AIPartnerAdapter`, …).
- API/webhooks partenaires (doc §15-§16).
- Modules métier réels par type de partenaire (suivi de flotte LOGISTICS, catalogue SUPPLIER…) — seuls des libellés "Bientôt disponible" existent aujourd'hui (`partner-dashboard.tsx`, section H).

## H. Extension du 11 sept (suite) — onglet Admin Partenaires, Dashboard Partenaire enrichi, renommage du Dashboard Approbateur

Le rôle **PARTNER reste exclusivement géré par l'ADMIN** — aucun changement au rôle APPROVER ni à la RLS/trigger `protect_partner_status` : cette extension ajoute uniquement de l'UI et une colonne, sans toucher au périmètre de permissions posé en section B.

**Schéma** — colonne `status_reason text` ajoutée à `public.partners` (migration `add_partner_status_reason`), protégée par le même trigger `protect_partner_status()` que `status`/`partner_type`/`user_id` (étendu, pas remplacé) : un non-admin ne peut pas l'auto-éditer (vérifié empiriquement). Portée le motif que l'admin renseigne lors d'un rejet ou d'une suspension.

**`types/partner.ts`** — `PARTNER_TYPE_LABELS` et `PARTNER_STATUS_LABELS` (FR) déplacés ici comme unique source (étaient dupliqués dans `partner-dashboard.tsx` et `partner-pending.tsx`, qui importent désormais les deux). `PartnerRow` inclut `status_reason: string | null`.

**Admin — onglet "Partenaires"** (`admin.tsx`, `AdminTab` étendu) : même conventions que l'onglet "Sociétés B2B" (`keyCard`/`formInput`) et "Alertes" (chips `tabChip` pour les filtres). Liste jointe à `users!user_id(display_name, email, phone)` ; filtres TYPE (18 valeurs) et STATUT (8 valeurs) ; badge de comptage sur les statuts `PENDING`/`UNDER_REVIEW`. Actions : Approuver → `APPROVED` ; Rejeter → motif obligatoire (formulaire inline, même pattern que le rejet de paiement) → `REJECTED` ; Suspendre (motif obligatoire) ↔ Réactiver (sans motif) entre `SUSPENDED` et `ACTIVE`.

**Dashboard Partenaire** (`partner-dashboard.tsx`) : bannière d'alerte si une ligne `partners` de l'utilisateur repasse à `SUSPENDED`/`REJECTED` (affiche `status_reason`) — défense en profondeur pour le cas où le cache local `user.partnerStatus` n'a pas encore été rafraîchi après une décision admin ; la garde de navigation (section D) n'a pas changé. Section "Profil & compte" (coordonnées, identifiant partenaire, date d'adhésion, bouton "Contacter le support"). Placeholders "Bientôt disponible" désormais différenciés par type (`MODULE_PLACEHOLDERS`, ex. suivi de flotte pour LOGISTICS/TRANSPORTER, catalogue pour SUPPLIER/WHOLESALER) — toujours aucune logique métier réelle derrière (voir section G).

**Dashboard Approbateur renommé** — `approvals.tsx` → `approver-dashboard.tsx` (convention `*-dashboard.tsx` des autres rôles à écran dédié), tab `_layout.tsx` mis à jour (titre "Espace Approbateur", icône `clipboard-check` ajoutée à `components/Icon.tsx`). Le premier onglet visible pour `role === 'APPROVER'` était déjà cet écran (les onglets Accueil/Recherche/Panier/Commandes sont masqués pour ce rôle) — pas de changement structurel de position. Ajouts : garde explicite `!user?.companyId` (défense en profondeur en plus de la policy RLS `orders_approver`) ; jointure `customer:users!customer_id(display_name, email)` pour afficher l'employé demandeur ; affichage du crédit Net30 restant (`creditLimit - creditBalance`) dans l'en-tête.
