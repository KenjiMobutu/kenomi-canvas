# Actionable Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Cockpit operations block into an actionable daily brief that says what needs attention and gives one-click repair paths.

**Architecture:** Extend the existing `StudioOpsSummary` pure builder with a typed `actions` array derived from the same source-of-truth counts. The API returns those actions, and the Cockpit renders them under the operational cards with clear labels and repair links.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, existing Supabase-backed ops summary.

---

## File Structure

- Modify `lib/ops/studio-ops-summary.ts`: add `StudioOpsAction` and derive actions from approvals, automation failures, stale infra, and missing runs.
- Modify `lib/ops/studio-ops-summary.test.ts`: assert action ordering and calm-state fallback action.
- Modify `app/studio/page.tsx`: render action rows inside `OpsSummaryStrip`.
- Verify with `npm test`, `npm run ops:coherence`, `npm run typecheck`, `npm run build`, and browser sweep on `/studio`.

---

### Task 1: Add Summary Actions

**Files:**

- Modify: `lib/ops/studio-ops-summary.ts`
- Modify: `lib/ops/studio-ops-summary.test.ts`

- [ ] **Step 1: Add failing action tests**

```ts
it('prioritizes pending approvals before other actions', () => {
  const summary = buildStudioOpsSummary({
    agentRunCount: 0,
    automationRunCount: 0,
    pendingApprovalCount: 2,
    failedAutomationRunCount: 1,
    staleServiceCount: 1,
    latestAgentRunAt: null,
    latestAutomationRunAt: null,
    now: new Date('2026-05-19T10:00:00.000Z'),
  })

  expect(summary.actions[0]).toMatchObject({
    id: 'review-approvals',
    label: 'Valider les approvals',
    href: '/studio/agents',
    tone: 'warn',
  })
})

it('keeps a calm verification action when nothing needs repair', () => {
  const summary = buildStudioOpsSummary({
    agentRunCount: 1,
    automationRunCount: 1,
    pendingApprovalCount: 0,
    failedAutomationRunCount: 0,
    staleServiceCount: 0,
    latestAgentRunAt: '2026-05-19T09:59:00.000Z',
    latestAutomationRunAt: '2026-05-19T09:58:00.000Z',
    now: new Date('2026-05-19T10:00:00.000Z'),
  })

  expect(summary.actions).toEqual([
    {
      id: 'verify-sources',
      label: 'Vérifier les sources',
      detail: 'Les sources critiques répondent. Ouvrir le cockpit pour inspection.',
      href: '/studio',
      tone: 'ok',
    },
  ])
})
```

- [ ] **Step 2: Implement `StudioOpsAction`**

Add:

```ts
export interface StudioOpsAction {
  id: string
  label: string
  detail: string
  href: string
  tone: 'ok' | 'warn' | 'muted'
}
```

and add `actions: StudioOpsAction[]` to `StudioOpsSummary`.

- [ ] **Step 3: Derive actions**

Build actions in this order:

```ts
const actions: StudioOpsAction[] = []
if (input.pendingApprovalCount > 0) actions.push(...)
if (input.failedAutomationRunCount > 0) actions.push(...)
if (input.staleServiceCount > 0) actions.push(...)
if (input.agentRunCount === 0) actions.push(...)
if (input.automationRunCount === 0) actions.push(...)
if (actions.length === 0) actions.push(verify-sources)
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run lib/ops/studio-ops-summary.test.ts`

Expected: pass.

---

### Task 2: Render Actions In Cockpit

**Files:**

- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Extend payload types**

Add `OpsSummaryAction` matching the API action shape and add `actions: OpsSummaryAction[]` to `OpsSummaryPayload`.

- [ ] **Step 2: Render actions below cards**

Inside `OpsSummaryStrip`, below the card grid, render the first three actions as compact links with label, detail, and color by tone.

- [ ] **Step 3: Browser verify**

Open `http://localhost:3001/studio`.

Expected:

- `Operations` still appears.
- At least one action appears.
- Links point to `/studio/agents`, `/studio/automations`, `/studio/infrastructure`, or `/studio`.

---

### Task 3: Final Verification

**Files:**

- No new files unless fixes are required.

- [ ] **Step 1: Run commands**

```bash
npm test -- --run lib/ops/studio-ops-summary.test.ts
npm run ops:coherence
npm run typecheck
npm run build
```

- [ ] **Step 2: Browser sweep**

Verify `/studio` in the connected browser.

Expected:

- Cockpit has operational cards and action rows.
- No fake run or analytics signals return.
