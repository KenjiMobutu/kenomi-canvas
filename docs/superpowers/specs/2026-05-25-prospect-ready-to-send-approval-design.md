# Prospect Ready-to-Send Approval Flow — Design

**Date**: 2026-05-25  
**Statut**: draft pour review  
**Portée**: transformer un run `Prospect` réussi en draft d'outreach exploitable avec validation humaine obligatoire, sans envoi automatique.

## Objectif

Ajouter une étape métier explicite entre la qualification d'un prospect et l'envoi réel d'un message. Après un run `Prospect`, l'opérateur doit voir un draft prêt à partir, l'approuver ou le rejeter, et conserver un audit trail clair de cette décision.

Le système ne doit pas encore envoyer d'email, de DM LinkedIn, ni déclencher un CRM externe. Ce bloc ne couvre que le statut `ready to send`, la demande d'approbation et la visualisation opérateur dans Studio.

## Contexte actuel

Le run `Prospect` fonctionne déjà comme agent autonome de qualification:

- il appelle le modèle pour produire `company_name`, `score`, `band`, `outreach_subject`, `outreach_body`, `cta`;
- il écrit une ligne dans `public.prospects`;
- il fixe un statut initial métier (`ready_to_contact`, `follow_up`, `nurture`);
- il enrichit `metadata` avec le provider, le modèle et le résumé commercial.

Le projet contient déjà un système générique d'actions autonomes et d'approbations humaines:

- `autonomy_actions`
- `human_approvals`
- `app/api/studio/autonomy/jobs/route.ts`
- `lib/autonomy/approval-executor.ts`
- vues Studio qui savent déjà afficher et résoudre des approvals.

La bonne direction n'est donc pas d'ajouter une mécanique parallèle de validation dans `prospects`, mais de réutiliser cette couche d'orchestration existante.

## Approche retenue

Le run `Prospect` continuera à créer ou mettre à jour un prospect, mais il déclenchera aussi une **action autonome bloquée** de type `send_outreach` lorsqu'un draft mérite une revue humaine.

Cette action deviendra la source de vérité pour la validation humaine. Le prospect restera la source de vérité CRM locale.

Principe:

1. `Prospect` qualifie un lead et génère un draft.
2. Si le prospect est envoyable (`hot` ou `warm`), le système crée une `autonomy_action`.
3. Cette action est immédiatement liée à une `human_approval`.
4. L'UI `/studio/prospects` expose l'état `awaiting approval`, puis `approved to send` ou `rejected`.
5. Aucune exécution réelle vers Gmail/n8n/CRM externe n'est encore déclenchée.

## Pourquoi cette approche

### Option retenue: action autonome + approval explicite

Avantages:

- réutilise la mécanique existante d'approbation et d'audit;
- reste cohérent avec l'architecture `control plane / worker plane`;
- prépare proprement le futur branchement Gmail/n8n;
- évite de faire porter à `prospects` une logique d'orchestration transverse.

### Option rejetée: simple statut manuel dans `prospects`

Cette option est plus simple à coder, mais elle ne crée pas de trace d'approbation exploitable et ne prépare pas l'étape suivante d'envoi réel.

### Option rejetée: envoi automatique après run

Elle contredit le besoin de validation humaine et le modèle de sécurité du projet.

## Règles métier

### Création d'une demande d'approbation

Une demande `send_outreach` est créée seulement si:

- `agentId = prospect`;
- le parsing du run est valide;
- `outreach_subject` et `outreach_body` sont présents;
- `band` vaut `hot` ou `warm`.

Les prospects `cold` restent stockés dans `prospects`, mais ne créent pas d'action d'envoi.

### États métier

Le prospect garde son statut CRM simple, mais l'UI doit déduire un état d'envoi lisible à partir de `autonomy_actions` et `human_approvals`.

États visibles attendus:

- `No approval` — pas d'action créée;
- `Awaiting approval` — action bloquée + approval `pending`;
- `Approved to send` — approval `approved`, aucun envoi encore exécuté;
- `Rejected` — approval `rejected`.

Le statut CRM local dans `prospects.status` ne change pas de sens:

- `ready_to_contact`
- `follow_up`
- `nurture`

On n'ajoute pas de colonne métier supplémentaire dans `public.prospects` pour dupliquer l'état d'approbation.

## Modèle de données

### `autonomy_actions`

Nouvelle convention métier:

- `action_type = 'send_outreach'`
- `risk_level = 'medium'`
- `status = 'blocked'` à la création

Payload minimal attendu dans `input`:

```json
{
  "prospect_id": "<uuid>",
  "channel": "email",
  "company_name": "Acme Studio",
  "contact_name": "Marie Dupont",
  "outreach_subject": "Sujet",
  "outreach_body": "Corps",
  "source": "upwork",
  "score": 88,
  "band": "hot"
}
```

### `human_approvals`

La table existante suffit. Chaque action `send_outreach` crée une approval `pending` liée.

## Changements applicatifs

### `lib/autonomy/run-agent-step.ts`

Le run `Prospect` doit:

- continuer à insérer le prospect;
- créer ensuite une `autonomy_action` `send_outreach` si le prospect est `hot` ou `warm`;
- créer l'entrée `human_approval` associée;
- éviter les doublons sur relance du même run, en ne créant qu'une action ouverte par prospect.

La responsabilité de ce fichier reste:

- génération LLM;
- persistance du résultat;
- orchestration métier minimale des side effects.

### `app/api/studio/prospects/route.ts`

La route `GET` doit enrichir chaque prospect avec:

- la dernière action `send_outreach` active ou récente;
- l'état d'approbation dérivé;
- l'identifiant d'action et d'approval si présents.

Elle restera la route d'agrégation pour la page `/studio/prospects`.

### `app/studio/prospects/page.tsx`

La vue doit afficher, pour chaque draft:

- le score;
- le statut CRM;
- le draft sujet/corps;
- l'état d'approbation;
- les actions `Approve` / `Reject` quand une approval est `pending`.

La résolution doit réutiliser la route existante d'approval côté autonomie plutôt que d'inventer une nouvelle route métier.

## UI attendue

La page `/studio/prospects` devient la file opérateur des drafts d'outreach:

- panneau résumé avec `total`, `hot`, `warm`, `awaiting approval`, `approved to send`;
- liste ou cartes des prospects;
- bloc draft clairement lisible;
- badge d'état `awaiting approval` / `approved` / `rejected`;
- commandes d'approbation visibles seulement quand elles sont actionnables.

Le ton UI reste opérateur, sobre, dense, sans donner l'impression qu'un message part automatiquement.

## Erreurs et garde-fous

- Si le prospect est `cold`, aucune action d'envoi n'est créée.
- Si un prospect n'a pas de `outreach_subject` ou `outreach_body`, aucune approval n'est créée.
- Si la création de l'action échoue après insertion du prospect, le prospect reste en base; l'erreur doit être auditée et visible.
- Si une approval existe déjà pour une action active du même prospect, le système ne recrée pas de doublon.
- Les approbations gardent la source de vérité sur la décision humaine; on ne duplique pas cette décision dans plusieurs tables.

## Tests attendus

### Unitaires

- création d'une action `send_outreach` pour un prospect `hot`;
- absence d'action pour un prospect `cold`;
- non-duplication si une action ouverte existe déjà;
- enrichissement de la route `/api/studio/prospects` avec l'état d'approbation dérivé.

### Intégration légère

- run `Prospect` -> prospect écrit -> action `send_outreach` créée -> approval `pending` créée;
- résolution approval `approved` -> UI reflète `approved to send`;
- résolution approval `rejected` -> UI reflète `rejected`.

## Hors périmètre

Ce bloc ne couvre pas:

- l'envoi Gmail réel;
- l'intégration LinkedIn;
- la synchronisation CRM externe;
- la relance automatique planifiée;
- la mémoire Qdrant liée aux conversations de prospection.

Ces étapes viendront après validation de la boucle `draft -> approval`.
