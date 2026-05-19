# Kenomi Vision 100% Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner Kenomi Canvas à 100% avec la vision initiale : un AI Venture Studio solo qui génère, lance, monétise, mesure, décide et répare des ventures sous supervision humaine explicite.

**Architecture:** Consolider la boucle autonome existante au lieu de créer un second système. `Supabase/Postgres` reste la source de vérité, avec accès production via la VM Coolify. Toutes les actions externes passent par `autonomy_actions` + `human_approvals`, puis par des adapters testables (`Stripe`, `Coolify`, `n8n`) avec dry-run, budget caps, kill switch, logs et métriques.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase self-hosted on Coolify VM, Supabase JS, Prisma legacy public pages, Vitest, Zod, Stripe SDK, Coolify API, n8n webhooks, Pino, Prometheus metrics.

---

## Vision cible

Kenomi est 100% aligné quand, sans action manuelle hors approvals explicites, le système peut :

1. Générer une opportunité.
2. Scorer cette opportunité avec critères persistés.
3. Créer une venture exploitable.
4. Générer et publier une landing publique.
5. Créer une offre Stripe ou une waitlist monétisable.
6. Déployer ou activer la surface publique.
7. Lancer une campagne marketing approuvée.
8. Mesurer visites, leads, conversions, revenus, coûts LLM, spend marketing et ROI.
9. Décider `continue`, `pivot`, `scale` ou `stop` avec règles traçables.
10. Journaliser chaque action, exposer son état dans le Studio, et fournir un chemin de réparation.

## État de départ validé au 2026-05-19

- [x] Studio principal, auth Supabase et whitelist.
- [x] CI/CD Coolify réparé : GitHub webhook vers Coolify fonctionne et dernier déploiement vérifié.
- [x] Supabase production tourne sur la VM Coolify.
- [x] Procédure DB production : `ssh coolify`, puis `docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres`.
- [x] Tables et libs autonomie : jobs, actions, approvals, policy, runner, output schemas, full-loop tests.
- [x] Stripe libs/routes présentes : checkout action, server helper, webhook handler, routes API.
- [x] Coolify client et route `/api/studio/deployments` présents.
- [x] Marketing drafts, adapters mock/n8n, publish action présents.
- [x] Analytics routes présentes : ventures, LLM cost, metrics endpoint.
- [x] Ops cockpit actions, supervised repair CTAs et retry/cancel jobs présents.

## Règles d'exécution

- [ ] Une phase = un lot testable, commitable, déployable.
- [ ] Avant chaque phase : `git status --short`, `npm run typecheck`, `npm test`.
- [ ] Après chaque phase : `npm run typecheck`, `npm test`, `npm run ops:coherence`, `npm run build`.
- [ ] Avant une migration prod : appliquer d'abord local/staging si disponible, puis VM Coolify Supabase.
- [ ] Toute action externe doit supporter `AUTONOMY_ENABLED=false` et `AUTONOMY_DRY_RUN=true`.
- [ ] Toute action `medium|high|critical` doit créer ou consommer une approval.
- [ ] Aucune donnée décorative ne doit être affichée comme donnée réelle.

---

## Phase 0 — Baseline vérité et audit de cohérence

**Objectif:** établir l'état réel des données et supprimer les incohérences visibles entre pages.

**Files:**
- Modify: `scripts/audit-studio-coherence.mjs`
- Create: `scripts/audit-business-data.mjs`
- Create: `lib/studio-data-consistency.ts`
- Create: `lib/studio-data-consistency.test.ts`
- Modify: `docs/runbooks/daily-operations.md`

- [x] Ajouter un audit qui compare les compteurs par source : `agent_runs`, `autonomy_jobs`, `autonomy_actions`, `human_approvals`, `venture_events`, `campaign_drafts`, `payments`, `ventures`, `landing_pages`.
- [x] Détecter les écarts de type “page agents affiche 4 runs, card agent affiche 43 runs” avec une règle : chaque métrique UI doit déclarer sa table source, son filtre `user_id`, sa fenêtre temporelle et son fallback.
- [x] Faire échouer `npm run ops:coherence` si une page Studio lit une métrique sans source déclarée.
- [x] Ajouter tests unitaires pour les fonctions de cohérence.
- [x] Documenter le check dans `docs/runbooks/daily-operations.md`.

**Verification:**

```bash
npm run ops:coherence
npm run typecheck
npm test -- lib/studio-data-consistency.test.ts
```

**Exit criteria:**
- Le Studio n'a plus de compteurs contradictoires sans explication.
- Chaque KPI principal affiche sa source ou un état `source_missing`.

---

## Phase 1 — Modèle business canonique Supabase

**Objectif:** faire de Supabase la source canonique claire pour ventures, landings, paiements, campagnes, décisions et événements.

**Files:**
- Create: `supabase/migrations/20260519_vision_alignment_core.sql`
- Modify: `lib/autonomy/types.ts`
- Modify: `lib/venture-events.ts`
- Modify: `lib/metrics/venture-metrics.ts`
- Modify: `scripts/validate-supabase-remote.mjs`
- Modify: `docs/runbooks/database-migrations.md`

- [x] Vérifier en production les tables legacy inutilisées avec la procédure VM Coolify.
- [x] Ajouter ou durcir les colonnes manquantes : `ventures.lifecycle_status`, `ventures.current_decision`, `landing_pages.health_status`, `payments.provider_status`, `campaign_drafts.published_at`, `decisions.executed_at`.
- [x] Ajouter contraintes `CHECK` pour statuts business.
- [x] Ajouter indexes par `user_id`, `venture_id`, `created_at`, `status`.
- [x] Activer RLS/policies sur toute nouvelle table ou table legacy conservée.
- [x] Étendre `validate-supabase-remote.mjs` pour vérifier colonnes, RLS et policies critiques.

**Verification:**

```bash
npm run supabase:validate
npm run typecheck
npm test -- lib/metrics/venture-metrics.test.ts lib/venture-events.test.ts
```

**Exit criteria:**
- Aucune table Studio/business critique sans RLS.
- Les métriques business peuvent être recalculées depuis `venture_events` + `payments` + `campaign_drafts`.

---

## Phase 2 — Boucle idée → venture → landing publique

**Objectif:** garantir qu'une idée approuvée produit une venture et une landing publique vérifiable.

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/venture-materializer.ts`
- Modify: `app/api/studio/agents/pipeline/route.ts`
- Modify: `app/[slug]/page.tsx`
- Modify: `app/studio/ventures/page.tsx`
- Create: `lib/public-landing-health.ts`
- Create: `lib/public-landing-health.test.ts`

- [x] Ajouter un contrat `VentureReadiness` : slug présent, landing présente, copywriting valide, CTA actif, tracking actif.
- [ ] Après Scout approval, créer une venture avec slug unique et statut `draft`.
- [x] Après Builder, créer ou mettre à jour `landing_pages`, puis marquer `health_status='ready'` si toutes les conditions passent.
- [ ] Sur `/studio/ventures`, afficher `Ready`, `Repair required`, `Missing landing`, `Missing CTA`, `Tracking missing`.
- [ ] Transformer le CTA “Lancer Builder” en réparation idempotente : si landing existe, update ; si absente, create.
- [ ] Ajouter un test full-loop qui vérifie que `/:slug` rend la landing après Builder.

**Verification:**

```bash
npm test -- lib/venture-materializer.test.ts lib/public-landing-health.test.ts lib/autonomy/full-loop.test.ts
npm run typecheck
npm run build
```

**Exit criteria:**
- Une venture approuvée n'est plus “orpheline”.
- Toute venture non publiable explique pourquoi et propose une réparation.

---

## Phase 3 — Tracking public et analytics sans données décoratives

**Objectif:** remplacer les derniers KPIs synthétiques par des sources réelles et auditables.

**Files:**
- Modify: `app/api/events/route.ts`
- Modify: `app/api/waitlist/route.ts`
- Modify: `app/api/studio/analytics/ventures/route.ts`
- Modify: `app/api/studio/analytics/llm-cost/route.ts`
- Modify: `app/studio/analytics/page.tsx`
- Modify: `lib/metrics/analytics-live.ts`
- Create: `lib/metrics/source-contract.ts`
- Create: `lib/metrics/source-contract.test.ts`

- [x] Définir un contrat `MetricSourceStatus = real | empty | partial | unavailable`.
- [x] Chaque KPI analytics doit exposer : `value`, `source`, `window`, `lastUpdated`, `status`.
- [x] Calculer visits, signups, conversion rate, revenue, spend, profit, ROI depuis les tables réelles.
- [x] Calculer coûts LLM depuis `agent_runs` tokens/provider/model, avec fallback `partial` si prix absent.
- [x] Afficher dans `/studio/analytics` un état clair quand la donnée est vide au lieu d'une valeur décorative.
- [x] Ajouter un audit qui interdit les tableaux hardcodés de métriques business dans `app/studio/analytics/page.tsx`.

**Verification:**

```bash
npm test -- lib/metrics/venture-metrics.test.ts lib/metrics/analytics-source-status.test.ts lib/metrics/source-contract.test.ts
npm run ops:coherence
npm run build
```

**Exit criteria:**
- Analytics affiche uniquement des données réelles, vides ou partielles.
- La page indique la source de chaque métrique critique.

---

## Phase 4 — Monétisation Stripe end-to-end

**Objectif:** rendre Payment agent actionnable : offre, checkout, webhook, revenu et ROI.

**Files:**
- Modify: `lib/stripe/server.ts`
- Modify: `lib/stripe/checkout-action.ts`
- Modify: `lib/stripe/webhook-handler.ts`
- Modify: `app/api/studio/stripe/checkout/route.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `app/[slug]/page.tsx`
- Modify: `app/studio/ventures/page.tsx`
- Modify: `docs/runbooks/stripe-webhook.md`

- [ ] Vérifier que checkout en production crée d'abord une action `create_checkout` bloquée par approval.
- [ ] Après approval, créer Product, Price, Checkout Session Stripe.
- [ ] Stocker `provider_product_id`, `provider_price_id`, `provider_session_id`, `status='pending'`.
- [x] Sur webhook `checkout.session.completed`, vérifier signature, mettre paiement à jour, insérer `venture_events.payment_succeeded`.
- [x] Sur landing publique, CTA checkout si payment ready, sinon waitlist CTA.
- [ ] Ajouter tests webhook signature valide/invalide et replay idempotent.

**Verification:**

```bash
npm test -- lib/stripe/server.test.ts lib/stripe/checkout-action.test.ts lib/stripe/webhook-handler.test.ts
npm run typecheck
npm run build
```

**Exit criteria:**
- Un paiement Stripe réussi remonte dans Analytics comme revenu réel.
- Aucun checkout production ne peut être créé sans approval.

---

## Phase 5 — Déploiement Coolify piloté depuis le Studio

**Objectif:** faire du déploiement une action Studio traçable, réparable et vérifiable.

**Files:**
- Modify: `lib/coolify/client.ts`
- Modify: `lib/deployments/deploy-action.ts`
- Modify: `app/api/studio/deployments/route.ts`
- Modify: `app/studio/infrastructure/page.tsx`
- Modify: `app/studio/page.tsx`
- Modify: `docs/runbooks/coolify-deploy.md`

- [ ] Exposer l'état du dernier déploiement Coolify : commit, queue id, status, started_at, finished_at, container health.
- [ ] Créer une action `deploy` `medium|high` selon environnement, bloquée par approval en production.
- [ ] Après approval, déclencher Coolify API/webhook et enregistrer `autonomy_actions.output`.
- [ ] Ajouter un smoke post-deploy automatique : `/api/health`, `/studio` protected redirect, `/api/studio/services/health` unauthorized quand non connecté.
- [ ] Dans `/studio/infrastructure`, afficher “dernier déploiement vérifié” + bouton réparer/rejouer.

**Verification:**

```bash
npm test -- lib/coolify/client.test.ts lib/deployments/deploy-action.test.ts
npm run typecheck
npm run build
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
```

**Exit criteria:**
- Le Studio sait dire quelle version est en production.
- Le déploiement n'est plus une boîte noire externe à l'app.

---

## Phase 6 — Marketing autonome avec n8n et approvals

**Objectif:** transformer Marketing agent en campagnes publiables, supervisées et mesurées.

**Files:**
- Modify: `lib/marketing/campaign-drafts.ts`
- Modify: `lib/marketing/publish-action.ts`
- Modify: `lib/marketing/adapters/n8n.ts`
- Modify: `app/api/studio/marketing/drafts/route.ts`
- Modify: `app/api/studio/n8n/workflows/route.ts`
- Modify: `app/studio/marketing/page.tsx`
- Modify: `docs/runbooks/autonomy-incident.md`

- [ ] Après Marketing run, créer un draft par canal avec budget, cible, message et risque.
- [ ] Pour publication, créer `publish_campaign` bloquée par approval.
- [ ] Après approval, appeler adapter n8n avec payload structuré : venture, channel, content, budget, approval_id.
- [x] Enregistrer `published_at`, `provider_run_id`, `venture_events.campaign_published`.
- [ ] En cas d'échec, status `failed`, erreur lisible, bouton retry.
- [ ] Budget cap global et par venture avant publication.

**Verification:**

```bash
npm test -- lib/marketing/campaign-drafts.test.ts lib/marketing/publish-action.test.ts lib/marketing/adapters/n8n.test.ts
npm run typecheck
npm run build
```

**Exit criteria:**
- Une campagne ne part jamais sans approval.
- Une publication réussie crée une trace business exploitable dans Analytics.

---

## Phase 7 — Décision, scale, pivot, stop

**Objectif:** rendre Decision agent opérationnel et réversible.

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `lib/autonomy/policy.ts`
- Modify: `app/api/studio/autonomy/jobs/route.ts`
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/studio/ventures/page.tsx`

- [ ] Injecter dans Decision uniquement des métriques réelles ou marquées `partial`.
- [ ] Verdict `continue` : créer action `scale_budget` bloquée si budget augmente.
- [ ] Verdict `pivot` : créer job Scout contextualisé avec historique de la venture.
- [ ] Verdict `stop` : créer action `stop_venture` bloquée par approval.
- [x] Après approval `stop_venture`, désactiver checkout/campaigns et passer venture `stopped`.
- [ ] Afficher les décisions dans `/studio/ventures` avec raison, confiance, données sources.

**Verification:**

```bash
npm test -- lib/autonomy/approval-executor.test.ts lib/autonomy/policy.test.ts lib/autonomy/full-loop.test.ts
npm run typecheck
npm run build
```

**Exit criteria:**
- Le système peut recommander et exécuter `continue`, `pivot`, `scale`, `stop` sous supervision.
- Toutes les décisions sont explicables et réversibles quand possible.

---

## Phase 8 — Observabilité, coût et exploitation quotidienne

**Objectif:** rendre l'exploitation quotidienne calme, vérifiable et facile à réparer.

**Files:**
- Modify: `lib/agent-run-metrics.ts`
- Modify: `lib/metrics/prometheus.ts`
- Modify: `app/api/metrics/route.ts`
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/studio/page.tsx`
- Modify: `docs/runbooks/daily-operations.md`
- Create: `docs/runbooks/observability.md`

- [ ] Afficher dans `/studio/agents` : durée, provider, modèle, tokens input/output, coût estimé, retry count, last error.
- [ ] Ajouter Prometheus counters/histograms : API duration, agent duration, job failures, approval backlog, deploy failures.
- [ ] Ajouter une carte Cockpit “Ops Health” : jobs failed, approvals bloquées, données analytics partial, dernier deploy.
- [ ] Ajouter actions de réparation : retry job, cancel job, rerun Builder, rerun Marketing, rerun smoke, open runbook.
- [ ] Documenter routine matin, avant deploy, incident autonomie, incident Stripe, incident Coolify, incident Supabase.

**Verification:**

```bash
npm test -- lib/agent-run-metrics.test.ts
npm run ops:readiness
npm run ops:coherence
npm run build
```

**Exit criteria:**
- Le Studio explique ce qui ne va pas et propose la prochaine réparation.
- Les checks quotidiens donnent une réponse actionnable, pas seulement “ça casse”.

---

## Phase 9 — Sécurité, RGPD, permissions et secrets

**Objectif:** fermer les risques avant autonomie complète.

**Files:**
- Modify: `docs/security.md`
- Modify: `app/api/studio/privacy/export/route.ts`
- Modify: `app/api/studio/privacy/delete/route.ts`
- Modify: `app/api/studio/settings/secrets/route.ts`
- Modify: `lib/security.ts`
- Modify: `scripts/validate-supabase-remote.mjs`

- [x] Vérifier export RGPD couvre ventures, landings, payments, campaign_drafts, autonomy tables, venture_events.
- [x] Vérifier suppression RGPD purge les tables business dans un ordre compatible FK.
- [ ] Ne jamais exposer secrets Coolify, n8n, Stripe ou Supabase côté client.
- [ ] Ajouter audit `supabase:validate` pour legacy tables sans RLS et policies permissives.
- [ ] Ajouter note sécurité sur approvals et kill switch dans `docs/security.md`.

**Verification:**

```bash
npm test -- lib/privacy-export.test.ts lib/security.test.ts
npm run supabase:validate
npm run typecheck
```

**Exit criteria:**
- Toutes les données business utilisateur sont exportables/supprimables.
- Aucun secret externe n'est lisible via Studio client ou export.

---

## Phase 10 — UX Studio et dette structurelle

**Objectif:** rendre l'app maintenable et lisible sans casser le design.

**Files:**
- Create/Modify: `components/studio/*`
- Create/Modify: `components/charts/*`
- Create/Modify: `lib/hooks/*`
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/studio/analytics/page.tsx`
- Modify: `app/studio/marketing/page.tsx`
- Modify: `app/studio/ventures/page.tsx`
- Modify: `app/studio/page.tsx`

- [ ] Extraire composants partagés : KPI card, status badge, section panel, empty state, source badge, action toolbar.
- [ ] Extraire hooks data : autonomy jobs, marketing drafts, analytics ventures, ops summary, infra services.
- [ ] Réduire les pages > 1 500 lignes par extraction progressive, sans refactor global non testé.
- [ ] Ajouter états loading/empty/error cohérents sur toutes les pages Studio.
- [ ] Vérifier responsive desktop/mobile dans l'in-app browser.

**Verification:**

```bash
npm run typecheck
npm test
npm run build
```

Manual browser checks:
- `/studio`
- `/studio/agents`
- `/studio/ventures`
- `/studio/marketing`
- `/studio/analytics`
- `/studio/infrastructure`
- `/studio/settings`

**Exit criteria:**
- Les pages restent visuellement stables.
- Les futures corrections se font dans des modules ciblés, pas dans des fichiers de 3 000 lignes.

---

## Phase 11 — E2E production-like et release gate

**Objectif:** prouver la vision complète avec un scénario vérifiable.

**Files:**
- Modify: `lib/autonomy/full-loop.test.ts`
- Create: `scripts/smoke-vision-loop.mjs`
- Modify: `scripts/smoke-app.mjs`
- Modify: `docs/runbooks/smoke-tests.md`
- Modify: `README.md`

- [ ] Ajouter un scénario dry-run complet : Scout → approval → venture → Builder → landing → Payment approval → checkout dry-run → Marketing approval → publish dry-run → events → Decision.
- [x] Ajouter un smoke production read-only sur `https://lab.kenomi.eu`.
- [x] Ajouter une commande qui échoue si un maillon critique est absent ou décoratif.
- [ ] Documenter la définition de “release acceptable”.

**Verification:**

```bash
npm test -- lib/autonomy/full-loop.test.ts
npm run typecheck
npm run build
npm run smoke
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
node scripts/smoke-vision-loop.mjs
```

**Exit criteria:**
- On peut démontrer la boucle complète sans provider live grâce au dry-run.
- On peut vérifier la prod sans modifier les données sensibles.

---

## Ordre de livraison recommandé

1. **Phase 0** — cohérence et vérité des données.
2. **Phase 3** — analytics réel, parce que tout le reste dépend de métriques fiables.
3. **Phase 2** — boucle venture/landing réparable.
4. **Phase 4** — Stripe end-to-end.
5. **Phase 6** — Marketing n8n avec approvals.
6. **Phase 5** — Coolify deploy depuis Studio.
7. **Phase 7** — Decision agent opérationnel.
8. **Phase 8** — observabilité et réparation quotidienne.
9. **Phase 9** — sécurité/RGPD/secrets.
10. **Phase 10** — UX/dette structurelle.
11. **Phase 11** — preuve E2E production-like.

## Jalons mesurables

- **Jalon A — Données fiables:** aucune contradiction de compteurs entre pages, Analytics sans valeurs décoratives.
- **Jalon B — Venture publiable:** une venture peut passer de l'idée à landing publique vérifiée.
- **Jalon C — Business mesurable:** waitlist, checkout, paiement, spend et ROI alimentent les mêmes métriques.
- **Jalon D — Actions externes supervisées:** Stripe, n8n et Coolify sont pilotés par approvals + actions traçables.
- **Jalon E — Décision autonome supervisée:** continue/pivot/scale/stop fonctionne avec explication et garde-fous.
- **Jalon F — Exploitation calme:** incidents, deploys, jobs failed et données partielles sont visibles et réparables depuis le Studio.

## Definition of Done 100%

- [ ] `npm run format:check` passe.
- [ ] `npm run typecheck` passe.
- [ ] `npm test` passe.
- [ ] `npm run ops:coherence` passe.
- [ ] `npm run ops:readiness` passe.
- [ ] `npm run supabase:validate` passe contre Supabase VM Coolify.
- [ ] `npm run build` passe.
- [ ] `npm run smoke` passe localement.
- [ ] `SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke` passe après déploiement.
- [ ] `scripts/smoke-vision-loop.mjs` prouve la boucle complète en dry-run.
- [ ] Le Studio affiche clairement les sources de données, les approvals, les erreurs, les réparations et le dernier déploiement.
- [ ] Aucune action externe risquée ne peut partir sans approval humaine.
- [ ] Le kill switch et le dry-run bloquent réellement les effets externes.
