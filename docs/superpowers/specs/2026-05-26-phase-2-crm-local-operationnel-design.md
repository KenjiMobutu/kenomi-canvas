# Phase 2 CRM Local Opérationnel — Design

**Date**: 2026-05-26  
**Statut**: draft pour review  
**Portée**: transformer `/studio/prospects` en CRM local single-operator réellement exploitable, sans CRM externe ni assignation multi-user.

## Objectif

Après la Phase 1, Kenomi Canvas sait qualifier un prospect, générer un draft d'outreach, le soumettre à approbation humaine, puis le faire passer dans un pipeline outbound minimal.

La Phase 2 doit ajouter la couche CRM locale qui manque encore pour piloter proprement ce pipeline dans la durée:

- notes opérateur;
- prochaine action;
- tags;
- filtres pipeline;
- timeline exploitable;
- indicateurs simples de suivi commercial.

Le but n'est pas de construire un CRM générique. Le but est de rendre `Prospect` opérable au quotidien par une seule personne depuis Studio, sans dépendre d'un outil tiers.

## Contexte actuel

Le projet contient déjà les briques suivantes:

- `public.prospects` comme table source de vérité pour le lead qualifié;
- `autonomy_actions` et `human_approvals` pour la validation humaine;
- `campaign_drafts` pour les artefacts de draft email;
- `/api/studio/prospects` comme route d'agrégation;
- `/studio/prospects` comme cockpit opérateur Prospect.

Depuis la Phase 1, `prospects` porte déjà une partie du pipeline commercial:

- `status`
- `draft_provider`
- `draft_external_id`
- `draft_created_at`
- `last_contacted_at`
- `next_followup_at`
- `replied_at`
- `closed_at`

La page `/studio/prospects` expose déjà:

- l'état d'approbation;
- l'état outbound;
- les transitions `sent / replied / won / lost`;
- un historique stocké dans `metadata.activity`.

Cette base fonctionne, mais elle reste trop légère pour servir de CRM local durable. Le point faible principal est que l'historique métier et les annotations opérateur sont encore trop couplés à `metadata`, ce qui rend les mutations, les filtres et la lecture moins propres qu'ils devraient l'être.

## Approche retenue

L'approche retenue est un modèle **`prospects` + `prospect_activities`**, en restant volontairement single-operator.

### `public.prospects`

`prospects` reste la source de vérité pour l'état courant du prospect:

- identité du lead;
- score / band;
- pipeline actuel;
- notes opérateur courtes;
- prochaine action;
- tags;
- timestamps métier principaux.

### `public.prospect_activities`

Une nouvelle table append-only devient la source de vérité de la timeline CRM:

- note ajoutée;
- tag modifié;
- prochaine action changée;
- approval créée / approuvée / rejetée;
- draft créé;
- marqué envoyé;
- marqué répondu;
- gagné / perdu.

Cette séparation donne un CRM local structuré sans ouvrir un sous-projet trop large.

## Pourquoi cette approche

### Option retenue: `prospects` + `prospect_activities`

Avantages:

- garde un état courant simple à lire;
- donne une timeline structurée, requêtable et append-only;
- évite de surcharger `metadata` avec de l'historique métier critique;
- prépare plus tard un export CRM externe propre;
- reste assez petit pour une Phase 2.

### Option rejetée: tout stocker dans `public.prospects`

Cette option est plus rapide au premier abord, mais dégrade vite:

- l'historique se mélange avec l'état courant;
- les notes et mutations deviennent difficiles à auditer;
- les filtres et vues timeline reposent sur du JSON moins propre.

### Option rejetée: mini-CRM complet avec `prospect_notes` et `prospect_tasks`

Cette option est trop large pour maintenant. Elle ferait dériver la phase vers un produit CRM générique, alors que l'objectif est d'améliorer l'opérabilité de la boucle Prospect existante.

## Hypothèse de travail

Le mode opératoire reste **single-operator**.

Cela implique:

- pas d'assignation multi-user;
- pas de handoff entre opérateurs;
- pas de filtre par owner;
- `owner_user_id` peut rester en base pour compatibilité future, mais n'est pas une surface produit active de la Phase 2.

## Modèle de données

## Extensions sur `public.prospects`

Ajouts proposés:

- `pipeline_status text not null default 'new'`
- `operator_notes text not null default ''`
- `next_action text not null default ''`
- `last_activity_at timestamptz`
- `tags text[] not null default '{}'::text[]`

Rôle de ces champs:

- `pipeline_status`: état commercial lisible par l'opérateur;
- `operator_notes`: note courte courante, éditable rapidement;
- `next_action`: prochaine action explicite, non planifiée automatiquement;
- `last_activity_at`: tri CRM simple;
- `tags`: segmentation manuelle légère.

`status` existant n'est plus suffisant comme clé de lecture produit. La Phase 2 doit standardiser l'affichage sur `pipeline_status`, tout en gardant la compatibilité avec les états posés en Phase 1.

### Valeurs attendues pour `pipeline_status`

- `new`
- `ready_to_contact`
- `awaiting_approval`
- `approved_to_send`
- `draft_created`
- `sent`
- `replied`
- `won`
- `lost`
- `follow_up_due`

`follow_up_due` est un état dérivé utile pour l'opérateur quand `next_followup_at <= now()` et que le prospect reste ouvert.

## Nouvelle table `public.prospect_activities`

Champs attendus:

- `id uuid primary key default gen_random_uuid()`
- `prospect_id uuid not null references public.prospects(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `type text not null`
- `detail text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Règles:

- table RLS alignée sur `user_id`;
- append-only depuis l'app;
- aucun update d'activité existante hors besoin de correction admin;
- index sur `(user_id, prospect_id, created_at desc)`.

### Types d'activités minimum

- `prospect_created`
- `approval_created`
- `approval_approved`
- `approval_rejected`
- `gmail_draft_created`
- `note_updated`
- `tags_updated`
- `next_action_updated`
- `marked_sent`
- `marked_replied`
- `marked_won`
- `marked_lost`

## Règles métier

### Notes opérateur

- une note rapide est stockée dans `prospects.operator_notes`;
- chaque modification crée aussi une activité `note_updated`;
- pas d'éditeur riche en Phase 2;
- pas de notes multiples séparées en table dédiée.

### Tags

- tags manuels simples, texte libre normalisé;
- déduplication et trimming côté app;
- chaque modification crée une activité `tags_updated`.

### Prochaine action

- texte libre court;
- sert à dire ce que l'opérateur doit faire ensuite;
- peut être vide;
- chaque modification crée une activité `next_action_updated`.

### Follow-up due

`follow_up_due` n'est pas forcément écrit physiquement en base à chaque tick temporel. Il peut être dérivé dans la vue API si:

- `next_followup_at` est passé;
- `pipeline_status` n'est pas `won` ou `lost`;
- le prospect n'est pas déjà dans un état terminal.

Cette dérivation évite une mécanique de cron prématurée.

## Changements applicatifs

### `supabase/migrations/20260525_prospect_crm.sql`

Cette migration existante doit être étendue, pas dupliquée:

- ajout des colonnes CRM locales sur `prospects`;
- création de `prospect_activities`;
- RLS + grants + indexes.

Le projet a déjà prouvé en prod qu'il est plus sûr de garder l'évolution Prospect regroupée dans cette migration cumulative, plutôt que d'éparpiller le modèle avant stabilisation.

### `lib/prospect/types.ts`

Doit devenir la source de vérité des types:

- `ProspectPipelineStatus`
- `ProspectActivityType`
- `ProspectActivityRow`
- `ProspectView`

### Nouveau helper dédié activité

Créer un helper du type `lib/prospect/activity-log.ts` pour centraliser:

- création d'une activité;
- normalisation `type/detail/metadata`;
- construction des writes Supabase.

Le but est d'éviter de réécrire des inserts d'activité dispersés dans les routes et executeurs.

### `app/api/studio/prospects/route.ts`

La route doit évoluer pour:

- charger `prospects` + `prospect_activities`;
- accepter des query params de filtre:
  - `status`
  - `band`
  - `source`
  - `tag`
  - `q`
- exposer `last_activity_at`, `tags`, `operator_notes`, `next_action`;
- continuer à enrichir avec approval/draft state;
- sur `PATCH`, supporter:
  - changement de stage;
  - update note;
  - update tags;
  - update next action;
- écrire une activité à chaque mutation métier.

La route reste l'agrégateur principal du cockpit Prospect. On n'ouvre pas encore une route séparée par sous-ressource tant que cela reste lisible.

### `lib/prospect/api-view.ts`

Doit enrichir la projection CRM pour calculer:

- `pipeline_status` final à afficher;
- `follow_up_due`;
- résumé CRM global:
  - `awaitingApproval`
  - `approvedToSend`
  - `draftCreated`
  - `sent`
  - `replied`
  - `won`
  - `lost`
  - `followUpDue`

### `app/studio/prospects/page.tsx`

La vue doit gagner les surfaces suivantes:

- barre de filtres:
  - statut pipeline
  - band
  - source
  - tag
  - recherche texte
- panneau détail prospect:
  - note opérateur éditable
  - prochaine action éditable
  - tags éditables
  - timeline lisible
- vue pipeline plus claire que la simple liste triée.

Le ton UI reste opérateur, dense et utilitaire. Pas de surcharge “marketing CRM”.

## API attendue

### GET `/api/studio/prospects`

Retour enrichi:

- `prospects[]` avec champs CRM locaux;
- `activities[]` par prospect, limités aux plus récents si nécessaire;
- `summary` enrichi;
- `filtersApplied` optionnel si utile pour le front.

### PATCH `/api/studio/prospects`

Cas supportés:

- transition stage `sent / replied / won / lost`
- mise à jour `operator_notes`
- mise à jour `next_action`
- mise à jour `tags`

Chaque mutation doit:

1. mettre à jour `prospects`;
2. rafraîchir `updated_at`;
3. positionner `last_activity_at`;
4. écrire une ligne `prospect_activities`.

## UI attendue

La page `/studio/prospects` doit permettre à l'opérateur de:

- repérer les leads chauds;
- filtrer les leads à traiter;
- comprendre ce qui a déjà été fait;
- voir ce qu'il faut faire ensuite;
- ajouter du contexte sans sortir de Studio.

Sections minimales attendues:

- résumé CRM;
- file d'attente filtrable;
- détail prospect;
- timeline.

La timeline doit rester courte et lisible. Si le volume grossit, on tronque côté UI avec “voir plus”, mais on ne retire pas l'historique structuré du modèle.

## Tests attendus

### Unitaires

- normalisation des tags;
- calcul `follow_up_due`;
- construction d'activité sur note / tags / next action;
- résumé API enrichi.

### Intégration légère

- `PATCH` note crée une activité `note_updated`;
- `PATCH` tags crée `tags_updated`;
- `PATCH` next action crée `next_action_updated`;
- filtre `status` ou `tag` réduit bien la liste;
- timeline renvoyée par l'API correspond aux activités écrites.

### Smoke

Le smoke Prospect existant n'a pas besoin de couvrir toute la Phase 2. Un smoke léger peut vérifier:

- présence d'un prospect outbound;
- mutation d'une note;
- retour API enrichi.

## Garde-fous

- aucune dépendance Gmail nouvelle en Phase 2;
- aucune sync CRM externe;
- aucune assignation multi-opérateur;
- pas de scheduler follow-up;
- pas de table `prospect_tasks` séparée tant que `next_action` suffit;
- pas de notes riches ou pièces jointes.

## Hors périmètre

La Phase 2 ne couvre pas:

- Gmail send réel;
- séquences de relance automatiques;
- CRM externe HubSpot/Pipedrive/etc.;
- ownership multi-user;
- Qdrant / mémoire long terme;
- analytics commerciaux avancés.

Ces éléments appartiennent aux phases suivantes.

## Critère de fin

La Phase 2 sera considérée comme terminée quand un opérateur unique pourra, depuis `/studio/prospects`:

1. filtrer son pipeline;
2. consulter l'état exact d'un prospect;
3. écrire une note;
4. définir la prochaine action;
5. taguer le prospect;
6. voir une timeline fiable;
7. continuer à piloter `approved / draft_created / sent / replied / won / lost` sans sortir de l'app.
