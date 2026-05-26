# Phase 4 Qdrant Prospect Memory — Design

**Date**: 2026-05-26  
**Statut**: draft pour review  
**Portée**: brancher une mémoire long terme réelle sur Qdrant pour le seul flux `Prospect`, avec écriture des événements utiles et retrieval léger au moment de générer les messages.

## Objectif

Après les Phases 1 à 3, Kenomi Canvas sait:

- créer un prospect;
- générer un draft initial;
- faire passer ce draft par approval humaine;
- matérialiser un draft Gmail local;
- suivre le pipeline CRM local;
- orchestrer la première relance avec approval, puis les suivantes via `follow_up_due`.

La limite actuelle est simple: chaque run `Prospect` repart presque de zéro.  
Le système stocke bien l’état transactionnel dans Supabase, mais il ne réutilise pas encore proprement l’historique commercial dans une mémoire vectorielle.

La Phase 4 doit rendre cette mémoire **réelle et exploitable**, sans ouvrir trop de surface:

- **écriture mémoire** dans Qdrant sur les événements Prospect importants;
- **retrieval léger** seulement dans le flux `Prospect`;
- **filtrage strict par `user_id`**;
- **aucun couplage prématuré** avec `Scout` ou `Content`.

Le but n’est pas de remplacer Supabase. Le but est d’ajouter une couche mémoire réutilisable pour mieux rédiger, mieux relancer et mieux éviter les répétitions ou les angles déjà invalidés.

## Contexte actuel

Le code contient déjà un point de départ:

- `lib/prospect/memory.ts` construit un `memory_record` structuré pour un prospect;
- `run-agent-step` écrit ce `memory_record` dans `prospects.metadata`, mais sans stockage vectoriel réel;
- le pipeline Prospect/CRM/approval/follow-up est maintenant validé en live.

Donc l’information utile existe déjà dans l’app, mais elle n’est pas encore:

- embedée;
- envoyée dans une collection Qdrant;
- relue par l’agent au moment utile.

## Approches considérées

### Option 1 — Write-only mémoire Qdrant

Le système écrit les événements Prospect dans Qdrant, mais ne les relit pas encore pendant les runs.

**Avantages**
- très peu risqué;
- valide l’infrastructure;
- permet d’observer le corpus mémoire avant de l’utiliser.

**Limites**
- conformité partielle seulement;
- l’agent n’utilise pas encore réellement cette mémoire.

### Option 2 — Write + retrieval léger sur `Prospect` uniquement

Le système écrit les événements utiles dans Qdrant, puis `Prospect` relit un petit nombre de souvenirs pertinents au moment de:

- générer un nouveau draft initial;
- générer un follow-up.

**Avantages**
- meilleur ratio conformité / risque;
- mémoire immédiatement utile;
- reste borné à un seul agent métier.

**Limites**
- nécessite une discipline claire sur ce qu’on indexe et ce qu’on injecte dans le prompt.

### Option 3 — Mémoire complète multi-agents dès maintenant

On branche directement `Prospect`, `Scout` et `Content` sur la même mémoire Qdrant.

**Avantages**
- vision long terme plus ambitieuse;
- meilleure mutualisation future.

**Limites**
- surface trop large pour une première intégration;
- débogage plus difficile;
- plus de risque de bruit mémoire.

## Approche retenue

L’approche retenue est **Option 2: write + retrieval léger sur `Prospect` uniquement**.

Pourquoi:

- elle rend la mémoire immédiatement utile;
- elle reste compatible avec l’architecture cible;
- elle limite le risque de dérive produit;
- elle prépare proprement les futures phases `Scout` et `Content`.

## Principes d’architecture

### Source de vérité

- **Supabase** reste la source de vérité transactionnelle et opérable.
- **Qdrant** devient une mémoire secondaire dérivée et optimisée pour la recherche sémantique.

On ne stocke pas l’état CRM “vivant” dans Qdrant.  
On y stocke des **souvenirs réutilisables**.

### Couche mémoire dédiée

La mémoire Qdrant ne doit pas être bricolée directement dans les routes ou dans les composants.

La Phase 4 doit introduire une couche dédiée, côté serveur:

- `lib/memory/qdrant-client.ts`
- `lib/memory/prospect-memory.ts`
- éventuellement `lib/memory/embeddings.ts`

Responsabilités:

- client Qdrant;
- formatage des points mémoire;
- embeddings;
- write;
- retrieval;
- interfaces claires pour `Prospect`.

### Filtrage strict

Chaque point mémoire doit embarquer au minimum:

- `user_id`
- `namespace`
- `prospect_id`

Le retrieval doit toujours filtrer par:

- `user_id`
- `namespace = prospects`

Il ne doit exister **aucune lecture cross-user**.

## Ce qu’on écrit dans Qdrant

### Namespace

Pour cette phase, un seul namespace:

- `prospects`

Pas de namespace `scout`, `content`, `devops` en Phase 4.

### Types de souvenirs

Les types mémoire retenus:

- `prospect_created`
- `outreach_draft_created`
- `follow_up_generated`
- `reply_recorded`
- `prospect_won`
- `prospect_lost`
- `operator_note`

Ces types couvrent le cycle commercial déjà construit.

### Format de chaque souvenir

Chaque point mémoire doit contenir:

- `id` stable ou dérivé;
- `user_id`;
- `namespace = prospects`;
- `prospect_id`;
- `company_name`;
- `memory_kind`;
- `pipeline_status`;
- `band`;
- `source`;
- `created_at`;
- `text` normalisé à embedder;
- `metadata` utile.

### Métadonnées minimales

Les métadonnées doivent rester petites et utiles:

- `pain_points`
- `tags`
- `outreach_kind`
- `draft_provider`
- `result` (`won`, `lost`, `replied`, etc.)
- `score`

Éviter les dumps JSON complets ou trop verbeux.

### Texte normalisé

Le texte embedé doit être exploitable par retrieval.

Exemple attendu:

```text
Acme Studio · follow_up_generated · warm lead from linkedin.
Pain points: manual triage, weak campaign visibility.
Operator note: mention shorter setup path.
Result so far: first follow-up approved.
```

Le texte doit:

- être lisible;
- porter le contexte utile;
- éviter les blobs structurés difficiles à relire.

## Points d’écriture

### 1. Création du prospect

Quand un prospect est créé dans `run-agent-step`, écrire un souvenir:

- `memory_kind = prospect_created`

Contenu:

- company name
- source
- score
- band
- summary
- pain points

### 2. Création d’un draft initial

Quand un draft Gmail initial est matérialisé:

- `memory_kind = outreach_draft_created`

Contenu:

- subject
- angle
- CTA
- type `initial`

### 3. Génération d’une relance

Quand une relance est générée:

- `memory_kind = follow_up_generated`

Contenu:

- `outreach_kind`
- sujet
- résumé de l’angle
- version de relance

### 4. Notes opérateur

Quand l’opérateur met à jour `operator_notes`:

- `memory_kind = operator_note`

On n’écrit pas tout automatiquement si la note est vide ou triviale.  
On n’indexe que les notes non vides.

### 5. Réponse / issue commerciale

Quand un prospect passe à:

- `replied`
- `won`
- `lost`

On écrit:

- `reply_recorded`
- `prospect_won`
- `prospect_lost`

Ces souvenirs sont critiques pour réutiliser les signaux de succès/échec.

## Ce qu’on relit dans `Prospect`

### Moments de retrieval

Le retrieval doit être injecté à deux moments seulement:

1. avant génération d’un nouveau draft initial;
2. avant génération d’un follow-up.

Pas de retrieval partout.

### Règles de retrieval

Top-k borné:

- `3` à `5` souvenirs max

Filtres:

- `user_id`
- `namespace = prospects`

Ordre:

- pertinence sémantique d’abord
- optionnellement pondérée par fraîcheur plus tard, mais pas nécessaire en première tranche

### Ce qu’on injecte dans le prompt

On ne doit pas injecter les points bruts complets.

La couche mémoire doit fournir un résumé compact du type:

```text
Relevant memory:
1. Acme Studio — lost after second follow-up because the angle focused too much on tooling, not ROI.
2. Beta Studio — won after concise follow-up mentioning setup speed and reply friction.
3. Gamma Labs — operator note: avoid long intro, go straight to campaign visibility issue.
```

Le prompt Prospect s’en sert pour:

- éviter les répétitions;
- adapter le ton;
- rappeler objections et angles qui ont déjà marché.

## Ce qu’on ne fait pas en Phase 4

La Phase 4 ne doit pas encore:

- brancher `Scout` sur Qdrant;
- brancher `Content` sur Qdrant;
- faire de la consolidation mémoire multi-agent;
- faire du résumé périodique batch;
- exposer une UI mémoire complexe;
- remplacer Supabase comme source métier.

Rester focalisé sur `Prospect`.

## Configuration requise

Variables d’environnement attendues:

- `QDRANT_URL`
- `QDRANT_API_KEY` si nécessaire
- `QDRANT_COLLECTION_PROSPECTS`
- `EMBEDDING_MODEL`
- éventuelle clé/provider d’embedding si distinct du reste

Il faut aussi décider si les embeddings passent:

- par Ollama embeddings local;
- ou par un provider dédié.

### Recommandation embeddings

Pour rester aligné avec la philosophie self-hosted, la recommandation par défaut est:

- embeddings locaux si le runtime le supporte proprement;
- sinon une couche provider explicitement configurable.

Mais l’interface de la mémoire doit rester indépendante du provider.

## Contrats techniques proposés

### Écriture

Une API interne du style:

```ts
await writeProspectMemory({
  userId,
  prospectId,
  memoryKind: 'prospect_created',
  text,
  metadata,
})
```

### Retrieval

Une API interne du style:

```ts
const memories = await retrieveProspectMemories({
  userId,
  query,
  limit: 4,
})
```

### Format retourné

La retrieval doit renvoyer un format simple:

- `id`
- `score`
- `text`
- `metadata`

Puis une petite fonction de formatting pour le prompt.

## Gestion des erreurs

La mémoire ne doit pas casser le flux Prospect principal si Qdrant échoue.

Règle de gouvernance:

- **écriture mémoire**: best effort avec audit/log si échec;
- **retrieval mémoire**: fallback silencieux à “no memory context”;
- **aucune panne Qdrant** ne doit empêcher la création d’un prospect.

Cela garde le système robuste tout en permettant d’observer les ratés.

## Sécurité et conformité

- uniquement serveur;
- aucun accès navigateur direct à Qdrant;
- filtrage par `user_id`;
- collection dédiée `prospects`;
- pas de cross-tenant leakage;
- logs prudents pour ne pas recopier des blocs de mémoire complets dans les erreurs.

## Validation attendue

La Phase 4 est considérée réussie si:

1. un prospect créé écrit bien un point en Qdrant;
2. une note opérateur écrit bien un point mémoire;
3. un `won` ou `lost` écrit bien un point mémoire;
4. un run Prospect relit réellement des souvenirs;
5. le retrieval est filtré par `user_id`;
6. si Qdrant tombe, le flux Prospect continue quand même.

## Tests attendus

### Tests unitaires

- formatage d’un point mémoire;
- mapping `memory_kind -> text + metadata`;
- formatting prompt du retrieval;
- filtres `user_id` / namespace;
- fallback sans mémoire.

### Tests d’intégration

- création Prospect -> write mémoire;
- note CRM -> write mémoire;
- `won/lost` -> write mémoire;
- retrieval injecté dans `Prospect`.

### Smoke

Le smoke live n’a pas besoin de valider toute la couche Qdrant d’un coup si l’environnement ne l’expose pas facilement, mais il faut au minimum un chemin vérifiable de:

- write;
- retrieval;
- fallback.

## Critère de fin

À la fin de la Phase 4:

- Qdrant est réellement branché;
- la mémoire `Prospect` est écrite au fil du pipeline;
- `Prospect` réutilise un petit contexte mémoire utile;
- le système reste robuste si la mémoire échoue;
- l’architecture devient significativement plus conforme au prompt cible.
