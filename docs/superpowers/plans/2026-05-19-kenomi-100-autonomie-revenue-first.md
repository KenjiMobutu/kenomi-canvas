# Kenomi 100% Autonomie Revenue-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amener Kenomi Canvas à 100% de la vision initiale : un Venture Studio autonome, revenue-first, qui exécute chaque jour acquisition, tracking, paiement, ROI, décision, action et audit, avec approval humaine uniquement pour les risques.

**Architecture:** Supabase self-hosted sur VM Coolify reste la source de vérité. Toutes les actions externes passent par `autonomy_actions`, `human_approvals`, des adapters testables (`Stripe`, `n8n/mock`, `Coolify`) et un audit visible dans `/studio/revenue`. La production se valide par preuves live, pas par données décoratives.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase/Postgres via Coolify VM, Stripe Checkout/Webhooks, n8n webhooks, Vitest, Prometheus, Coolify CI/CD.

---

## Current State

- [x] App déployée en prod sur Coolify, commit `d0f4664`, container healthy.
- [x] Stripe Checkout route, webhook signature, webhook handler et `payment_succeeded` existent.
- [x] `/studio/revenue` contient action prioritaire, autopilot, audit complet, campagne mock contrôlée, tracking test.
- [x] Tests actuels : `368/368`.
- [x] Smoke prod : OK.
- [ ] Preuve business prod encore vide : `0 payments`, `0 completed payments`, `0 campaign_drafts published`, `0 venture_events`.
- [ ] Disque VM à surveiller : `/` autour de 89%.

## Definition of Done 100%

Kenomi est à 100% quand une journée autonome peut produire cette trace en prod :

1. Venture prête avec landing publique et CTA revenu.
2. Checkout Stripe créé via Studio/autopilot.
3. Approval humaine seulement si risque `medium|high|critical`.
4. Paiement test Stripe complété.
5. Webhook Stripe écrit `payments.status='completed'` et `venture_events.payment_succeeded`.
6. Campagne publiée via n8n réel ou mock contrôlé explicite.
7. Events `page_view`, `waitlist_signup`, `campaign_spend` collectés.
8. ROI calculé depuis `venture_events`.
9. Décision `scale`, `cut` ou `hold` persistée dans `decisions` et `ventures.current_decision`.
10. Action de décision exécutée ou bloquée par approval selon risque.
11. Audit complet visible dans `/studio/revenue`.
12. Cron quotidien prouve la cadence sans clic humain.
13. Runbooks, smoke prod et alerting disque valident l’exploitation calme/réparable.

---

## File Ownership Map

- `app/studio/revenue/page.tsx` — cockpit opérateur revenue-first, audit complet, commandes contrôlées.
- `app/api/studio/revenue/loop/route.ts` — snapshot de boucle revenue.
- `app/api/studio/revenue/audit/route.ts` — audit complet et cadence.
- `app/api/studio/revenue/autopilot/route.ts` — planification/exécution quotidienne, décision ROI.
- `app/api/studio/revenue/proof/route.ts` — preuves contrôlées campagne/tracking.
- `app/api/studio/stripe/checkout/route.ts` — création checkout Stripe, approval gate.
- `app/api/stripe/webhook/route.ts` + `lib/stripe/webhook-handler.ts` — paiement réel et event `payment_succeeded`.
- `lib/revenue-proof.ts` — audit complet et décision ROI.
- `lib/revenue-autopilot.ts` — logique `scale/cut/hold`.
- `lib/metrics/acquisition-roi.ts` — ROI acquisition.
- `lib/marketing/publish-action.ts` + `lib/marketing/adapters/*` — publication campagne et spend.
- `lib/venture-events.ts` — contrat des events business.
- `scripts/revenue-autopilot-cron.mjs` — cadence quotidienne.
- `docs/runbooks/*.md` — exploitation, Stripe, Coolify, daily ops, incident autonomy.

---

## Phase 0 — Baseline Prod Et Secrets

**Goal:** figer l’état réel avant exécution revenue live.

**Files:**

- Modify: `docs/runbooks/daily-operations.md`
- Modify: `docs/runbooks/stripe-webhook.md`

- [x] Vérifier prod Coolify :

  ```bash
  ssh coolify "docker ps --filter label=coolify.applicationId=3 --format '{{.Image}} {{.Names}} {{.Status}}'; df -h /"
  ```

  Expected: image `d0f4664...`, status healthy, disque < 90%.

- [x] Vérifier Supabase prod :

  ```bash
  ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select 'payments' metric, count(*) value from public.payments union all select 'venture_events', count(*) from public.venture_events union all select 'published_campaigns', count(*) from public.campaign_drafts where published_at is not null;\""
  ```

  Expected before proof: rows may be `0`; after phases, all must be `>0`.

- [x] Vérifier secrets sans imprimer les valeurs :

  ```bash
  ssh coolify "docker inspect yup6hpmw0fcowrkkf2o3bzl1-195903076994 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(STRIPE_WEBHOOK_SECRET|AGENT_ORCHESTRATOR_SECRET|APP_ORIGIN|AUTONOMY_ENABLED|AUTONOMY_DRY_RUN)=' | sed 's/=.*/=yes/'"
  ```

  Expected: all present, `AUTONOMY_ENABLED=yes`, `AUTONOMY_DRY_RUN=yes/no` known.

- [x] Documenter l’état initial et les commandes dans `docs/runbooks/daily-operations.md`.

- [ ] Commit:
  ```bash
  git add docs/runbooks/daily-operations.md docs/runbooks/stripe-webhook.md
  git commit -m "docs: capture revenue proof baseline"
  ```

**Exit criteria:** on connaît la version déployée, les compteurs business et les secrets requis sans exposer de secret.

---

## Phase 1 — Stripe Checkout Réel Depuis Studio

**Goal:** créer un checkout Stripe réel depuis `/studio/revenue`, avec approval si prod.

**Files:**

- Modify: `app/api/studio/stripe/checkout/route.ts`
- Modify: `app/studio/revenue/page.tsx`
- Test: `lib/stripe/checkout-action.test.ts`
- Test: `lib/revenue-loop.test.ts`

- [ ] Ajouter un test qui vérifie que `create_checkout` retourne soit `approvalRequired=true`, soit `checkoutUrl`.

  ```bash
  npm test -- lib/stripe/checkout-action.test.ts lib/revenue-loop.test.ts
  ```

- [ ] Vérifier que la route crée `autonomy_actions.action_type='create_checkout'` avec `status='blocked'` en production.

- [ ] Vérifier que l’approval via `/api/studio/autonomy/jobs` exécute `create_checkout` et insère `payments.checkout_url`.

- [ ] Dans `/studio/revenue`, après `create_checkout` ou approval, appeler `load()` et `loadAudit()` pour rafraîchir le cockpit.

- [ ] Manual proof:
  1. Ouvrir `/studio/revenue`.
  2. Cliquer `Lancer priorité`.
  3. Si approval apparaît, cliquer `Approuver`.
  4. Ouvrir le lien Checkout.

**Exit criteria:** `payments` contient au moins une ligne avec `checkout_url` et `provider_status='ready'`.

---

## Phase 2 — Paiement Stripe Test Et Webhook

**Goal:** prouver que Stripe écrit un revenu réel dans Supabase.

**Files:**

- Modify: `lib/stripe/webhook-handler.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Test: `lib/stripe/webhook-handler.test.ts`
- Test: `lib/stripe/server.test.ts`
- Docs: `docs/runbooks/stripe-webhook.md`

- [ ] Étendre le test webhook pour vérifier idempotence replay :

  ```ts
  expect(result).toEqual({ ok: true, handled: false, reason: 'already_completed' })
  ```

- [ ] Vérifier en prod que Stripe Dashboard envoie `checkout.session.completed` vers :

  ```text
  https://lab.kenomi.eu/api/stripe/webhook
  ```

- [ ] Effectuer paiement test Stripe avec carte test `4242 4242 4242 4242`.

- [ ] Vérifier DB :
  ```bash
  ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select status, provider_status, amount_eur, checkout_url is not null as has_checkout from public.payments order by created_at desc limit 5; select event_type, value, metadata->>'stripe_session_id' as session from public.venture_events where event_type='payment_succeeded' order by occurred_at desc limit 5;\""
  ```

**Exit criteria:** `payments.status='completed'`, `provider_status='completed'`, et `venture_events.payment_succeeded` existent.

---

## Phase 3 — Campagne Publiée n8n Ou Mock Contrôlé

**Goal:** publier une campagne attribuable à une venture.

**Files:**

- Modify: `app/api/studio/revenue/proof/route.ts`
- Modify: `lib/marketing/publish-action.ts`
- Modify: `lib/marketing/adapters/n8n.ts`
- Test: `lib/marketing/publish-action.test.ts`
- Test: `lib/marketing/adapters/n8n.test.ts`

- [ ] Si n8n n’est pas prêt, utiliser explicitement `Campagne mock` dans `/studio/revenue`.

- [ ] Si n8n est prêt, vérifier :

  ```bash
  ssh coolify "docker inspect yup6hpmw0fcowrkkf2o3bzl1-195903076994 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(MARKETING_ADAPTER|N8N_PUBLISH_WEBHOOK_URL|N8N_PUBLISH_TOKEN)=' | sed 's/=.*/=yes/'"
  ```

- [ ] Cliquer `Campagne mock` ou approuver `publish_campaign`.

- [ ] Vérifier DB :
  ```bash
  ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select status, published_at, provider_run_id, metadata from public.campaign_drafts order by created_at desc limit 5; select event_type, value, metadata from public.venture_events where event_type in ('campaign_published','campaign_spend') order by occurred_at desc limit 10;\""
  ```

**Exit criteria:** campagne `published`, event `campaign_published`, et si budget, event `campaign_spend`.

---

## Phase 4 — Tracking Acquisition Public

**Goal:** collecter `page_view`, `waitlist_signup`, `campaign_spend`.

**Files:**

- Modify: `app/api/events/route.ts`
- Modify: `app/api/waitlist/route.ts`
- Modify: `app/[slug]/page.tsx`
- Modify: `lib/venture-events.ts`
- Test: `lib/api-routes/events.test.ts`
- Test: `lib/api-routes/waitlist.test.ts`
- Test: `lib/venture-events.test.ts`

- [ ] Vérifier que `VENTURE_EVENT_TYPES` contient :

  ```ts
  'page_view',
  'waitlist_signup',
  'campaign_spend',
  'payment_succeeded',
  'campaign_published',
  ```

- [ ] Cliquer `Tracking test` dans `/studio/revenue` pour preuve contrôlée.

- [ ] Vérifier DB :
  ```bash
  ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select event_type, count(*), max(occurred_at) from public.venture_events group by event_type order by max desc;\""
  ```

**Exit criteria:** les trois events acquisition existent avec `user_id`, `venture_id`, metadata d’attribution campagne.

---

## Phase 5 — ROI Et Décision Dure

**Goal:** transformer les signaux en décision `scale/cut/hold` persistée.

**Files:**

- Modify: `lib/metrics/acquisition-roi.ts`
- Modify: `lib/revenue-proof.ts`
- Modify: `app/api/studio/revenue/autopilot/route.ts`
- Test: `lib/metrics/acquisition-roi.test.ts`
- Test: `lib/revenue-proof.test.ts`
- Test: `lib/revenue-autopilot.test.ts`

- [ ] Tester les règles :

  ```ts
  // scale
  revenueCents > 0 && roi >= 0.5
  // cut
  spendCents > 0 && revenueCents === 0
  // hold
  otherwise
  ```

- [ ] Lancer `Autopilot` dans `/studio/revenue`.

- [ ] Vérifier DB :
  ```bash
  ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select decision, reason, metrics_snapshot, created_at from public.decisions order by created_at desc limit 5; select current_decision, last_decision_at, next_action from public.ventures order by updated_at desc limit 5;\""
  ```

**Exit criteria:** décision visible en DB et dans l’audit `/studio/revenue`.

---

## Phase 6 — Exécution Scale/Cut Avec Approval Si Risque

**Goal:** exécuter la décision sans clic inutile, mais avec approval pour risque.

**Files:**

- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `app/api/studio/autonomy/jobs/route.ts`
- Modify: `lib/revenue-autopilot.ts`
- Test: `lib/autonomy/approval-executor.test.ts`
- Test: `lib/revenue-autopilot.test.ts`

- [ ] Pour `scale`, créer `autonomy_actions.action_type='scale_budget'`, `risk_level='high'`, `status='blocked'`, approval pending.

- [ ] Pour `cut`, créer `autonomy_actions.action_type='stop_venture'`, `risk_level='high'`, `status='blocked'`, approval pending.

- [ ] Pour `hold`, écrire décision et audit sans approval.

- [ ] Après approval `scale_budget`, générer `campaign_drafts` de scale + action `publish_campaign`.

- [ ] Après approval `stop_venture`, passer venture en `lifecycle_status='stopped'`.

**Exit criteria:** scale/cut ne restent pas des recommandations molles ; ils créent une action exécutable et auditée.

---

## Phase 7 — Cadence Quotidienne Sans Clic

**Goal:** le système exécute chaque jour, mesure, décide, et ne demande approval que si risque.

**Files:**

- Modify: `scripts/revenue-autopilot-cron.mjs`
- Modify: `docs/runbooks/daily-operations.md`
- Modify: `lib/revenue-cadence.ts`
- Test: `lib/revenue-cadence.test.ts`

- [ ] Vérifier cron prod :

  ```bash
  ssh coolify "crontab -l | grep revenue-autopilot"
  ```

- [ ] Vérifier que le cron appelle :

  ```text
  POST /api/studio/revenue/autopilot
  Authorization: Bearer AGENT_ORCHESTRATOR_SECRET
  ```

- [x] Ajouter un garde idempotent : une même journée ne doit pas créer 10 approvals identiques.

- [ ] Vérifier cadence :
  ```bash
  ssh coolify "tail -80 /home/claude/kenomi/revenue-autopilot.log"
  ```

**Exit criteria:** un event `revenue.daily_cycle.completed` existe chaque jour, et `/studio/revenue` affiche cadence `live`.

---

## Phase 8 — Studio Revenue Comme Centre De Commande

**Goal:** rendre l’exploitation quotidienne calme, vérifiable et facile à réparer.

**Files:**

- Modify: `app/studio/revenue/page.tsx`
- Modify: `app/studio/page.tsx`
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/studio/analytics/page.tsx`

- [ ] Mettre en premier partout le signal revenu :
  - revenu prouvé,
  - revenu bloqué,
  - approval bloquante,
  - prochaine action,
  - ROI,
  - décision.

- [ ] Dans `/studio/revenue`, afficher les 8 étapes :

  ```text
  checkout_created
  approval_resolved
  payment_succeeded
  campaign_published
  tracking_collected
  roi_calculated
  decision_recorded
  execution_audited
  ```

- [ ] Ajouter liens de réparation directs :
  - Stripe manquant -> `/studio/settings`
  - webhook absent -> runbook Stripe
  - no campaign -> `Campagne mock` ou n8n
  - no tracking -> `Tracking test`
  - approval pending -> bouton approval

**Exit criteria:** l’opérateur n’a plus besoin de deviner quoi faire ensuite.

---

## Phase 9 — Observabilité Et Auto-Réparation Infra

**Goal:** éviter que Supabase/Coolify/disque cassent la boucle revenue.

**Files:**

- Modify: `app/api/metrics/route.ts`
- Modify: `app/studio/infrastructure/page.tsx`
- Modify: `lib/infra-diagnostics.ts`
- Modify: `docs/runbooks/autonomy-incident.md`

- [ ] Ajouter métriques :

  ```text
  kenomi_revenue_daily_cycle_age_hours
  kenomi_pending_approvals_total
  kenomi_payment_completed_total
  kenomi_venture_events_total
  kenomi_disk_used_percent
  ```

- [ ] Ajouter alerte disque : warning à 85%, critical à 92%.

- [ ] Documenter nettoyage safe Docker :
  ```bash
  docker builder prune -af
  docker image prune -af
  ```
  Ne jamais pruner les volumes Supabase.

**Exit criteria:** disque, Supabase, Coolify et cadence revenue sont visibles avant incident.

---

## Phase 10 — Release Gate 100%

**Goal:** empêcher de dire “100% autonomie” tant que la preuve live ne passe pas.

**Files:**

- Create: `scripts/smoke-revenue-proof.mjs`
- Modify: `package.json`
- Modify: `docs/runbooks/smoke-tests.md`

- [x] Créer `scripts/smoke-revenue-proof.mjs` qui vérifie en prod :
  - `/api/health` 200,
  - `/api/studio/revenue/proof` non-auth = 405/401 selon méthode,
  - DB contient au moins un checkout,
  - DB contient au moins un `payment_succeeded`,
  - DB contient au moins un `campaign_published`,
  - DB contient au moins un `campaign_spend`,
  - DB contient une décision récente.

- [x] Ajouter script :

  ```json
  {
    "scripts": {
      "smoke:revenue-proof": "node scripts/smoke-revenue-proof.mjs"
    }
  }
  ```

- [ ] Exécuter :
  ```bash
  npm run typecheck
  npm test
  npm run ops:coherence
  npm run build
  SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
  npm run smoke:revenue-proof
  ```

**Exit criteria:** le label “100% autonomie revenue-first” est soutenu par un smoke prod reproductible.

---

## Recommended Execution Order

1. Phase 0 — baseline prod et secrets.
2. Phase 1 — checkout réel.
3. Phase 2 — paiement Stripe test.
4. Phase 3 — campagne mock/n8n.
5. Phase 4 — tracking.
6. Phase 5 — ROI/décision.
7. Phase 6 — execution scale/cut.
8. Phase 7 — cadence automatique.
9. Phase 8 — cockpit revenue.
10. Phase 9 — observabilité infra.
11. Phase 10 — release gate.

## Commit Strategy

- `docs: capture revenue proof baseline`
- `feat: prove stripe checkout revenue path`
- `feat: publish controlled acquisition campaign`
- `feat: harden revenue roi decisions`
- `feat: execute scale cut revenue decisions`
- `feat: add revenue autonomy release gate`
- `docs: finalize revenue-first operations runbook`

## Final Verification

```bash
npm run typecheck
npm test
npm run lint
npm run ops:coherence
npm run smoke:vision
npm run build
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
```

Production DB proof:

```bash
ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select event_type, count(*), max(occurred_at) from public.venture_events group by event_type order by max desc; select status, provider_status, count(*) from public.payments group by status, provider_status; select decision, count(*) from public.decisions group by decision;\""
```

Expected:

- `payment_succeeded > 0`
- `campaign_published > 0`
- `campaign_spend > 0`
- `page_view > 0`
- `waitlist_signup > 0`
- at least one `scale`, `cut`, or `hold` decision.
