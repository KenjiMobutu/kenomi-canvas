# Kenomi 100 Percent Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Kenomi Canvas from a supervised autonomous cockpit to a production-grade AI Venture Studio that can discover, build, monetize, deploy, market, measure, decide, and scale ventures with explicit human gates for risky actions.

**Architecture:** Keep the current supervised-autonomy model and fill the missing production loops. All risky external side effects flow through `autonomy_actions` and `human_approvals`; all measurable business events flow through `venture_events`; all long-running or recurring work flows through `autonomy_jobs` or existing schedules. Every phase must be testable without live external providers by using adapters and fake clients.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase/Postgres/RLS, Prisma, Zod, Stripe SDK, n8n webhooks, Coolify API/webhooks, Vitest, existing `CkShell` studio UI.

---

## Current Verified Baseline

- TypeScript: `npm run typecheck` passes.
- Tests: `npm test` passes with 161 tests.
- Build: `npm run build` passes.
- Lint: `npm run lint` passes with 47 existing warnings.
- Smoke HTTP: protected Studio pages redirect to `/login`; protected Studio APIs return `401` without auth.
- Known blocker: `/api/health` returns `503` because Prisma cannot reach the configured database host in the current environment.
- Known quality gap: `npm run format:check` fails on 111 files.
- Existing autonomy plan completion: 58/103 checklist items, about 56%.

## Definition Of Done For 100 Percent

Kenomi is considered 100% autonomous when the system can perform this full loop without manual work except explicit gates:

1. Discover a SaaS opportunity.
2. Validate market and produce structured evidence.
3. Create a publishable venture record and public landing page.
4. Create a real Stripe checkout behind approval.
5. Deploy or redeploy the product surface via Coolify behind approval.
6. Generate marketing drafts, approve/publish them, and record spend/events.
7. Collect page, waitlist, checkout, payment, campaign and spend events.
8. Compute ROI snapshots from real events.
9. Let Decision create `continue`, `pivot`, `stop`, or `scale` follow-up actions.
10. Execute approved actions and keep full auditability.
11. Show jobs/actions/gates/metrics/errors in Studio.
12. Provide runbooks, health checks, kill switch, dry-run, budget caps and recovery guidance.

---

## Phase 0 — Stabilize The Foundation

### Task 0.1: Fix Health And Database Readiness

**Files:**
- Modify: `app/api/health/route.ts`
- Modify: `lib/health-check.ts`
- Test: `lib/health-check.test.ts`
- Docs: `README.md`

- [x] Write tests for three health states:
  - all dependencies reachable -> HTTP `200`, status `ok`
  - database unreachable -> HTTP `503`, status `degraded`, explicit database error
  - optional external service disabled -> status remains `ok` when configured as optional

Expected command:

```bash
npm test lib/health-check.test.ts
```

- [x] Refactor health checks so required dependencies are explicit:

```ts
export interface HealthDependencyConfig {
  databaseRequired: boolean
  supabaseRequired: boolean
  storageRequired: boolean
}

export function getHealthDependencyConfig(env: NodeJS.ProcessEnv): HealthDependencyConfig {
  return {
    databaseRequired: env.HEALTH_DATABASE_REQUIRED !== 'false',
    supabaseRequired: env.HEALTH_SUPABASE_REQUIRED !== 'false',
    storageRequired: env.HEALTH_STORAGE_REQUIRED !== 'false',
  }
}
```

- [x] Update `/api/health` to return degraded only for required failed checks.
- [x] Add README notes for `HEALTH_DATABASE_REQUIRED=false` in local/staging when Prisma DB is intentionally unavailable.
- [x] Run:

```bash
npm run typecheck
npm test lib/health-check.test.ts
npm run build
```

### Task 0.2: Validate And Repair Migration Ordering

**Files:**
- Modify: `supabase/migrations/20260516_audit_db_fixes2.sql`
- Modify: `supabase/migrations/20260518_autonomy_core.sql`
- Create: `docs/runbooks/database-migrations.md`

- [x] Ensure every migration that alters a table first creates or guards that table.
- [x] Move or duplicate safe `CREATE TABLE IF NOT EXISTS public.decisions` before `ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY`.
- [x] Add comments explaining migration order guarantees.
- [ ] Validate SQL on a local Supabase instance:

```bash
supabase start
supabase db reset
supabase db lint --local
```

Expected: migrations apply from a clean database and `db lint` returns no fatal errors.

Status: blocked in the current sandbox because `supabase start` cannot access
the Docker socket. Added `lib/migration-order.test.ts` as a static regression
guard for the identified `decisions` ordering failure.

### Task 0.3: Formatting Baseline

**Files:**
- Modify: all files changed by Prettier

- [x] Run:

```bash
npm run format:check
```

- [ ] If the team accepts a formatting-only change, run:

```bash
npm run format
npm run format:check
npm run typecheck
npm test
npm run build
```

- [ ] Keep this as a dedicated commit with no behavioral code changes.

Status: `npm run format:check` currently fails on 114 files. Formatting is
intentionally left as a dedicated future change to avoid mixing broad Prettier
churn with autonomy implementation work.

---

## Phase 1 — Stripe Monetization Loop

### Task 1.1: Add Stripe Server Adapter

**Files:**
- Modify: `package.json`
- Create: `lib/stripe/server.ts`
- Create: `lib/stripe/server.test.ts`
- Modify: `app/studio/settings/page.tsx` if secret labels need alignment

- [x] Install Stripe SDK:

```bash
npm install stripe
```

- [x] Write tests for missing secret and client initialization.
- [x] Implement:

```ts
import Stripe from 'stripe'

export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY missing')
  return key
}

export function createStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  return new Stripe(getStripeSecretKey(env), {
    apiVersion: '2025-10-29.clover',
  })
}
```

- [x] Run:

```bash
npm test lib/stripe/server.test.ts
npm run typecheck
```

### Task 1.2: Create Checkout Action Behind Approval

**Files:**
- Create: `lib/stripe/checkout-action.ts`
- Create: `lib/stripe/checkout-action.test.ts`
- Create: `app/api/studio/stripe/checkout/route.ts`
- Modify: `lib/autonomy/types.ts`
- Modify: `lib/autonomy/policy.ts`
- Modify: `supabase/migrations/20260518_autonomy_core.sql`

- [x] Write tests for `buildCheckoutSessionParams` from `payment_output`.
- [x] Write tests that production checkout requires approval.
- [x] Implement pure builder:

```ts
export interface PaymentOutput {
  product_name: string
  price_amount: number
  price_currency: string
  billing: 'one_time' | 'monthly' | 'yearly'
  checkout_description: string
  trial_days: number
}

export function buildCheckoutSessionParams(input: {
  payment: PaymentOutput
  ventureId: string
  successUrl: string
  cancelUrl: string
}) {
  return {
    mode: input.payment.billing === 'one_time' ? 'payment' : 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { venture_id: input.ventureId },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.payment.price_currency.toLowerCase(),
        unit_amount: input.payment.price_amount,
        product_data: {
          name: input.payment.product_name,
          description: input.payment.checkout_description,
        },
        recurring: input.payment.billing === 'one_time'
          ? undefined
          : { interval: input.payment.billing === 'yearly' ? 'year' : 'month' },
      },
    }],
  }
}
```

- [x] Route behavior:
  - Auth required.
  - Reads latest approved pipeline with `payment_output`.
  - Creates `autonomy_actions` `create_checkout` with `blocked` in production.
  - Creates `human_approvals` for production.
  - In development/staging, creates a Stripe session through adapter and stores `payments`.

- [x] Run:

```bash
npm test lib/stripe/checkout-action.test.ts lib/autonomy/policy.test.ts
npm run build
```

### Task 1.3: Stripe Webhook

**Files:**
- Create: `app/api/stripe/webhook/route.ts`
- Create: `lib/stripe/webhook-handler.ts`
- Create: `lib/stripe/webhook-handler.test.ts`
- Modify: `lib/venture-events.ts`
- Modify: `supabase/migrations/20260518_autonomy_core.sql`

- [x] Implement signature verification with `STRIPE_WEBHOOK_SECRET`.
- [x] Handle `checkout.session.completed`.
- [x] Update `payments.status`.
- [x] Insert `venture_events` type `payment_succeeded`.
- [x] Recalculate `ventures.revenus_total`.
- [x] Tests:
  - handler updates payment and event for a completed checkout
  - route returns `400` for missing/invalid Stripe signatures
  - unknown session is ignored without crash

---

## Phase 2 — Deployment Loop Via Coolify

### Task 2.1: Coolify Client

**Files:**
- Create: `lib/coolify/client.ts`
- Create: `lib/coolify/client.test.ts`
- Modify: `app/studio/settings/page.tsx`

- [x] Implement a typed client with URL validation and private-host allowlist using existing SSRF helpers.
- [x] Client methods:

```ts
export interface CoolifyClient {
  triggerDeploy(input: { projectId: string; serviceId: string }): Promise<{ deploymentId: string }>
  getDeployment(input: { deploymentId: string }): Promise<{ status: string }>
}
```

- [x] Tests cover missing base URL, missing token, invalid URL, successful mocked fetch, failed mocked fetch.

### Task 2.2: Deployment Action And Route

**Files:**
- Create: `app/api/studio/deployments/route.ts`
- Create: `lib/deployments/deploy-action.ts`
- Create: `lib/deployments/deploy-action.test.ts`
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `app/api/studio/autonomy/jobs/route.ts`

- [x] `POST /api/studio/deployments` creates `autonomy_actions` type `deploy`.
- [x] Production deploys require approval.
- [x] Approved `deploy` action calls Coolify client and stores `deploymentId` in `autonomy_actions.output`.
- [x] Failed deploy marks action `failed` with error details in `autonomy_actions.output`.
- [x] Tests use fake Coolify client.

---

## Phase 3 — Marketing Autonomy

### Task 3.1: Campaign Draft Schema

**Files:**
- Modify: `supabase/migrations/20260518_autonomy_core.sql`
- Create: `lib/marketing/campaign-drafts.ts`
- Create: `lib/marketing/campaign-drafts.test.ts`
- Modify: `lib/autonomy/run-agent-step.ts`

- [ ] Add `campaign_drafts`:

```sql
CREATE TABLE IF NOT EXISTS public.campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  channel text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'blocked', 'approved', 'published', 'failed', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] After Marketing output, create one draft per channel/message pair.
- [ ] For publishable channels, create `autonomy_actions` `publish_campaign` and approval.
- [ ] Tests verify drafts are created from Marketing output.

### Task 3.2: Publishing Adapters

**Files:**
- Create: `lib/marketing/adapters/types.ts`
- Create: `lib/marketing/adapters/mock.ts`
- Create: `lib/marketing/publish-action.ts`
- Create: `lib/marketing/publish-action.test.ts`
- Modify: `lib/autonomy/approval-executor.ts`

- [ ] Define adapter interface:

```ts
export interface MarketingPublisher {
  publish(input: {
    channel: string
    content: string
    ventureId: string
  }): Promise<{ externalId: string; url?: string }>
}
```

- [ ] Approved `publish_campaign` executes adapter.
- [ ] Insert `venture_events` type `campaign_published`.
- [ ] Insert `venture_events` type `campaign_spend` when budget is present.
- [ ] Tests cover approved, rejected, adapter failure and retry-safe output.

### Task 3.3: Marketing Approval UI

**Files:**
- Modify: `app/studio/marketing/page.tsx`
- Reuse: `app/api/studio/autonomy/jobs/route.ts`
- Reuse: `lib/autonomy/approval-view-model.ts`

- [ ] Show campaign drafts by status.
- [ ] Show pending publish approvals.
- [ ] Add Approve/Reject buttons calling existing autonomy PATCH.
- [ ] Add refresh state and error toast.
- [ ] Run browser smoke test for `/studio/marketing` authenticated when a test session is available.

---

## Phase 4 — Analytics And ROI From Real Events

### Task 4.1: Replace Decorative Analytics

**Files:**
- Modify: `app/studio/analytics/page.tsx`
- Modify: `app/api/studio/analytics/ventures/route.ts`
- Reuse: `lib/metrics/venture-metrics.ts`
- Test: `lib/metrics/venture-metrics.test.ts`

- [ ] Replace hardcoded KPIs with `/api/studio/analytics/ventures`.
- [ ] Show:
  - visits
  - waitlist signups
  - signup rate
  - revenue
  - campaign spend
  - profit
  - ROI
- [ ] Empty state says no events captured yet.
- [ ] Tests verify aggregation with zero revenue, positive ROI, negative ROI.

### Task 4.2: Decision Metrics Snapshot

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`
- Modify: `lib/metrics/venture-metrics.ts`

- [ ] Store full metrics snapshot in `decisions.metrics_snapshot`, not only confidence and next step.
- [ ] Tests verify Decision output includes visits/revenue/spend/profit/roi snapshot.

---

## Phase 5 — Budget Caps, Dry Run, Kill Switch

### Task 5.1: Global Autonomy Config

**Files:**
- Create: `lib/autonomy/config.ts`
- Create: `lib/autonomy/config.test.ts`
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `app/api/studio/agents/orchestrate/route.ts`

- [ ] Implement:

```ts
export interface AutonomyConfig {
  enabled: boolean
  dryRun: boolean
  globalBudgetCapEur: number
}

export function getAutonomyConfig(env: NodeJS.ProcessEnv = process.env): AutonomyConfig {
  return {
    enabled: env.AUTONOMY_ENABLED !== 'false',
    dryRun: env.AUTONOMY_DRY_RUN === 'true',
    globalBudgetCapEur: Number(env.AUTONOMY_GLOBAL_BUDGET_CAP_EUR ?? 100),
  }
}
```

- [ ] If disabled, orchestrator returns no executions and logs blocked reason.
- [ ] If dry-run, approved external actions mark output `{ dry_run: true }` and do not call Stripe/Coolify/marketing adapters.
- [ ] Tests cover disabled, dry-run and enabled.

### Task 5.2: Budget Policy

**Files:**
- Modify: `lib/autonomy/policy.ts`
- Modify: `lib/autonomy/policy.test.ts`
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `app/studio/agents/page.tsx`

- [ ] Add budget checks for:
  - `estimatedCostEur > action.budgetCapEur`
  - total venture spend over cap
  - global spend over cap
- [ ] UI displays budget breach reason in Approval Gates.
- [ ] Tests cover budget pass, action cap fail, venture cap fail, global cap fail.

---

## Phase 6 — Full End-To-End Autonomy Scenario

### Task 6.1: E2E Test Harness With Fakes

**Files:**
- Create: `lib/autonomy/full-loop.test.ts`
- Reuse: `lib/autonomy/run-agent-step.ts`
- Reuse: `lib/autonomy/approval-executor.ts`
- Reuse: `lib/venture-events.ts`
- Reuse: `lib/metrics/venture-metrics.ts`

- [ ] Build fake Supabase tables covering:
  - `agent_configs`
  - `agent_runs`
  - `venture_pipeline`
  - `ventures`
  - `landing_pages`
  - `payments`
  - `campaign_drafts`
  - `venture_events`
  - `decisions`
  - `autonomy_jobs`
  - `autonomy_actions`
  - `human_approvals`
- [ ] Test full loop:
  - Scout creates idea
  - approve idea creates venture
  - Validation stores score
  - Builder creates landing
  - Payment creates checkout action
  - approve checkout creates fake payment link
  - Marketing creates drafts
  - approve publish creates fake campaign event
  - Events create ROI snapshot
  - Decision `continue` creates `scale_budget` approval
  - approve scale marks action completed in dry-run

Expected command:

```bash
npm test lib/autonomy/full-loop.test.ts
```

### Task 6.2: HTTP Smoke Script

**Files:**
- Create: `scripts/smoke-app.mjs`
- Modify: `package.json`

- [ ] Add script:

```json
{
  "scripts": {
    "smoke": "node scripts/smoke-app.mjs"
  }
}
```

- [ ] Script checks:
  - `/login` returns `200`
  - `/dashboard/login` returns `200`
  - `/studio/agents` redirects unauthenticated to `/login`
  - `/api/studio/autonomy/jobs` returns `401` unauthenticated
  - `/api/events` invalid payload returns `400`
  - `/api/waitlist` invalid payload returns `400`
  - `/api/health` status is `200` or documented `503 degraded` with explicit dependency reason

---

## Phase 7 — Production Observability And Runbooks

### Task 7.1: Studio Jobs Dashboard

**Files:**
- Modify: `app/studio/agents/page.tsx`
- Modify: `lib/autonomy/approval-view-model.ts`
- Create: `lib/autonomy/action-view-model.ts`
- Create: `lib/autonomy/action-view-model.test.ts`

- [ ] Show jobs, actions and approvals in separate compact tabs:
  - Jobs: queued/running/failed/completed
  - Actions: blocked/running/completed/failed
  - Approvals: pending/approved/rejected
- [ ] Show duration, provider, model, retry count and last error where available.
- [ ] Keep Approve/Reject only on pending approvals.

### Task 7.2: Incident Runbooks

**Files:**
- Create: `docs/runbooks/autonomy-incident.md`
- Create: `docs/runbooks/stripe-webhook.md`
- Create: `docs/runbooks/coolify-deploy.md`
- Modify: `docs/security.md`
- Modify: `docs/agents.md`
- Modify: `README.md`

- [ ] Document:
  - kill switch `AUTONOMY_ENABLED=false`
  - dry-run `AUTONOMY_DRY_RUN=true`
  - how to reject stuck approvals
  - how to replay failed jobs
  - how to verify Stripe webhook signatures
  - how to rollback a Coolify deployment
  - which actions require human approval

---

## Final Release Gate

Run all commands and capture results:

```bash
npm run format:check
npm run typecheck
npm test
npm run lint
npm run build
npm run smoke
supabase db lint --local
```

Release can be called “100% autonomous supervised” only when:

- All commands pass or have documented environment-only exceptions.
- `/api/health` is `200` in production/staging.
- The full-loop test passes.
- Stripe checkout and webhook work in test mode.
- Coolify deploy action works in dry-run and approved mode.
- Marketing publish works through at least one real or mock adapter with events recorded.
- Studio shows jobs/actions/approvals/metrics without relying on decorative values.
- README, agents docs, security docs and runbooks are updated.
