# AGENTS.md — Contexte partagé pour BARDEC

Ce fichier est destiné à tout agent IA (Replit, Cursor, Claude Code, Codex...) travaillant sur ce repo. Lis-le en entier avant toute modification — il contient des pièges réels déjà rencontrés, pas des suppositions.

---

## 1. Le projet en une phrase

BARDEC est une marketplace mobile B2B/B2C pour l'Afrique de l'Ouest (Expo/React Native + Supabase), avec 6 rôles utilisateurs, paiement mobile money, commerces de proximité géolocalisés, et un assistant IA intégré (ABFINI/OMNI).

## 2. Stack technique

- **App mobile** : Expo (React Native), TypeScript
- **Backend** : Supabase — PostgreSQL + Auth (JWT) + Storage + Realtime + Edge Functions (Deno/TypeScript)
- **Web** : export Expo Web, déployé sur Vercel sous `/app` (landing page séparée à la racine `/`)
- **CI/CD** : GitHub Actions (`.github/workflows/build-apk.yml`) → build EAS automatique à chaque push sur `main`, déclenchable aussi manuellement (`workflow_dispatch`)
- **IA intégrée** : ABFINI/OMNI — Edge Function `omni-agent`, appelle Claude (Anthropic API) avec function calling vers le serveur MCP

## 3. Projets Supabase

- **Production** : `asawazxocogumygptdwh` (`asawazxocogumygptdwh.supabase.co`)
- **Staging** : `qqmclabgafhfnbnqnvln` (mêmes schéma/policies, données de test) — se met parfois en pause faute d'activité (plan gratuit), normal

## 4. ⚠️ Pièges déjà rencontrés — NE PAS REFAIRE CES ERREURS

### 4.1 Fonctions appelées par des RLS policies → toujours `SECURITY DEFINER`

`current_user_role()` a causé une **récursion infinie** ("stack depth limit exceeded") qui bloquait TOUTES les lectures de `products`/`orders` en production pendant des semaines, sans erreur visible côté app (juste des listes vides). Cause : la fonction n'était pas `SECURITY DEFINER`, donc son propre `SELECT ... FROM users` déclenchait les policies RLS de `users`, qui rappelaient `current_user_role()`, etc. **Règle : toute fonction SQL utilisée dans une clause `USING`/`WITH CHECK` d'une policy RLS doit être `SECURITY DEFINER` si elle interroge une table elle-même protégée par RLS.**

### 4.2 Chaque table avec RLS activé a besoin d'une policy PAR OPÉRATION

Activer `ENABLE ROW LEVEL SECURITY` bloque TOUT par défaut. On a eu deux fois le même oubli :

- `users` sans policy `INSERT` → impossible de s'inscrire (`new row violates row-level security policy`)
- `orders` sans policy `INSERT` → impossible de passer commande, alors que `SELECT` fonctionnait

**Règle : après avoir activé RLS sur une table, vérifier qu'il existe une policy pour CHAQUE opération réellement utilisée par l'app (SELECT, INSERT, UPDATE, DELETE) — `ALL` ne suffit pas si les policies existantes ne couvrent qu'un sous-ensemble.**

### 4.3 Jamais d'ID mocké codé en dur pour les champs UUID

Le sélecteur de rôle de test (`"CHANGER DE RÔLE (TEST)"`) utilise des ID courts type `"u1"`, `"u4"` en interne. Plusieurs formulaires (ajout produit, création commande) ont envoyé ces valeurs directement à Supabase au lieu du vrai UUID → erreur `invalid input syntax for type uuid`.

**Règle : toujours récupérer l'ID réel via `(await supabase.auth.getUser()).data.user.id`, jamais une valeur liée au sélecteur de rôle de test.**

### 4.4 Trigger anti-élévation de privilèges — ne pas le contourner par erreur

`prevent_role_escalation()` (sur `users`) empêche un utilisateur de changer son propre rôle vers ADMIN/APPROVER via l'API, et empêche tout changement de rôle non-admin après inscription. C'est voulu (faille de sécurité corrigée). Si un vrai admin doit changer un rôle en direct via SQL, désactiver temporairement le trigger nommé (`ALTER TABLE users DISABLE TRIGGER trg_prevent_role_escalation;` puis le réactiver après) plutôt que de le supprimer.

### 4.5 Rafraîchissement d'état après mutation

Plusieurs bugs "ça s'enregistre en base mais ne s'affiche pas à l'écran" venaient de listes qui ne se refetch pas après un insert/update réussi (produits, avatar). Toujours prévoir soit un refetch, soit une mise à jour optimiste de l'état local après une mutation Supabase réussie.

### 4.6 Cache Metro / Expo Go

Plusieurs "bugs" signalés n'étaient en fait qu'un cache Metro non rafraîchi côté téléphone. Avant de creuser un bug qui semble contredire un fix déjà confirmé dans le code : fermer complètement Expo Go (pas juste minimiser) et rescanner le QR code.

## 5. Conventions du projet

- **Textes multilingues** : colonnes `name_i18n` / `description_i18n` en `JSONB`, format `{"fr": "...", "en": "...", ...}` — 20 langues prévues (10 africaines + 10 mondiales)
- **Devise** : XOF (FCFA) par défaut
- **Statuts de commande** : `pending → pending_approval (si B2B) → approved → shipped → ready_for_delivery → out_for_delivery → completed` (ou `cancelled` à tout moment)
- **Paiement** : `payment_status` séparé de `status` de la commande — `pending → awaiting_verification (preuve manuelle) → paid/failed/refunded`
- **Storage** : buckets `avatars` et `products`, convention de nommage `{user_id}/nom-fichier.jpg` (policies RLS basées sur `storage.foldername(name)[1] = auth.uid()`)
- **Rôles** : CUSTOMER, BUYER, APPROVER, VENDOR, ADMIN + rôle "Commerçant de quartier" (via `proximity_shops`, pas un rôle `users.role` séparé — n'importe quel utilisateur peut ouvrir une boutique de proximité)

## 6. Serveur MCP (déjà déployé, ne pas dupliquer)

Edge Function `mcp-server`, endpoint `https://asawazxocogumygptdwh.supabase.co/functions/v1/mcp-server`, protocole JSON-RPC 2.0, auth par header `X-API-Key`. Expose 12 outils (search_products, get_order_status, create_order, nearby_shops, etc.). Voir le code source dans `supabase/functions/mcp-server/` pour la liste complète et les conventions de réponse.

## 7. ABFINI/OMNI (assistant IA intégré à l'app)

Edge Function `omni-agent` (JWT Supabase standard, pas de clé API custom) — appelle Claude avec function calling, qui utilise le serveur MCP en lecture seule (clé `omni-agent-v0.1`, permissions `['read']` uniquement — **volontairement pas d'écriture en v0.1**, voir `supabase/functions/omni-agent/lib/mcp-tools.ts` pour la justification). Tables dédiées : `omni_conversations`, `omni_messages`, `omni_memory` (séparées de `conversations`/`messages` qui sont pour le chat P2P humain-humain).

## 8. État actuel (à mettre à jour au fil du projet)

- ✅ Auth, RLS, création de compte, changement de rôle : fonctionnels et corrigés
- ✅ Catalogue produits connecté à Supabase (plus de données mockées)
- ✅ Panier → commande : insertion réelle en base fonctionnelle
- ✅ Upload d'images produit vers Storage
- ✅ OMNI intégré (bouton flottant + chat)
- 🔄 En cours : mise à jour de statut de commande côté vendeur, onglet "Approbation" côté Approver, upload photo de profil, badges de navigation
- ⏳ À faire : version iOS (compte Apple Developer requis), version desktop installable, publication Play Store

## 9. Infrastructure / liens utiles

- Repo : `github.com/aronadiop2303-ai/BARDEC` (privé à l'origine, actuellement public)
- Site web : `bardec-ard27.vercel.app` (landing) + `bardec-ard27.vercel.app/app` (web app)
- Réseaux sociaux officiels : Instagram `bar_dec_`, Facebook, X `bardec_cofficie`, YouTube `bardec-officiel`, Telegram `B_ARDEC`
