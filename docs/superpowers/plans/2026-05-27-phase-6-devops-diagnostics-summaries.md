# Phase 6 DevOps Diagnostics and Incident Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `DevOps Agent` operational as a read-only infrastructure agent that persists diagnostic snapshots, derives incidents, generates grounded summaries, and exposes them in Studio.

**Architecture:** Reuse the existing infra diagnostics and timeline code as the source of truth, add an append-only snapshot table for DevOps runs, route `runAgentStep('devops')` through a structured summary path, and project the latest summary plus incidents into `/studio/infrastructure`. No repair execution, no new privileged actions, and no control-plane escalation in this phase.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgREST, existing infra diagnostics/timeline helpers, existing agent orchestration path in `lib/autonomy/run-agent-step.ts`, Studio infrastructure UI.

---

### Task 1: Persist DevOps diagnostic snapshots

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260525_prospect_crm.sql`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/diagnostic-log.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/diagnostic-log.test.ts`

- [ ] **Step 1: Write failing tests for DevOps diagnostic snapshot rows**

Cover:
- append-only row creation
- persisted shape for `summary_status`, `checked_at`, runtime/services/proxmox/timeline payloads
- no write when required payloads are absent

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/devops/diagnostic-log.test.ts
```

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Extend the cumulative Supabase migration**

Add a lightweight table:
- `public.devops_diagnostic_runs`

Recommended fields:
- `id`
- `user_id`
- `summary_status`
- `checked_at`
- `runtime_payload`
- `services_payload`
- `proxmox_payload`
- `timeline_payload`
- `created_at`

Add:
- RLS policy scoped to `user_id`
- grants for `authenticated` and `service_role`
- recency index on `(user_id, created_at desc)`

- [ ] **Step 4: Implement the persistence helper**

Create `lib/devops/diagnostic-log.ts` to:
- build snapshot rows from current diagnostics + timeline
- append the latest snapshot to `devops_diagnostic_runs`

Keep the module focused: no UI code, no LLM code, no repair logic.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/devops/diagnostic-log.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/devops/diagnostic-log.ts lib/devops/diagnostic-log.test.ts
git commit -m "feat(devops): persist diagnostic snapshots"
```

### Task 2: Add structured DevOps summary formatting and parsing

**Files:**
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/summary.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/agent-output-schemas.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/summary.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/agent-output-schemas.test.ts`

- [ ] **Step 1: Write failing tests for the DevOps summary shape**

Cover:
- JSON schema for `devops` agent output
- formatting of diagnostics/timeline into a compact model context
- grounded summary expectations for `ok`, `degraded`, and `down`

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/devops/summary.test.ts lib/agent-output-schemas.test.ts
```

Expected: FAIL due to missing `devops` schema and summary helpers.

- [ ] **Step 3: Implement a focused DevOps summary helper**

Create `lib/devops/summary.ts` to:
- format current diagnostics and incidents into concise model context
- keep service lists compact
- surface the highest-value `operator_next_step`

The helper should be deterministic and readable without the UI.

- [ ] **Step 4: Add `devops` output schema support**

Extend `lib/agent-output-schemas.ts` with a strict `devops` schema, for example:

```json
{
  "global_status": "ok|degraded|down",
  "headline": "...",
  "services": [
    {
      "id": "ollama",
      "status": "down",
      "severity": "high",
      "reason": "network timeout",
      "next_step": "verify Ollama reachability on the private host"
    }
  ],
  "summary": "...",
  "operator_next_step": "..."
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/devops/summary.test.ts lib/agent-output-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/devops/summary.ts lib/devops/summary.test.ts lib/agent-output-schemas.ts lib/agent-output-schemas.test.ts
git commit -m "feat(devops): add structured summary output"
```

### Task 3: Route `runAgentStep('devops')` through diagnostics and snapshot persistence

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.test.ts`
- Reference: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/infra-diagnostics.ts`
- Reference: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/infra-ops-timeline.ts`

- [ ] **Step 1: Write failing tests for DevOps agent execution**

Cover:
- `agentId='devops'` builds its prompt from diagnostics and incidents
- parsed output matches the new `devops` schema
- a diagnostic snapshot row is inserted
- no infra mutation is attempted

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts
```

Expected: FAIL for missing DevOps routing behavior.

- [ ] **Step 3: Inject diagnostic context into the DevOps run path**

Update `runAgentStep` so that `devops`:
- collects or receives the latest diagnostics
- derives the timeline/incidents
- builds a summary context via `lib/devops/summary.ts`
- calls the model with grounded infra state

- [ ] **Step 4: Persist the snapshot after the run**

After the DevOps run completes:
- keep `agent_runs` insertion as usual
- append a `devops_diagnostic_runs` row

This path must remain read-only. No service restarts, deploy calls, or approval creation in this phase.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(devops): add diagnostics summary run path"
```

### Task 4: Expose DevOps summaries and incidents in Studio infrastructure

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/infra/diagnostics/route.ts`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/api-view.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/devops/api-view.test.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/infrastructure/page.tsx`

- [ ] **Step 1: Write failing tests for the DevOps API projection**

Cover:
- latest persisted summary row is projected correctly
- recent incidents are exposed with `open` / `resolved`
- deployment parity and checked time are surfaced

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/devops/api-view.test.ts
```

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Implement API projection helper**

Create `lib/devops/api-view.ts` to:
- map `devops_diagnostic_runs` rows into Studio-facing summary data
- keep raw payload access limited to what the UI needs

- [ ] **Step 4: Extend the infra diagnostics route**

Modify `/api/studio/infra/diagnostics` to also return:
- latest DevOps summary snapshot
- recent incidents
- deployment parity metadata if available

- [ ] **Step 5: Extend `/studio/infrastructure`**

Add:
- `Incident Summary` card
- `Recent Incidents` list
- `Last DevOps Run` metadata block

Keep the layout dense and operator-first. Do not add repair buttons.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- lib/devops/api-view.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run a full build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/studio/infra/diagnostics/route.ts app/studio/infrastructure/page.tsx lib/devops/api-view.ts lib/devops/api-view.test.ts
git commit -m "feat(infra): show devops summaries and incidents"
```

### Task 5: Add smoke coverage and operator docs

**Files:**
- Create or Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/scripts/smoke-devops-diagnostics.mjs`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/README.md`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/docs/runbooks/daily-operations.md`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/docs/runbooks/autonomy-incident.md`

- [ ] **Step 1: Add a DevOps smoke path**

The smoke should validate:
- a `devops` run completes
- a summary row lands in `devops_diagnostic_runs`
- the infra diagnostics route exposes the latest summary and incidents

- [ ] **Step 2: Add degraded-mode coverage**

Mock at least one source failure locally and verify:
- summary still renders
- incidents still appear
- raw diagnostics remain accessible

- [ ] **Step 3: Update docs**

Document:
- how to run the DevOps smoke
- what the summary means
- the read-only nature of the DevOps Agent in this phase

- [ ] **Step 4: Run verification**

Run:

```bash
npm test -- lib/devops/diagnostic-log.test.ts lib/devops/summary.test.ts lib/devops/api-view.test.ts lib/autonomy/run-agent-step.test.ts
node --check scripts/smoke-devops-diagnostics.mjs
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-devops-diagnostics.mjs README.md docs/runbooks/daily-operations.md docs/runbooks/autonomy-incident.md
git commit -m "test(devops): add diagnostics summary smoke"
```

---

## Final verification and rollout

- [ ] Apply the `devops_diagnostic_runs` migration in production
- [ ] Redeploy `kenomi-canvas`
- [ ] Run the DevOps smoke against production
- [ ] Verify `/studio/infrastructure` shows the summary and recent incidents
- [ ] Confirm no repair action or privileged execution path was introduced
- [ ] Confirm degraded source behavior does not crash the page

## Notes

- Keep Phase 6 strictly read-only.
- Do not add approval-backed repair actions in this pass.
- Reuse the current diagnostics and timeline code instead of introducing a second health model.
