# Studio Autonomie Actionnable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amener Kenomi Canvas au niveau "Studio qui agit vraiment" : depuis le Cockpit, l'operateur peut lancer, approuver, reparer et verifier la boucle idee -> landing -> paiement -> marketing -> decision avec sources reelles et gates humains.

**Architecture:** Ne pas reconstruire l'autonomie : le repo contient deja jobs, actions, approvals, Stripe, Coolify, marketing drafts, metrics et runbooks. Le plan ajoute une couche d'orchestration operateur au-dessus de ces briques : intentions d'action typees, execution controlee, UI de reparation, smoke tests authentifies et validation remote Coolify/Supabase.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase self-hosted sur VM Coolify, n8n, Stripe, Coolify API, Vitest, scripts Node smoke/readiness.

---

## Current Baseline

- `main` pointe sur `955bd79`.
- Cockpit affiche deja `Operations` avec sources, fraicheur et action recommandee.
- `lib/autonomy/*` contient jobs, policy, executor, full-loop tests et approvals.
- `lib/stripe/*`, `lib/deployments/*`, `lib/marketing/*` existent deja.
- `scripts/smoke-app.mjs`, `scripts/ops-readiness.mjs`, `scripts/validate-supabase-remote.mjs` existent.
- Supabase de reference est l'instance Coolify, accessible via la procedure documentee dans `docs/runbooks/database-migrations.md`.

## Success Criteria

- Depuis `/studio`, chaque action Operations prioritaire est executable ou ouvre une confirmation explicite.
- Depuis `/studio/agents`, les approvals peuvent etre approuvees/rejetees et le resultat d'execution est visible.
- Une venture peut parcourir le flux supervise : agent run -> output structure -> materialisation -> checkout/deploy/marketing bloque par approval si risque.
- Les erreurs infra/automation/approval affichent une cause probable, une source, un dernier check et une action de reparation.
- Les smoke tests couvrent aussi les endpoints critiques d'autonomie, en mode non-auth puis avec token/session quand possible.
- Les validations finales passent : `npm test`, `npm run ops:coherence`, `npm run ops:readiness`, `npm run typecheck`, `npm run build`, `npm run smoke`.

---

## File Structure

- Create: `lib/ops/action-intents.ts` - contrats des actions Cockpit executables.
- Create: `lib/ops/action-intents.test.ts` - priorite, securite et mapping des intentions.
- Create: `app/api/studio/ops/actions/route.ts` - endpoint POST pour executer les actions calmes et router les actions risquees vers approvals.
- Modify: `lib/ops/studio-ops-summary.ts` - inclure `actionIntent` sur chaque action.
- Modify: `app/studio/page.tsx` - rendre les actions Operations executables avec etats loading/success/error.
- Modify: `app/studio/agents/page.tsx` - exposer une vraie queue approvals/actions/jobs avec boutons approve/reject/retry.
- Modify: `app/api/studio/autonomy/jobs/route.ts` - ajouter `POST` pour enqueue/retry/cancel jobs calmes.
- Create: `lib/autonomy/operator-actions.ts` - fonctions serveur testables pour enqueue/retry/cancel.
- Create: `lib/autonomy/operator-actions.test.ts`.
- Modify: `scripts/smoke-app.mjs` - ajouter smoke ops/autonomy non-auth et authenticated-ready hooks.
- Create: `scripts/smoke-studio-authenticated.mjs` - smoke optionnel avec cookie/token fourni par env.
- Modify: `package.json` - ajouter `smoke:studio`.
- Modify: `docs/runbooks/daily-operations.md` - procedure quotidienne alignee Cockpit.
- Modify: `docs/runbooks/autonomy-incident.md` - procedure repair depuis UI puis SQL Coolify.

---

### Task 1: Modeliser Les Actions Cockpit Executables

**Files:**
- Create: `lib/ops/action-intents.ts`
- Create: `lib/ops/action-intents.test.ts`
- Modify: `lib/ops/studio-ops-summary.ts`
- Modify: `lib/ops/studio-ops-summary.test.ts`

- [ ] **Step 1: Write failing tests for action intents**

```ts
import { describe, expect, it } from 'vitest'
import { buildOpsActionIntent } from './action-intents'

describe('ops action intents', () => {
  it('maps missing automation runs to a safe workflow trigger intent', () => {
    expect(buildOpsActionIntent('trigger-first-automation')).toEqual({
      id: 'trigger-first-automation',
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'trigger_first_automation' },
      requiresConfirmation: true,
      risk: 'low',
    })
  })

  it('keeps approval review as navigation, not blind execution', () => {
    expect(buildOpsActionIntent('review-approvals')).toEqual({
      id: 'review-approvals',
      method: 'GET',
      endpoint: '/studio/agents',
      payload: null,
      requiresConfirmation: false,
      risk: 'medium',
    })
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/ops/action-intents.test.ts`

Expected: fail because `lib/ops/action-intents.ts` does not exist.

- [ ] **Step 3: Implement intent types**

```ts
export type OpsActionRisk = 'low' | 'medium' | 'high'

export interface OpsActionIntent {
  id: string
  method: 'GET' | 'POST'
  endpoint: string
  payload: Record<string, unknown> | null
  requiresConfirmation: boolean
  risk: OpsActionRisk
}

export function buildOpsActionIntent(actionId: string): OpsActionIntent {
  if (actionId === 'trigger-first-automation') {
    return {
      id: actionId,
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'trigger_first_automation' },
      requiresConfirmation: true,
      risk: 'low',
    }
  }

  if (actionId === 'run-first-agent') {
    return {
      id: actionId,
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'run_first_agent' },
      requiresConfirmation: true,
      risk: 'low',
    }
  }

  return {
    id: actionId,
    method: 'GET',
    endpoint:
      actionId === 'review-approvals'
        ? '/studio/agents'
        : actionId === 'repair-infrastructure'
          ? '/studio/infrastructure'
          : actionId === 'repair-automations'
            ? '/studio/automations'
            : '/studio',
    payload: null,
    requiresConfirmation: false,
    risk: actionId === 'review-approvals' ? 'medium' : 'low',
  }
}
```

- [ ] **Step 4: Attach intents to summary actions**

Update `StudioOpsAction` in `lib/ops/studio-ops-summary.ts`:

```ts
import { buildOpsActionIntent, type OpsActionIntent } from './action-intents'

export interface StudioOpsAction {
  id: string
  label: string
  detail: string
  href: string
  tone: 'ok' | 'warn' | 'muted'
  intent: OpsActionIntent
}
```

When pushing an action, set `intent: buildOpsActionIntent('<action-id>')`.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --run lib/ops/action-intents.test.ts lib/ops/studio-ops-summary.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ops/action-intents.ts lib/ops/action-intents.test.ts lib/ops/studio-ops-summary.ts lib/ops/studio-ops-summary.test.ts
git commit -m "feat: add executable ops action intents"
```

---

### Task 2: Ajouter L'Endpoint D'Execution Ops

**Files:**
- Create: `app/api/studio/ops/actions/route.ts`
- Create: `lib/ops/execute-ops-action.ts`
- Create: `lib/ops/execute-ops-action.test.ts`
- Modify: `app/api/studio/ops/summary/route.ts`

- [ ] **Step 1: Write tests for safe execution**

```ts
import { describe, expect, it, vi } from 'vitest'
import { executeOpsAction } from './execute-ops-action'

describe('executeOpsAction', () => {
  it('returns a repairable empty result when no automation workflow exists', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
      })),
    }

    await expect(
      executeOpsAction({
        type: 'trigger_first_automation',
        userId: 'user-1',
        supabase: supabase as never,
      })
    ).resolves.toMatchObject({
      ok: false,
      code: 'missing_workflow',
      repairHref: '/studio/automations',
    })
  })
})
```

- [ ] **Step 2: Implement a pure executor**

Implement `executeOpsAction()` with these supported types:

- `trigger_first_automation`: find first enabled workflow, call same service logic used by `/api/studio/automations/trigger`, insert `automation_runs`.
- `run_first_agent`: find first enabled agent schedule or default Scout, call `runAgentStep`.
- `refresh_infrastructure`: call health services or return `/studio/infrastructure` if no direct refresh is safe.

Return shape:

```ts
export interface OpsActionExecutionResult {
  ok: boolean
  code: 'completed' | 'queued' | 'missing_workflow' | 'missing_agent' | 'blocked' | 'failed'
  message: string
  repairHref: string
  auditId?: string
}
```

- [ ] **Step 3: Add route wrapper**

`app/api/studio/ops/actions/route.ts` must:

- require allowed user via `requireAllowedUser`;
- validate body with Zod;
- rate-limit by `ops-action:${user.id}`;
- call `executeOpsAction`;
- insert audit event;
- return 200 for `ok`, 409 for `blocked`, 422 for missing setup, 500 for failed.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --run lib/ops/execute-ops-action.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/ops/actions/route.ts lib/ops/execute-ops-action.ts lib/ops/execute-ops-action.test.ts
git commit -m "feat: execute safe cockpit ops actions"
```

---

### Task 3: Rendre Le Cockpit Actionnable

**Files:**
- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Add UI states**

Add local state near `opsSummary`:

```ts
const [opsActionState, setOpsActionState] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({})
const [opsActionMessage, setOpsActionMessage] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Add handler**

Inside `CockpitPage`, add:

```ts
const runOpsAction = useCallback(async (action: OpsSummaryAction) => {
  if (!action.intent || action.intent.method === 'GET') {
    window.location.href = action.href
    return
  }

  if (action.intent.requiresConfirmation) {
    const confirmed = window.confirm(`${action.label}\n\n${action.detail}`)
    if (!confirmed) return
  }

  setOpsActionState((current) => ({ ...current, [action.id]: 'running' }))
  setOpsActionMessage((current) => ({ ...current, [action.id]: '' }))

  const response = await fetch(action.intent.endpoint, {
    method: action.intent.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action.intent.payload),
  })
  const payload = await response.json().catch(() => null)

  setOpsActionState((current) => ({
    ...current,
    [action.id]: response.ok ? 'done' : 'error',
  }))
  setOpsActionMessage((current) => ({
    ...current,
    [action.id]: payload?.message ?? payload?.error ?? 'Action terminee',
  }))
}, [])
```

- [ ] **Step 3: Replace action links with buttons when intent is POST**

Keep visual density, but use:

- `<button type="button">` for POST intents.
- `<a>` for GET intents.
- visible `running`, `done`, `error` microcopy.

- [ ] **Step 4: Browser verify**

Open `http://localhost:3001/studio`.

Expected:

- Operations block appears.
- Action shows `ouvrir` or `executer`.
- POST action shows confirmation before execution.
- Failure shows repair message without crashing.

- [ ] **Step 5: Verify**

Run:

```bash
npm run ops:coherence
npm run typecheck
npm run build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add app/studio/page.tsx
git commit -m "feat: make cockpit operations executable"
```

---

### Task 4: Queue Approvals/Actions Operable Dans Agents

**Files:**
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/api/studio/autonomy/jobs/route.ts`
- Create: `lib/autonomy/operator-actions.ts`
- Create: `lib/autonomy/operator-actions.test.ts`

- [ ] **Step 1: Add tests for operator actions**

Cover:

- retry failed job -> status `queued`, `attempt_count` preserved, `last_error` cleared;
- cancel queued job -> status `cancelled`;
- cannot retry a running job.

- [ ] **Step 2: Implement `operator-actions.ts`**

Expose:

```ts
export async function retryAutonomyJob(input: { supabase: OperatorSupabase; userId: string; jobId: string }): Promise<OperatorActionResult>
export async function cancelAutonomyJob(input: { supabase: OperatorSupabase; userId: string; jobId: string }): Promise<OperatorActionResult>
```

- [ ] **Step 3: Extend API**

Add `POST /api/studio/autonomy/jobs` body:

```json
{ "type": "retry_job", "jobId": "..." }
```

and:

```json
{ "type": "cancel_job", "jobId": "..." }
```

Keep existing `PATCH` for approval resolution.

- [ ] **Step 4: Upgrade `/studio/agents` UI**

The page must show:

- pending approvals first;
- failed actions/jobs second;
- latest completed actions third;
- buttons `Approve`, `Reject`, `Retry`, `Cancel`;
- after each action, refetch `/api/studio/autonomy/jobs`.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --run lib/autonomy/operator-actions.test.ts lib/autonomy/approval-executor.test.ts
npm run typecheck
npm run build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add app/studio/agents/page.tsx app/api/studio/autonomy/jobs/route.ts lib/autonomy/operator-actions.ts lib/autonomy/operator-actions.test.ts
git commit -m "feat: add operator controls for autonomy queue"
```

---

### Task 5: Fermer Le Flux Venture Supervise

**Files:**
- Modify: `lib/autonomy/full-loop.test.ts`
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `app/studio/ventures/page.tsx`
- Modify: `app/studio/analytics/page.tsx`
- Modify: `app/studio/marketing/page.tsx`

- [ ] **Step 1: Extend full-loop regression**

The test must prove:

1. Scout creates a scored opportunity.
2. Builder materializes a landing.
3. Payment creates or blocks checkout by approval.
4. Marketing creates campaign drafts and publish approvals.
5. Events feed ROI.
6. Decision creates `continue`, `pivot`, or `stop` action from real metrics.

- [ ] **Step 2: Add missing materialization assertions**

Ensure Builder produces a public `landing_pages` row renderable by `app/[slug]/page.tsx`.

- [ ] **Step 3: Surface missing states in pages**

Each page must show empty/blocked/error states with the next repair action:

- Ventures: missing landing -> run Builder.
- Marketing: pending drafts -> review/publish.
- Analytics: missing events -> open public landing or run smoke.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --run lib/autonomy/full-loop.test.ts lib/autonomy/run-agent-step.test.ts lib/metrics/venture-metrics.test.ts
npm run typecheck
npm run build
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/autonomy/full-loop.test.ts lib/autonomy/run-agent-step.ts app/studio/ventures/page.tsx app/studio/analytics/page.tsx app/studio/marketing/page.tsx
git commit -m "feat: close supervised venture loop"
```

---

### Task 6: Smoke Tests Production-Oriented

**Files:**
- Modify: `scripts/smoke-app.mjs`
- Create: `scripts/smoke-studio-authenticated.mjs`
- Modify: `package.json`
- Modify: `docs/runbooks/smoke-tests.md`

- [ ] **Step 1: Extend unauth smoke**

Add checks:

- `/api/studio/ops/summary` returns 401 when unauthenticated.
- `/api/studio/ops/actions` returns 401 when unauthenticated.
- `/api/studio/deployments` returns 401 when unauthenticated.
- `/api/studio/stripe/checkout` returns 401 when unauthenticated.

- [ ] **Step 2: Add authenticated smoke script**

`scripts/smoke-studio-authenticated.mjs` reads:

- `SMOKE_BASE_URL`;
- `SMOKE_COOKIE` or `SMOKE_BEARER_TOKEN`.

It checks:

- `GET /api/studio/ops/summary` returns ok;
- `GET /api/studio/autonomy/jobs` returns jobs/actions/approvals arrays;
- `GET /api/studio/infra/services` returns service list or repairable partial result.

- [ ] **Step 3: Add package script**

```json
"smoke:studio": "node scripts/smoke-studio-authenticated.mjs"
```

- [ ] **Step 4: Verify locally**

Run:

```bash
npm run smoke
npm run typecheck
```

Expected: pass. Authenticated smoke may be documented but skipped unless env credentials are provided.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-app.mjs scripts/smoke-studio-authenticated.mjs package.json docs/runbooks/smoke-tests.md
git commit -m "test: add production-oriented studio smoke checks"
```

---

### Task 7: Runbooks Et Verification Coolify/Supabase

**Files:**
- Modify: `docs/runbooks/daily-operations.md`
- Modify: `docs/runbooks/autonomy-incident.md`
- Modify: `docs/runbooks/database-migrations.md`
- Modify: `scripts/validate-supabase-remote.mjs`

- [ ] **Step 1: Update daily operations**

Document the morning flow:

1. Open `/studio`.
2. Read `Operations`.
3. Execute only the top recommended action.
4. Check `/studio/agents` approvals.
5. Run `npm run ops:readiness`.
6. Run `SMOKE_BASE_URL=<production-url> npm run smoke`.

- [ ] **Step 2: Update autonomy incident**

Add repair order:

1. Enable dry-run/kill switch.
2. Reject unsafe approvals.
3. Retry failed jobs one by one.
4. Validate source tables on Coolify Supabase.
5. Re-enable autonomy only after smoke passes.

- [ ] **Step 3: Extend remote validation**

`scripts/validate-supabase-remote.mjs` must verify columns for:

- `autonomy_jobs.status`, `attempt_count`, `last_error`;
- `autonomy_actions.status`, `action_type`, `output`;
- `human_approvals.status`, `action_id`;
- `venture_events.event_type`, `amount_eur`;
- `automation_runs.status`, `duration_ms`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run ops:readiness
npm run supabase:validate
```

Expected:

- `ops:readiness` passes locally.
- `supabase:validate` passes only when env points to Coolify Supabase; otherwise document the missing env clearly.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/daily-operations.md docs/runbooks/autonomy-incident.md docs/runbooks/database-migrations.md scripts/validate-supabase-remote.mjs
git commit -m "docs: align operations runbooks with actionable studio"
```

---

## Final Verification

Run:

```bash
npm test
npm run ops:coherence
npm run ops:readiness
npm run typecheck
npm run build
npm run smoke
```

Then browser-verify:

- `http://localhost:3001/studio`
- `http://localhost:3001/studio/agents`
- `http://localhost:3001/studio/automations`
- `http://localhost:3001/studio/infrastructure`
- `http://localhost:3001/studio/analytics`
- `http://localhost:3001/studio/marketing`

Expected:

- no login loop when already connected;
- no fake run counts;
- Operations has executable or navigable actions;
- approvals are actionable;
- failed jobs/actions have repair paths;
- analytics panels cite real sources or show explicit empty states.

## Recommended Execution Order

1. Task 1 and Task 2: backend contract for actions.
2. Task 3: Cockpit becomes actionable.
3. Task 4: approvals/jobs become operable.
4. Task 5: venture loop closes visibly.
5. Task 6: smoke tests protect the product.
6. Task 7: Coolify/Supabase runbooks make production repair calm.

