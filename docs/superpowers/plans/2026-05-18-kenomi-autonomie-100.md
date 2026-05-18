# Kenomi Autonomie 100 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer Kenomi Canvas en studio autonome mesurable : idée -> validation -> MVP/landing -> paiement -> trafic -> métriques -> décision -> scaling, avec gates humains explicites pour les actions risquées.

**Architecture:** Ajouter un moteur d'autonomie serveur, des sorties agents structurées, des jobs persistés, des intégrations Stripe/Coolify/n8n, une boucle métriques/ROI et une policy engine d'approbation. L'autonomie doit être observable, idempotente, testée et réversible.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase/PostgreSQL/RLS, Prisma legacy public pages, Ollama/Claude fallback, n8n, Coolify, Stripe, Vitest.

---

## Audit Résumé

Statut actuel : **socle supervisé solide, autonomie réelle partielle**.

Score estimé :

- Produit cockpit : 75%
- Sécurité/RGPD : 70%
- Agents autonomes : 35%
- Génération MVP : 25%
- Déploiement : 15%
- Monétisation : 10%
- Marketing autonome : 20%
- Mesure ROI/scaling : 20%

Verdict : Kenomi Canvas est prêt pour une phase d'automatisation end-to-end, mais ne peut pas encore produire seul des SaaS rentables. L'orchestrateur classe les schedules, mais ne déclenche pas encore les runs agents. Les agents produisent du texte/JSON, mais ne matérialisent pas encore les assets business dans les tables finales. Stripe, Coolify, publication marketing, métriques économiques et décisions de scaling restent à câbler.

## Définition de "100% Autonome"

Kenomi est considéré autonome quand le système peut, sans action manuelle hors gates :

1. Générer une opportunité.
2. La scorer avec données et critères persistés.
3. Créer une venture exploitable.
4. Générer une landing publique persistée.
5. Créer une offre Stripe ou un mode waitlist monétisable.
6. Déployer ou activer la surface publique.
7. Lancer au moins une campagne marketing.
8. Mesurer visites, leads, paiements, coûts et ROI.
9. Décider continue/pivot/stop selon règles.
10. Journaliser toutes les actions et escalader les risques humains.

## Fichiers à Créer/Modifier

- Create: `lib/autonomy/types.ts` — contrats des jobs, actions, gates, verdicts.
- Create: `lib/autonomy/policy.ts` — règles d'approbation, budget, risk levels.
- Create: `lib/autonomy/job-runner.ts` — exécution idempotente des jobs autonomes.
- Create: `lib/autonomy/run-agent-step.ts` — wrapper serveur pour exécuter un agent sans passer par fetch UI.
- Create: `lib/agent-output-schemas.ts` — schemas Zod des sorties Scout/Validation/Builder/Payment/Marketing/Decision.
- Create: `lib/venture-materializer.ts` — transforme les outputs agents en tables `ventures`, `landing_pages`, `campaigns`, `payments`.
- Create: `lib/metrics/venture-metrics.ts` — agrégation leads, paiements, trafic, coûts, ROI.
- Create: `app/api/studio/autonomy/jobs/route.ts` — lecture/contrôle des jobs autonomes.
- Create: `app/api/studio/stripe/checkout/route.ts` — création Checkout Session.
- Create: `app/api/stripe/webhook/route.ts` — ingestion paiements.
- Create: `app/api/events/route.ts` — tracking page view/waitlist/conversion.
- Create: `supabase/migrations/20260518_autonomy_core.sql` — tables `autonomy_jobs`, `autonomy_actions`, `human_approvals`, `venture_events`.
- Modify: `app/api/studio/agents/orchestrate/route.ts` — exécuter réellement les runs dus.
- Modify: `app/api/studio/agents/run/route.ts` — extraire la logique métier dans `run-agent-step`.
- Modify: `app/api/studio/agents/pipeline/route.ts` — matérialiser les ventures avec slug/landing après approbation.
- Modify: `app/[slug]/page.tsx` — tracker les vues et supporter CTA waitlist/checkout.
- Modify: `app/api/waitlist/route.ts` — écrire aussi un événement business.
- Modify: `app/studio/agents/page.tsx` — afficher les jobs/actions/gates.
- Modify: `app/studio/analytics/page.tsx` — afficher ROI réel par venture.
- Modify: `docs/agents.md`, `docs/security.md`, `README.md` — documenter le mode autonome.

---

## Phase 1 — Moteur d'Autonomie

### Task 1: Tables Jobs/Actions/Gates

- [x] Créer `supabase/migrations/20260518_autonomy_core.sql`.
- [x] Ajouter `autonomy_jobs` avec `id`, `user_id`, `venture_id`, `kind`, `status`, `locked_at`, `attempt_count`, `next_run_at`, `payload`, `last_error`, `created_at`, `updated_at`.
- [x] Ajouter `autonomy_actions` avec `job_id`, `action_type`, `risk_level`, `status`, `input`, `output`, `created_at`.
- [x] Ajouter `human_approvals` avec `action_id`, `status`, `approved_by`, `approved_at`, `reason`.
- [x] Ajouter `venture_events` pour page view, waitlist, checkout, payment, campaign, decision.
- [x] Activer RLS sur toutes les tables avec politique `auth.uid() = user_id`.
- [x] Ajouter index `(user_id, status, next_run_at)` pour les jobs.
- [ ] Tester migration dans Supabase local ou base staging.

### Task 2: Policy Engine

- [x] Créer `lib/autonomy/types.ts`.
- [x] Définir `AutonomyRiskLevel = 'low' | 'medium' | 'high' | 'critical'`.
- [x] Définir `AutonomyActionType = 'run_agent' | 'create_landing' | 'create_checkout' | 'deploy' | 'publish_campaign' | 'scale_budget' | 'stop_venture'`.
- [x] Créer `lib/autonomy/policy.ts`.
- [x] Implémenter `requiresApproval(action)` :
  - `run_agent`, `create_landing` : pas d'approbation.
  - `create_checkout`, `deploy` : approbation medium si production.
  - `publish_campaign`, `scale_budget`, `stop_venture` : approbation humaine obligatoire.
- [x] Ajouter tests `lib/autonomy/policy.test.ts`.

### Task 3: Job Runner Idempotent

- [x] Créer `lib/autonomy/job-runner.ts`.
- [x] Implémenter `claimNextJob(supabase, userId, now)` avec lock optimiste `status='queued'`.
- [x] Implémenter `completeJob`, `failJob`, `rescheduleJob`.
- [x] Écrire tests de concurrence : un job ne peut être claim qu'une fois.

---

## Phase 2 — Agents Structurés

### Task 4: Schemas de Sortie Agents

- [x] Installer/valider Zod si absent.
- [x] Créer `lib/agent-output-schemas.ts`.
- [x] Définir schemas stricts :
  - Scout : title, niche, problem, solution, market.
  - Validation : score, tam, cpc, seo_difficulty, verdict, reason.
  - Builder : headline, subline, cta, features, pricing.
  - Payment : product_name, price_amount, price_currency, billing, checkout_description, trial_days.
  - Marketing : channels, messages, day1, day3, day7.
  - Decision : verdict, confidence, rationale, next_step.
- [x] Ajouter `parseAgentOutput(agentId, content)`.
- [x] Tester JSON valide, JSON invalide, texte Scout legacy.

### Task 5: Extraction Run Agent Serveur

- [x] Créer `lib/autonomy/run-agent-step.ts`.
- [x] Déplacer la logique centrale de `app/api/studio/agents/run/route.ts` dans `runAgentStep({ userId, agentId, prompt })`.
- [x] Conserver la route UI comme wrapper auth/rate-limit.
- [x] Retourner `agent_run_id` et `parsed_output`.
- [x] Tester que l'orchestrateur peut appeler `runAgentStep` sans requête HTTP interne.

### Task 6: Orchestrateur Réel

- [x] Modifier `app/api/studio/agents/orchestrate/route.ts`.
- [x] Pour chaque schedule executable, appeler `runAgentStep`.
- [x] Créer une ligne `autonomy_actions` par run.
- [x] Ne mettre à jour `next_run_at` qu'après succès ou reschedule explicite.
- [x] Garder les agents risqués dans `blocked`.
- [x] Implémenter le mode cron service-role au lieu du 501 actuel.
- [x] Tester : schedule dû scout -> agent_run créé ; schedule bloqué payment -> aucune exécution.

---

## Phase 3 — Matérialisation Produit

### Task 7: Ventures Cohérentes

- [x] Modifier `app/api/studio/agents/pipeline/route.ts`.
- [x] À l'approbation Scout, générer un slug unique.
- [x] Remplir les champs legacy `nom`, `slug`, `type_produit`, `statut` en plus des champs studio `name`, `niche`.
- [x] Ajouter tests pour éviter les ventures sans slug qui ne peuvent jamais avoir de landing publique.

### Task 8: Landing Page Automatique

- [x] Créer `lib/venture-materializer.ts`.
- [x] Implémenter `materializeBuilderOutput({ ventureId, builderOutput })`.
- [x] Écrire dans `landing_pages` : `headline`, `copywriting`, `statut='deployed'`.
- [x] Mapper `builder.features` vers le format public `copywriting.features`.
- [x] Modifier le run agent Builder pour appeler ce materializer après l'agent Builder.
- [ ] Tester qu'après Builder, `/[slug]` peut rendre la landing.

### Task 9: Tracking Public

- [x] Créer `app/api/events/route.ts`.
- [x] Écrire `venture_events` pour `page_view`, `cta_click`, `waitlist_signup`.
- [x] Modifier `app/[slug]/page.tsx` pour déclencher un page view serveur ou beacon client.
- [x] Modifier `app/api/waitlist/route.ts` pour insérer `waitlist_signup`.
- [x] Ajouter protection anti-abus IP/rate-limit.

---

## Phase 4 — Monétisation Stripe

### Task 10: Checkout Session

- [ ] Ajouter dépendance `stripe`.
- [ ] Créer helper `lib/stripe/server.ts`.
- [ ] Créer `app/api/studio/stripe/checkout/route.ts`.
- [ ] Lire `payment_output`, créer Product/Price/Checkout Session.
- [ ] Stocker session dans `payments` avec status `pending`.
- [ ] Exiger approbation humaine avant création en production.

### Task 11: Webhook Stripe

- [ ] Créer `app/api/stripe/webhook/route.ts`.
- [ ] Vérifier signature `stripe_webhook_secret`.
- [ ] Mettre à jour `payments.status`.
- [ ] Écrire `venture_events` type `payment_succeeded`.
- [ ] Recalculer `revenus_total` de la venture.
- [ ] Tester signature valide/invalide.

---

## Phase 5 — Déploiement et Automations

### Task 12: Jobs Coolify

- [ ] Créer `lib/coolify-client.ts`.
- [ ] Ajouter route protégée `app/api/studio/deployments/route.ts`.
- [ ] Déclencher redeploy d'app/landing via Coolify API ou webhook.
- [ ] Écrire `autonomy_actions` type `deploy`.
- [ ] Garder approbation humaine obligatoire pour première production.

### Task 13: n8n comme Bus Autonome

- [ ] Étendre `automation_workflows` avec `purpose`, `risk_level`, `autonomy_enabled`.
- [ ] Ajouter jobs `publish_campaign`, `sync_metrics`, `notify_human`.
- [ ] Passer contexte structuré au webhook : venture, action, risk, approval_id.
- [ ] Tester SSRF et payload.

---

## Phase 6 — Marketing Autonome

### Task 14: Campagnes Persistées

- [ ] Étendre table `campaigns` ou créer `campaign_drafts`.
- [ ] Après agent Marketing, créer drafts par canal.
- [ ] Ajouter statuts `draft`, `approved`, `published`, `failed`.
- [ ] Ajouter UI d'approbation dans `/studio/marketing`.

### Task 15: Publication avec Gate

- [ ] Créer adapters `lib/marketing/adapters`.
- [ ] Publier seulement si `human_approvals.status='approved'`.
- [ ] Journaliser chaque publication dans `venture_events`.
- [ ] Ajouter retry contrôlé et budget cap.

---

## Phase 7 — Boucle ROI et Décision

### Task 16: Agrégation Business

- [x] Créer `lib/metrics/venture-metrics.ts`.
- [x] Calculer visits, signups, signup_rate, revenue, spend, profit, roi.
- [x] Exposer les snapshots métriques depuis `venture_events` via `/api/studio/analytics/ventures`.
- [ ] Modifier `/studio/analytics` pour ne plus dépendre de valeurs décoratives.

### Task 17: Decision Agent Actionnable

- [x] Injecter les métriques réelles dans le contexte Decision.
- [x] Parser verdict `continue|pivot|stop`.
- [x] Si `continue`, proposer scaling budget avec approval.
- [x] Si `pivot`, créer nouvelle tâche Scout contextualisée.
- [x] Si `stop`, créer une action `stop_venture` bloquée par approval.
- [x] Après approval `stop_venture`, désactiver campaigns/checkout.
- [x] Écrire une ligne `decisions`.

---

## Phase 8 — Sécurité, Observabilité, Runbooks

### Task 18: Observabilité

- [ ] Ajouter dashboard jobs/actions/gates dans `/studio/agents`.
- [ ] Afficher durée, coût LLM estimé, provider, erreurs, retries.
- [ ] Ajouter alertes n8n/email pour jobs failed et gates bloqués.

### Task 19: Garde-fous Production

- [ ] Budget cap par venture et global.
- [ ] Allowlist domaines de déploiement.
- [ ] Kill switch global `AUTONOMY_ENABLED=false`.
- [ ] Dry-run mode par action.
- [ ] Tests e2e du scénario complet.

### Task 20: Documentation

- [ ] Mettre à jour `README.md` avec mode autonome.
- [ ] Mettre à jour `docs/agents.md` avec cycle jobs/actions/gates.
- [ ] Mettre à jour `docs/security.md` avec gates et kill switch.
- [ ] Créer `docs/runbooks/autonomy-incident.md`.

---

## Ordre de Livraison Recommandé

1. Phase 1 + Phase 2 : autonomie interne fiable.
2. Phase 3 : génération landing publique.
3. Phase 4 : monétisation réelle.
4. Phase 7 : métriques et décisions.
5. Phase 5 + Phase 6 : déploiement/marketing automatisés.
6. Phase 8 : production hardening.

## Critères de Validation Finale

- `npm run typecheck` passe.
- `npm test` passe.
- `npm run build` passe.
- Un cron service-role lance Scout automatiquement.
- Une idée approuvée crée venture + landing publique.
- Builder matérialise une landing visible via `/:slug`.
- Payment crée une Checkout Session ou reste bloqué par approval.
- Waitlist et paiement créent des événements mesurables.
- Decision peut produire `continue|pivot|stop` depuis métriques réelles.
- Toutes les actions high/critical demandent approval.
- Aucun secret n'est exposé au client.
