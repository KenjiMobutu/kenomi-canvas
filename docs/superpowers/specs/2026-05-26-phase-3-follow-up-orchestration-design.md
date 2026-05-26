# Phase 3 Follow-Up Orchestration — Design

**Date**: 2026-05-26  
**Statut**: draft pour review  
**Portée**: ajouter une séquence de relance commerciale opérable depuis `/studio/prospects`, avec approval humaine obligatoire seulement pour la première relance.

## Objectif

Après la Phase 2, Kenomi Canvas sait:

- qualifier un prospect;
- générer un draft initial;
- passer par approval humaine;
- matérialiser un draft Gmail local;
- suivre le pipeline dans un CRM local single-operator.

La Phase 3 doit fermer le trou suivant: un prospect `sent` sans réponse ne doit pas rester passif. Le système doit générer des relances contextualisées, les faire entrer dans une file opérateur claire, et appliquer une règle de supervision adaptée:

- **première relance**: approval humaine formelle obligatoire;
- **relances suivantes**: drafts proposés dans `follow_up_due`, sans approval formelle.

Le but n'est pas encore d'envoyer automatiquement. Le but est d'orchestrer la séquence commerciale jusqu'au point où l'opérateur peut agir vite sans perdre le contrôle.

## Contexte actuel

Le pipeline Prospect actuel couvre:

- `awaiting_approval`
- `approved_to_send`
- `draft_created`
- `sent`
- `replied`
- `won`
- `lost`

Le CRM local ajoute déjà:

- `operator_notes`
- `next_action`
- `tags`
- `last_activity_at`
- `prospect_activities`
- le statut dérivé `follow_up_due`

Il existe aussi déjà:

- `next_followup_at` dans `public.prospects`;
- des transitions opérateur `sent / replied / won / lost`;
- un système d'approvals réutilisable (`autonomy_actions` + `human_approvals`);
- un worker de queue capable de traiter des jobs Prospect.

Ce qui manque encore est une vraie logique de séquence commerciale après le premier envoi.

## Approche retenue

La Phase 3 ajoute une **séquence de relance légère**, pilotée par `public.prospects` et tracée dans `public.prospect_activities`.

Le système génère les drafts de relance automatiquement lorsque `next_followup_at` est échu, mais la gouvernance diffère selon le rang de relance:

- `follow_up_1`: approval humaine obligatoire;
- `follow_up_2` et `follow_up_3`: pas d'approval formelle, simple file opérateur `follow_up_due`.

Cette approche garde une vraie supervision sur la première relance, tout en évitant de ralentir les suivantes.

## Pourquoi cette approche

### Option retenue: première relance avec approval, suivantes en file simple

Avantages:

- garde le premier moment sensible sous contrôle humain;
- réduit fortement la friction opérateur ensuite;
- reste cohérent avec le modèle `zero trust` sans tomber dans l'hyper-validation;
- s'intègre naturellement au CRM local déjà en place.

### Option rejetée: approval sur chaque relance

Cette option est trop lourde. Elle transforme la séquence en file d'approvals répétitive, ce qui va à l'encontre d'une exécution commerciale fluide.

### Option rejetée: relances entièrement automatiques après le premier envoi

Cette option est prématurée pour l'état actuel du système. Elle augmente le risque métier trop tôt.

## Règles métier

## Séquence retenue

La séquence minimale est:

- `J+2` après `sent` -> `follow_up_1`
- `J+5` après `follow_up_1 sent` -> `follow_up_2`
- `J+10` après `follow_up_2 sent` -> `follow_up_3`

Les délais sont comptés à partir du dernier envoi marqué côté pipeline.

## Arrêt de séquence

La séquence s'arrête immédiatement si le prospect passe à:

- `replied`
- `won`
- `lost`

Elle ne doit plus générer de relance dans ces états.

## Gouvernance par rang

### `follow_up_1`

- draft généré automatiquement;
- création d'une `autonomy_action` dédiée;
- création d'une `human_approval` `pending`;
- l'opérateur approuve ou rejette;
- si approuvé, le prospect entre dans un état prêt à être envoyé;
- aucun envoi réel automatique.

### `follow_up_2` et `follow_up_3`

- draft généré automatiquement;
- pas d'approval formelle;
- le prospect entre dans `follow_up_due`;
- l'opérateur voit le draft, puis choisit:
  - `mark follow-up sent`
  - `skip`
  - `regenerate`

## Limites de séquence

La Phase 3 s'arrête à **3 relances maximum**.

Au-delà:

- aucun nouveau draft n'est généré automatiquement;
- l'opérateur peut toujours agir manuellement, mais la séquence automatisée s'arrête.

## Modèle de données

## Extensions sur `public.prospects`

Ajouts proposés:

- `follow_up_count integer not null default 0`
- `last_outreach_kind text not null default 'initial'`
- `last_follow_up_generated_at timestamptz`
- `follow_up_version integer not null default 0`

Rôle:

- `follow_up_count`: nombre de relances déjà envoyées ou prêtes dans la séquence;
- `last_outreach_kind`: `initial`, `follow_up_1`, `follow_up_2`, `follow_up_3`;
- `last_follow_up_generated_at`: dernier moment de génération automatique d'un draft de relance;
- `follow_up_version`: compteur simple pour distinguer régénérations successives d'un même rang.

## Drafts

Les drafts de relance continuent de s'appuyer sur `campaign_drafts`, avec métadonnées enrichies:

```json
{
  "provider": "gmail",
  "asset_kind": "outreach_email",
  "prospect_id": "<uuid>",
  "company_name": "Acme Studio",
  "outreach_kind": "follow_up_1",
  "follow_up_count": 1,
  "follow_up_version": 1
}
```

## `prospect_activities`

Nouveaux types minimum:

- `follow_up_scheduled`
- `follow_up_generated`
- `follow_up_approved`
- `follow_up_rejected`
- `follow_up_marked_sent`
- `follow_up_skipped`
- `follow_up_regenerated`

## `autonomy_actions`

Seule la première relance crée une action bloquée de type:

- `action_type = 'send_follow_up'`

Elle suit la même logique que `send_outreach`, mais ciblée sur la première relance.

Les relances suivantes ne passent pas par une action d'approval.

## Génération de contenu

La relance doit être générée à partir du contexte déjà présent:

- `company_name`
- `contact_name`
- `outreach_subject`
- `outreach_body`
- `summary`
- `pain_points`
- `operator_notes`
- historique d'activité du prospect

Le ton doit être plus court qu'un premier contact. La relance doit:

- rappeler le contexte;
- éviter de répéter le message initial mot pour mot;
- proposer une prochaine étape claire.

La Phase 3 n'introduit pas de nouvelle famille de modèles. Elle réutilise le runtime Prospect existant.

## Orchestration

## Détection des prospects à relancer

Un traitement périodique doit détecter:

- `pipeline_status = sent`
- `next_followup_at <= now()`
- `follow_up_count < 3`
- pas d'état terminal (`replied`, `won`, `lost`)

## Résultat du traitement

Quand un prospect correspond:

1. le système détermine le prochain rang de relance;
2. il génère le draft;
3. il met à jour `prospects`;
4. il écrit une activité;
5. si c'est `follow_up_1`, il crée une approval;
6. sinon il marque le prospect `follow_up_due`.

## Anti-duplication

Le traitement ne doit pas générer deux fois la même relance tant que:

- le rang courant n'a pas été envoyé ou explicitement rejeté / skippé;
- ou qu'un draft valide du même rang est déjà présent.

La clé logique d'idempotence doit s'appuyer au minimum sur:

- `prospect_id`
- `outreach_kind`
- `follow_up_version`

## Changements applicatifs

### `lib/autonomy/run-agent-step.ts`

Le runtime Prospect doit être enrichi avec une branche de génération de relance pour les traitements planifiés:

- lecture du contexte prospect existant;
- génération du draft;
- mise à jour `prospects`;
- éventuellement création d'approval `send_follow_up`.

Il faut rester dans la logique existante du pipeline Prospect, pas créer un second moteur parallèle.

### Nouveau helper de séquence

Créer un helper dédié du type:

- `lib/prospect/follow-up-sequence.ts`

Responsabilités:

- déterminer le prochain rang;
- calculer la prochaine échéance;
- dire si approval requise;
- empêcher les doublons.

### Nouveau helper de génération

Créer un helper du type:

- `lib/prospect/build-follow-up.ts`

Responsabilités:

- assembler le prompt court de relance;
- transformer la sortie en subject/body;
- rester cohérent avec le draft initial.

### `lib/autonomy/approval-executor.ts`

Doit apprendre à résoudre `send_follow_up` pour:

- matérialiser un draft Gmail local;
- écrire l'activité correspondante;
- mettre le prospect dans l'état prêt à être marqué envoyé.

### `app/api/studio/prospects/route.ts`

La route doit supporter de nouvelles actions:

- `mark_follow_up_sent`
- `skip_follow_up`
- `regenerate_follow_up`

Ces actions doivent:

- mettre à jour `prospects`;
- écrire `prospect_activities`;
- recalculer `next_followup_at` si nécessaire.

### `app/studio/prospects/page.tsx`

La vue doit afficher:

- compteur `F/U 0..3`;
- type de draft courant (`initial`, `follow_up_1`, etc.);
- état `follow_up_due`;
- commandes opérateur:
  - `Approve first follow-up`
  - `Mark follow-up sent`
  - `Skip`
  - `Regenerate`

## UI attendue

Le cockpit `/studio/prospects` doit rester dense, mais lisible.

Ajouts attendus:

- filtre `follow_up_due`
- badge du rang de relance
- aperçu du draft de relance courant
- timeline enrichie avec les événements de séquence
- distinction visuelle claire entre:
  - outreach initial
  - relance 1 sous approval
  - relances suivantes en file simple

## API attendue

### GET `/api/studio/prospects`

Doit exposer les champs nécessaires:

- `follow_up_count`
- `last_outreach_kind`
- `last_follow_up_generated_at`
- `follow_up_version`
- état d'approval éventuel de la première relance
- draft courant

### PATCH `/api/studio/prospects`

Doit supporter un payload de mutation clair pour la séquence:

- `action = mark_follow_up_sent`
- `action = skip_follow_up`
- `action = regenerate_follow_up`

La route actuelle peut absorber ces cas tant que le code reste lisible.

## Tests attendus

### Unitaires

- calcul du prochain rang de relance;
- calcul de la prochaine date;
- règle `approval required only for follow_up_1`;
- blocage des doublons;
- génération d'un draft de relance plus court que l'initial.

### Intégration légère

- prospect `sent` + échéance atteinte -> draft `follow_up_1` + approval;
- approval `follow_up_1` -> draft local matérialisé;
- `mark_follow_up_sent` -> `follow_up_count` incrémenté + prochaine échéance;
- échéance suivante -> draft `follow_up_2` sans approval;
- `skip_follow_up` -> activité écrite + pas d'envoi.

### Smoke

Un smoke ciblé doit pouvoir vérifier:

- la génération d'un follow-up échu;
- la création d'approval pour le premier follow-up seulement;
- la mise à jour du pipeline après `mark_follow_up_sent`.

## Garde-fous

- aucun envoi automatique réel;
- aucune approval répétée pour `follow_up_2` et `follow_up_3`;
- aucune génération si état terminal;
- pas de séquence infinie;
- pas de nouvelle table “tasks” en Phase 3.

## Hors périmètre

La Phase 3 ne couvre pas:

- envoi Gmail réel;
- séquences multicanales;
- scoring de replies;
- mémoire Qdrant;
- CRM externe;
- ownership multi-user.

## Critère de fin

La Phase 3 sera considérée comme terminée quand un prospect `sent` sans réponse pourra:

1. entrer automatiquement dans une séquence de relance;
2. générer `follow_up_1` avec approval humaine;
3. générer `follow_up_2` et `follow_up_3` sans approval formelle;
4. être piloté depuis `/studio/prospects` avec `Mark sent`, `Skip`, `Regenerate`;
5. laisser une timeline propre de toutes les étapes de relance.
