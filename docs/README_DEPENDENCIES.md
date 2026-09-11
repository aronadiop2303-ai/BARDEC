# BARDEC — Architecture des dépendances, Ports & Adapters

> Objectif : permettre à BARDEC de choisir le meilleur fournisseur pour chaque besoin sans rendre le cœur métier dépendant d'un fournisseur particulier.

## 1. Vision

BARDEC doit pouvoir évoluer sans être prisonnier d'une technologie, d'un fournisseur, d'une plateforme ou d'une API.

Principe fondamental :

```text
BARDEC CORE
    ↓
PORT / INTERFACE
    ↓
ADAPTER
    ↓
PROVIDER
```

Exemple :

```text
PaymentPort
     ↓
PaymentAdapter
     ↓
Provider A / Provider B / Provider C
```

Le Core BARDEC doit, lorsque cela est pertinent, manipuler des concepts métier BARDEC plutôt que des APIs ou erreurs propriétaires.

---

## 2. Règle absolue : préserver l'existant

Tout travail futur de découplage doit être :

- progressif ;
- testable ;
- réversible ;
- non destructif ;
- compatible avec les fonctionnalités existantes.

Ne pas supprimer, réécrire ou migrer massivement du code uniquement pour créer des abstractions.

Le découplage ne doit pas casser :

- authentification ;
- rôles et permissions ;
- RLS ;
- Supabase ;
- navigation ;
- commandes ;
- paiements existants ;
- données ;
- mobile ;
- web ;
- backend.

---

## 3. Objectif réel

L'objectif n'est **pas** de rendre chaque élément abstrait.

L'objectif est :

> Isoler les dépendances qui peuvent devenir stratégiques, coûteuses ou difficiles à remplacer.

Une abstraction inutile augmente la complexité et les risques. Toute abstraction doit donc être justifiée par un bénéfice réel.

---

## 4. Architecture de référence

```text
                    ┌──────────────────────┐
                    │     BARDEC CORE      │
                    │                      │
                    │  Logique métier      │
                    │  Règles métier       │
                    │  Domaine             │
                    └──────────┬───────────┘
                               │
                         PORT / INTERFACE
                               │
                    ┌──────────▼───────────┐
                    │       ADAPTER        │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
           PROVIDER A     PROVIDER B     PROVIDER C
```

Le fournisseur peut être remplacé avec un impact minimal sur le Core.

---

## 5. Périmètre de l'audit

L'audit des dépendances doit couvrir tout le repository :

### Frontend / Mobile / Web
- React Native
- Expo
- Expo Router
- TypeScript
- composants
- hooks
- services
- navigation
- gestion d'état
- formulaires

### Backend
- API
- services
- Edge Functions
- logique métier
- validation
- webhooks
- sécurité

### Base de données
- PostgreSQL
- Supabase
- tables
- relations
- RPC
- triggers
- index
- contraintes
- pgvector

### Authentification / Autorisation
- comptes
- sessions
- JWT
- OAuth
- email
- téléphone
- OTP
- récupération de compte
- suppression de compte
- rôles
- permissions
- RLS

### Infrastructure
- Supabase
- PostgreSQL
- Vercel
- GitHub
- GitHub Actions
- EAS
- Expo

### Services externes
- paiements
- Mobile Money
- cartes
- géolocalisation
- SMS
- email
- Push
- WhatsApp
- Telegram
- stockage
- CDN
- recherche
- analytics
- monitoring
- IA
- traitement d'images/vidéos

### Données et opérations
- fichiers
- backups
- logs
- métriques
- restauration
- CI/CD
- secrets
- configuration

---

## 6. Niveaux de couplage

Chaque dépendance doit être classée :

### 🟢 Faible
Abstraction existante et remplacement relativement simple.

### 🟡 Moyen
Abstraction partielle ou plusieurs références directes.

### 🟠 Fort
Le fournisseur traverse plusieurs couches de l'application.

### 🔴 Critique
Le fournisseur est profondément intégré au Core, aux données ou à une fonction stratégique.

---

## 7. Niveau de remplaçabilité

### Niveau 0 — Non remplaçable

```text
Core → Provider
```

### Niveau 1 — Très difficile

Une abstraction existe mais le fournisseur traverse encore plusieurs couches.

### Niveau 2 — Partiellement remplaçable

Le remplacement est possible mais nécessite plusieurs modifications.

### Niveau 3 — Remplaçable

Un adapter isole correctement une grande partie du fournisseur.

### Niveau 4 — Hautement remplaçable

Le changement concerne principalement l'adapter.

### Niveau 5 — Multi-provider

Plusieurs fournisseurs peuvent implémenter la même interface.

```text
             Port
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
    Adapter Adapter Adapter
       │      │      │
       A      B      C
```

---

## 8. Ports / interfaces candidats

Ces ports sont des candidats à l'audit, pas des obligations.

```text
PaymentPort
MapsPort
StoragePort
NotificationPort
SmsPort
EmailPort
MessagingPort
AIPort
SearchPort
AnalyticsPort
MonitoringPort
GeolocationPort
FileProcessingPort
```

Pour chacun, vérifier d'abord si une abstraction apporte une vraie valeur.

---

## 9. Paiements

Architecture conceptuelle :

```text
BARDEC CORE
    ↓
PaymentPort
    ↓
PaymentAdapter
    ↓
Provider A / B / C
```

L'audit doit couvrir :

- paiement manuel ;
- Mobile Money ;
- paiement automatisé ;
- transactions ;
- webhooks ;
- remboursements ;
- statuts ;
- erreurs ;
- identifiants externes.

---

## 10. Cartographie et géolocalisation

Séparer conceptuellement, lorsque cela est utile :

```text
MapsPort
GeolocationPort
```

Analyser :

- GPS ;
- cartes ;
- géocodage ;
- recherche d'adresse ;
- distance ;
- itinéraires ;
- proximité.

---

## 11. Stockage

```text
StoragePort
    ↓
StorageAdapter
    ↓
Provider
```

Analyser :

- images ;
- vidéos ;
- documents ;
- fichiers ;
- buckets ;
- CDN ;
- URLs signées ;
- migration des données.

---

## 12. Notifications

```text
NotificationPort
        ↓
NotificationAdapter
        ↓
Push / SMS / Email / WhatsApp / Telegram / ...
```

Le Core ne doit pas être inutilement lié à un canal ou fournisseur particulier.

---

## 13. IA

Le système IA doit pouvoir évoluer entre modèles et fournisseurs lorsque cela est pertinent.

```text
BARDEC CORE
    ↓
AIPort
    ↓
AIAdapter
    ↓
Provider / Model
```

Analyser notamment :

- OMNI ;
- modèles ;
- fournisseurs IA ;
- embeddings ;
- RAG ;
- recherche vectorielle ;
- transcription ;
- vision ;
- traduction ;
- classification.

Le Core doit idéalement dépendre de capacités métier normalisées plutôt que de types propriétaires d'un fournisseur IA.

---

## 14. Recherche

Candidat :

```text
SearchPort
    ↓
SearchAdapter
    ↓
Search Provider
```

Analyser :

- recherche textuelle ;
- full-text ;
- recherche sémantique ;
- vector search ;
- indexation.

---

## 15. Erreurs normalisées

Éviter :

```text
Core → ProviderError
```

Préférer lorsque nécessaire :

```text
Provider
   ↓
Adapter
   ↓
BARDEC_ERROR
   ↓
Core
```

Exemples de concepts normalisés :

```text
PAYMENT_FAILED
PAYMENT_TIMEOUT
PAYMENT_DECLINED
PAYMENT_PENDING
PAYMENT_PROVIDER_UNAVAILABLE
```

Même principe pour les autres fournisseurs.

---

## 16. Webhooks et événements

Éviter de faire entrer directement les formats propriétaires dans le Core.

```text
External Provider
       ↓
Webhook Adapter
       ↓
Normalized Event
       ↓
BARDEC Core
```

Exemples :

```text
PAYMENT_CONFIRMED
PAYMENT_FAILED
ORDER_UPDATED
DELIVERY_UPDATED
USER_VERIFIED
```

L'idempotence, la validation de signature et la sécurité doivent être vérifiées pour chaque webhook.

---

## 17. Identifiants internes et externes

Le système doit distinguer autant que possible :

```text
BARDEC_ID
```

et :

```text
EXTERNAL_PROVIDER_ID
```

Exemple :

```text
BARDEC_PAYMENT_ID
+
EXTERNAL_TRANSACTION_ID
```

Le fournisseur externe ne doit pas devenir l'identité fondamentale de BARDEC sans raison valable.

---

## 18. Données portables

L'audit doit vérifier si les données sont :

- exportables ;
- dans des formats standards ;
- liées à des structures propriétaires ;
- liées à des IDs propriétaires ;
- migrables vers une autre infrastructure.

Analyser notamment :

- users ;
- products ;
- orders ;
- payments ;
- messages ;
- documents ;
- images ;
- embeddings ;
- logs ;
- fichiers.

---

## 19. Configuration et secrets

Identifier les choix codés en dur et les configurations spécifiques aux fournisseurs.

Exemples conceptuels :

```text
PAYMENT_PROVIDER
MAP_PROVIDER
SMS_PROVIDER
EMAIL_PROVIDER
AI_PROVIDER
SEARCH_PROVIDER
STORAGE_PROVIDER
```

Une configuration ne remplace toutefois pas une véritable séparation architecturale.

---

## 20. Vendor Lock-in

Le lock-in doit être évalué selon :

- données propriétaires ;
- API propriétaire ;
- SDK profondément intégré ;
- IDs propriétaires ;
- formats propriétaires ;
- webhooks propriétaires ;
- logique métier dépendante du fournisseur ;
- infrastructure spécifique ;
- difficulté de migration ;
- coût de migration ;
- risque de downtime ;
- risque de perte de données.

Classement :

🟢 faible

🟡 modéré

🟠 élevé

🔴 critique

---

## 21. Dépendances acceptables

Toutes les dépendances ne sont pas mauvaises.

Une dépendance peut être acceptable lorsqu'elle est :

- standard ;
- stable ;
- largement adoptée ;
- peu présente dans le Core ;
- facilement remplaçable ;
- raisonnable au regard du coût et du bénéfice.

Le but n'est pas « zéro dépendance ».

> Le but est : **zéro dépendance critique inutile.**

---

## 22. Principe Best Provider

BARDEC doit pouvoir choisir le meilleur fournisseur selon le besoin réel.

Critères possibles :

- performance ;
- coût ;
- disponibilité ;
- sécurité ;
- fiabilité ;
- couverture géographique ;
- fonctionnalités ;
- conformité ;
- simplicité ;
- qualité API ;
- support ;
- communauté ;
- réversibilité ;
- capacité de migration.

Le fournisseur choisi aujourd'hui n'est pas nécessairement celui qui sera optimal demain.

---

## 23. Multi-provider

Le multi-provider n'est pas obligatoire.

L'objectif est d'être libre de choisir, pas nécessairement d'utiliser plusieurs fournisseurs simultanément.

```text
                    PORT
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Provider A Provider B Provider C
```

Le multi-provider doit être introduit uniquement lorsqu'il apporte une valeur réelle : disponibilité, coût, couverture, performance, résilience ou autre avantage mesurable.

---

## 24. Core BARDEC à protéger

Les concepts métier doivent rester aussi indépendants que raisonnablement possible :

- utilisateurs ;
- rôles ;
- permissions ;
- acheteurs ;
- vendeurs ;
- produits ;
- stocks ;
- paniers ;
- commandes ;
- paiements ;
- livraisons ;
- partenaires ;
- approbations ;
- contrôle ;
- commissions ;
- règles métier ;
- logique métier.

Ces concepts ne doivent pas être définis par un fournisseur externe.

---

## 25. Dépendances stratégiques

Une dépendance peut être volontairement conservée lorsqu'un fournisseur apporte une forte valeur :

- coût ;
- performance ;
- sécurité ;
- disponibilité ;
- simplicité ;
- support ;
- écosystème ;
- couverture.

La règle est : connaître le coût du lock-in et conserver une voie de sortie raisonnable lorsque cela est pertinent.

---

## 26. Audit avant abstraction

Avant de créer un Adapter ou un Port :

1. vérifier la dépendance réelle ;
2. compter ses usages ;
3. déterminer si elle traverse le Core ;
4. évaluer le coût de remplacement ;
5. évaluer le lock-in ;
6. vérifier les alternatives crédibles ;
7. mesurer le bénéfice de l'abstraction ;
8. mesurer le risque de régression ;
9. choisir l'abstraction minimale suffisante.

---

## 27. Matrice d'audit

Chaque dépendance doit pouvoir être documentée ainsi :

| Domaine | Fournisseur | Couplage | Lock-in | Port | Adapter | Remplaçabilité | Priorité |
|---|---|---|---|---|---|---|---|
| Paiement | À auditer | À déterminer | À déterminer | Oui/Non | Oui/Non | 0–5 | P0–P3 |
| Cartographie | À auditer | À déterminer | À déterminer | Oui/Non | Oui/Non | 0–5 | P0–P3 |
| IA | À auditer | À déterminer | À déterminer | Oui/Non | Oui/Non | 0–5 | P0–P3 |
| Stockage | À auditer | À déterminer | À déterminer | Oui/Non | Oui/Non | 0–5 | P0–P3 |
| Notifications | À auditer | À déterminer | À déterminer | Oui/Non | Oui/Non | 0–5 | P0–P3 |

Cette matrice doit être remplie à partir du code réel, jamais à partir d'hypothèses.

---

## 28. Priorités

### 🔴 P0 — Critique

Dépendance pouvant fortement compromettre les données, la sécurité, les paiements, la disponibilité ou le Core métier.

### 🟠 P1 — Importante

Risque de lock-in significatif.

### 🟡 P2 — Recommandée

Amélioration utile mais non urgente.

### 🟢 P3 — Faible

Faible risque ou faible valeur d'abstraction.

---

## 29. Migration progressive

Lorsqu'une dépendance doit être isolée :

```text
ÉTAT ACTUEL
Core → Provider

      ↓

ÉTAPE 1
Core → Interface → Provider

      ↓

ÉTAPE 2
Core → Interface → Adapter → Provider

      ↓

ÉTAPE 3
Core → Interface → Adapter A / B / C
```

Chaque étape doit rester testable et réversible.

---

## 30. Simplicité avant abstraction

Éviter une chaîne inutile :

```text
Abstraction
 ↓
Abstraction
 ↓
Adapter
 ↓
Factory
 ↓
Provider
```

si une solution plus simple suffit.

Préférer :

```text
Core
 ↓
Port
 ↓
Adapter
 ↓
Provider
```

lorsqu'un découplage est réellement nécessaire.

---

## 31. Audit par les agents IA

Claude Code, Claude AI, Gemini ou tout autre agent intervenant sur BARDEC doit :

1. lire les instructions du repository ;
2. inspecter le code réel ;
3. cartographier les dépendances ;
4. identifier le couplage ;
5. identifier le lock-in ;
6. proposer les abstractions utiles ;
7. expliquer les avantages ;
8. expliquer les risques ;
9. proposer un changement minimal ;
10. attendre une autorisation explicite avant toute modification lorsqu'une mission est en mode audit.

### Mode audit

Une mission d'audit doit être **READ-ONLY** :

- aucun fichier modifié ;
- aucun fichier supprimé ;
- aucune dépendance changée ;
- aucun schéma modifié ;
- aucun commit ;
- aucune branche ;
- aucune PR ;
- aucune migration automatique.

---

## 32. Rapport d'audit attendu

Un audit complet doit produire :

### A. État actuel
Niveau général de découplage.

### B. Dépendances critiques
Liste des dépendances dangereuses.

### C. Dépendances acceptables
Liste des dépendances assumées.

### D. Dépendances à isoler
Liste des dépendances présentant un intérêt réel à être abstraites.

### E. Ports recommandés
Liste des interfaces proposées.

### F. Adapters recommandés
Liste des adapters proposés.

### G. Lock-in
Analyse du risque de vendor lock-in.

### H. Données
Analyse de la portabilité des données.

### I. Identifiants
Analyse des IDs internes et externes.

### J. Webhooks
Analyse des événements externes.

### K. Architecture cible
Diagramme complet.

### L. Top 10 priorités
Classement des améliorations.

### M. Éléments à ne pas toucher
Liste des parties fonctionnelles à préserver.

---

## 33. Architecture cible conceptuelle

```text
┌───────────────────────────────────────────────────────┐
│                    BARDEC CORE                        │
│                                                       │
│ Users • Products • Orders • Payments • Delivery      │
│ Partners • Roles • Rules • Business Logic             │
└──────────────────────────┬────────────────────────────┘
                           │
                    PORTS / INTERFACES
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
   PaymentPort          MapsPort             AIPort
       │                   │                   │
       ▼                   ▼                   ▼
 PaymentAdapter        MapsAdapter         AIAdapter
       │                   │                   │
   ┌───┼───┐          ┌────┼────┐        ┌────┼────┐
   ▼   ▼   ▼          ▼    ▼    ▼        ▼    ▼    ▼
   A   B   C          A    B    C        A    B    C
```

Même logique potentielle pour :

- Storage ;
- Notifications ;
- SMS ;
- Email ;
- Search ;
- Analytics ;
- Monitoring ;
- Geolocation ;
- Messaging ;
- File Processing.

---

## 34. Philosophie BARDEC

BARDEC ne doit pas chercher à être prisonnier d'une technologie.

Mais BARDEC ne doit pas non plus refuser une technologie uniquement parce qu'elle crée une dépendance.

La règle est :

> **Choisir librement, intégrer proprement, isoler lorsque nécessaire et pouvoir migrer lorsque cela devient pertinent.**

---

## 35. Principe final

```text
CHOISIR
   ↓
INTÉGRER
   ↓
ISOLER
   ↓
MESURER
   ↓
REMPLACER SI NÉCESSAIRE
```

et non :

```text
CHOISIR
   ↓
S'ENFERMER
   ↓
ÊTRE DÉPENDANT
   ↓
NE PLUS POUVOIR CHANGER
```

> **BARDEC doit dépendre de ses propres règles métier, pas des règles propriétaires de ses fournisseurs.**

Les fournisseurs, technologies, APIs, modèles IA, services de paiement et plateformes peuvent changer. Le Core métier BARDEC doit rester aussi stable, portable et indépendant que raisonnablement possible.

---

**Statut : Architecture / principe directeur**  
**Nature : Document conceptuel et d'audit**  
**Modification du code : Aucune dans le cadre de ce document**  
**Objectif : Découplage progressif, remplaçabilité et réduction du vendor lock-in**
