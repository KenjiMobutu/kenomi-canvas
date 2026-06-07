# Diagnostic Cash Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing app into a focused `300EUR diagnostic` sales lane that pushes one contactable outbound flow from prospect to paid cash.

**Architecture:** Add a single active cash-lane playbook on top of the existing generic `Prospects -> Revenue -> Hermes -> Telegram` system. The implementation should centralize lane defaults and copy in a small shared domain module, then apply those defaults to Studio surfaces, Hermes summaries, and revenue tracking without introducing a new multi-offer abstraction layer.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, existing Studio route handlers, Hermes operator, Telegram control-plane, Jest/Vitest-style `npm test`, `npm run typecheck`, `npm run build`.

---

## File Structure

### New files

- `lib/revenue/diagnostic-cash-lane.ts`
  - Single source of truth for the active lane:
    - offer id / title / price
    - target segment
    - CTA copy
    - default message family
    - helper predicates for “lane-qualified” prospects
- `lib/revenue/diagnostic-cash-lane.test.ts`
  - Unit tests for the lane helpers and constants
- `lib/studio/diagnostic-cash-lane-view.ts`
  - Small view-model helpers for Studio cards and labels
- `lib/studio/diagnostic-cash-lane-view.test.ts`
  - Unit tests for Studio-facing labels and summaries

### Existing files to modify

- `lib/prospect/api-view.ts`
  - Extend summary/view model with lane-oriented counts:
    - `laneContactable`
    - `laneAwaitingApproval`
    - `laneFollowUpDue`
    - `laneHotReplies`
- `lib/prospect/api-view.test.ts`
- `app/api/studio/prospects/route.ts`
  - Support a dedicated lane filter/default behavior
- `app/studio/prospects/page.tsx`
  - Make the queue read as a `300EUR diagnostic` work surface
- `app/studio/page.tsx`
  - Make `Daily brief` and `Cash movement` explicitly tied to the active lane
- `app/studio/revenue/page.tsx`
  - Add an explicit playbook/lane summary and keep review cash-first
- `lib/hermes-operator/brief.ts`
  - Emit lane-specific blocker/push/stop guidance
- `lib/hermes-operator/context.ts`
  - Add lane-oriented queue counters
- `lib/hermes-operator/telegram-read-model.ts`
  - Keep Telegram answers grounded in the single lane
- `lib/hermes-operator/notifications.ts`
  - Keep proactive notifications short and lane-specific
- `lib/hermes-operator/*.test.ts`
  - Update fixture shape and expected summaries where needed

### Existing files to verify but likely not change much

- `app/api/operator/telegram/command/route.ts`
- `app/api/studio/revenue/insights/route.ts`
- `app/api/studio/autonomy/jobs/route.ts`

---

### Task 1: Add a single source of truth for the diagnostic cash lane

**Files:**
- Create: `lib/revenue/diagnostic-cash-lane.ts`
- Create: `lib/revenue/diagnostic-cash-lane.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  DIAGNOSTIC_CASH_LANE,
  isDiagnosticLaneContactableProspect,
  isDiagnosticLaneProspect,
} from '@/lib/revenue/diagnostic-cash-lane'

describe('diagnostic cash lane', () => {
  it('exposes the active offer defaults', () => {
    expect(DIAGNOSTIC_CASH_LANE.offer.slug).toBe('300eur-diagnostic')
    expect(DIAGNOSTIC_CASH_LANE.offer.priceEur).toBe(300)
    expect(DIAGNOSTIC_CASH_LANE.segment.slug).toBe('freelancers-small-agencies')
    expect(DIAGNOSTIC_CASH_LANE.cta.kind).toBe('book_diagnostic_call')
  })

  it('accepts a contactable lane prospect', () => {
    expect(
      isDiagnosticLaneContactableProspect({
        source: 'reddit',
        contact_email: 'founder@example.com',
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(true)
  })

  it('rejects a prospect without contactability', () => {
    expect(
      isDiagnosticLaneContactableProspect({
        source: 'reddit',
        contact_email: null,
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(false)
  })

  it('matches lane prospects conservatively', () => {
    expect(
      isDiagnosticLaneProspect({
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(true)

    expect(
      isDiagnosticLaneProspect({
        segment: 'ecommerce',
        offer_variant: 'other-offer',
      })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/revenue/diagnostic-cash-lane.test.ts`

Expected: FAIL with module/file-not-found or missing export errors.

- [ ] **Step 3: Write minimal implementation**

```ts
export const DIAGNOSTIC_CASH_LANE = {
  offer: {
    slug: '300eur-diagnostic',
    title: '300EUR Diagnostic',
    priceEur: 300,
  },
  segment: {
    slug: 'freelancers-small-agencies',
    title: 'Freelancers / Small Agencies',
  },
  cta: {
    kind: 'book_diagnostic_call',
    title: 'Book diagnostic call',
  },
  messageFamily: {
    slug: 'diagnostic-call-outbound-v1',
    title: 'Diagnostic call outbound v1',
  },
} as const

type ProspectLike = {
  segment?: string | null
  offer_variant?: string | null
  contact_email?: string | null
}

export function isDiagnosticLaneProspect(input: ProspectLike): boolean {
  return (
    input.segment === DIAGNOSTIC_CASH_LANE.segment.slug &&
    input.offer_variant === DIAGNOSTIC_CASH_LANE.offer.slug
  )
}

export function isDiagnosticLaneContactableProspect(input: ProspectLike): boolean {
  return isDiagnosticLaneProspect(input) && Boolean(input.contact_email?.includes('@'))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/revenue/diagnostic-cash-lane.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/revenue/diagnostic-cash-lane.ts lib/revenue/diagnostic-cash-lane.test.ts
git commit -m "feat(revenue): add diagnostic cash lane defaults"
```

---

### Task 2: Make Prospects read as a single active send queue

**Files:**
- Modify: `lib/prospect/api-view.ts`
- Modify: `lib/prospect/api-view.test.ts`
- Modify: `app/api/studio/prospects/route.ts`
- Modify: `app/studio/prospects/page.tsx`
- Test: `lib/api-routes/studio-prospects-read-split.test.ts`

- [ ] **Step 1: Write the failing tests for lane counts**

```ts
it('computes lane-oriented queue counts for contactable prospects', () => {
  const summary = buildProspectSummary([
    {
      pipeline_status: 'draft_created',
      approval_status: 'awaiting_approval',
      contact_status: 'contactable',
      segment: 'freelancers-small-agencies',
      offer_variant: '300eur-diagnostic',
      contact_email: 'a@example.com',
    },
    {
      pipeline_status: 'follow_up_due',
      approval_status: 'approved',
      contact_status: 'contactable',
      segment: 'freelancers-small-agencies',
      offer_variant: '300eur-diagnostic',
      contact_email: 'b@example.com',
    },
  ])

  expect(summary.laneContactable).toBe(2)
  expect(summary.laneAwaitingApproval).toBe(1)
  expect(summary.laneFollowUpDue).toBe(1)
})
```

```ts
it('defaults the prospects experience to the diagnostic lane when contactable leads exist', async () => {
  const response = await GET(new Request('http://localhost/api/studio/prospects'))
  const body = await response.json()

  expect(body.filters.activeLane).toBe('300eur-diagnostic')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/prospect/api-view.test.ts lib/api-routes/studio-prospects-read-split.test.ts`

Expected: FAIL with missing summary fields / response shape mismatches.

- [ ] **Step 3: Implement the summary helpers and route defaults**

```ts
// inside lib/prospect/api-view.ts
const inDiagnosticLane =
  row.contact_status === 'contactable' &&
  isDiagnosticLaneContactableProspect({
    segment: row.segment,
    offer_variant: row.offer_variant,
    contact_email: row.contact_email,
  })

if (inDiagnosticLane) acc.laneContactable += 1
if (inDiagnosticLane && row.approval_status === 'awaiting_approval') acc.laneAwaitingApproval += 1
if (inDiagnosticLane && row.pipeline_status === 'follow_up_due') acc.laneFollowUpDue += 1
if (inDiagnosticLane && row.pipeline_status === 'replied') acc.laneHotReplies += 1
```

```ts
// inside app/api/studio/prospects/route.ts
const activeLane = DIAGNOSTIC_CASH_LANE.offer.slug

return NextResponse.json({
  ...view,
  filters: {
    ...view.filters,
    activeLane,
  },
})
```

```tsx
// inside app/studio/prospects/page.tsx
<SectionHeader
  title="300EUR diagnostic queue"
  subtitle="Contactable freelancers / small agencies only."
/>
<Chip label={`${summary.laneAwaitingApproval} awaiting approval`} tone="warm" />
<Chip label={`${summary.laneFollowUpDue} due follow-ups`} tone="cold" />
<Chip label={`${summary.laneHotReplies} hot replies`} tone="good" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/prospect/api-view.test.ts lib/api-routes/studio-prospects-read-split.test.ts`

Expected: PASS

- [ ] **Step 5: Run targeted UI safety checks**

Run: `npm test -- lib/studio/prospect-filters.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/prospect/api-view.ts lib/prospect/api-view.test.ts app/api/studio/prospects/route.ts app/studio/prospects/page.tsx lib/api-routes/studio-prospects-read-split.test.ts
git commit -m "feat(prospects): focus active queue on diagnostic lane"
```

---

### Task 3: Make Studio and Revenue show one commercial playbook

**Files:**
- Create: `lib/studio/diagnostic-cash-lane-view.ts`
- Create: `lib/studio/diagnostic-cash-lane-view.test.ts`
- Modify: `app/studio/page.tsx`
- Modify: `app/studio/revenue/page.tsx`
- Test: `lib/revenue/weekly-review.test.ts`

- [ ] **Step 1: Write the failing tests for Studio lane labels**

```ts
import { buildDiagnosticCashLaneSummary } from '@/lib/studio/diagnostic-cash-lane-view'

it('builds the active playbook summary for Studio surfaces', () => {
  const summary = buildDiagnosticCashLaneSummary({
    laneContactable: 12,
    laneAwaitingApproval: 3,
    laneFollowUpDue: 4,
    paidCount: 1,
    paidCashEur: 300,
  })

  expect(summary.title).toBe('300EUR diagnostic')
  expect(summary.subtitle).toContain('Freelancers / Small Agencies')
  expect(summary.primaryMetric).toContain('300')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/studio/diagnostic-cash-lane-view.test.ts`

Expected: FAIL with file-not-found or missing export errors.

- [ ] **Step 3: Implement the view helper and wire it into Studio**

```ts
export function buildDiagnosticCashLaneSummary(input: {
  laneContactable: number
  laneAwaitingApproval: number
  laneFollowUpDue: number
  paidCount: number
  paidCashEur: number
}) {
  return {
    title: '300EUR diagnostic',
    subtitle: 'Freelancers / Small Agencies',
    primaryMetric: `${input.paidCashEur}EUR paid`,
    blockers: `${input.laneAwaitingApproval} approvals · ${input.laneFollowUpDue} follow-ups`,
  }
}
```

```tsx
// inside app/studio/page.tsx
const lane = buildDiagnosticCashLaneSummary({
  laneContactable: prospects.summary.laneContactable,
  laneAwaitingApproval: prospects.summary.laneAwaitingApproval,
  laneFollowUpDue: prospects.summary.laneFollowUpDue,
  paidCount: revenue.weeklyReview.paidCount,
  paidCashEur: revenue.weeklyReview.paidCashEur,
})
```

```tsx
// inside app/studio/revenue/page.tsx
<TruthCard
  title="Active playbook"
  detail="300EUR diagnostic · freelancers / small agencies · book diagnostic call"
  tone="cold"
/>
```

- [ ] **Step 4: Extend weekly review assertions so the page never overstates a winner without paid proof**

```ts
expect(review.cashReality.verdict).toBe('no_cash_truth')
expect(review.nextExperiment.title).toContain('Get first paid proof')
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- lib/studio/diagnostic-cash-lane-view.test.ts lib/revenue/weekly-review.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/studio/diagnostic-cash-lane-view.ts lib/studio/diagnostic-cash-lane-view.test.ts app/studio/page.tsx app/studio/revenue/page.tsx lib/revenue/weekly-review.test.ts
git commit -m "feat(studio): surface diagnostic cash lane across studio"
```

---

### Task 4: Make Hermes and Telegram manage the lane, not the whole universe

**Files:**
- Modify: `lib/hermes-operator/context.ts`
- Modify: `lib/hermes-operator/brief.ts`
- Modify: `lib/hermes-operator/telegram-read-model.ts`
- Modify: `lib/hermes-operator/notifications.ts`
- Test: `lib/hermes-operator/context.test.ts`
- Test: `lib/hermes-operator/brief.test.ts`
- Test: `lib/hermes-operator/notifications.test.ts`
- Test: `lib/hermes-operator/telegram-read-model.test.ts`

- [ ] **Step 1: Write the failing tests for lane-prioritized Hermes output**

```ts
it('prioritizes approvals and follow-up debt for the diagnostic lane', () => {
  const brief = buildHermesBrief({
    pipeline: {
      laneAwaitingApproval: 4,
      laneFollowUpsDue: 3,
      laneHotLeads: 1,
    },
    weeklyReview: {
      paidCount: 0,
      paidCashEur: 0,
      cashReality: {
        verdict: 'no_cash_truth',
        title: 'No paid truth yet',
        detail: 'No paid cash has been attributed this week.',
      },
    },
  } as any)

  expect(brief.summary).toContain('Block cash')
  expect(brief.nextBestAction.title).toContain('Clear approvals')
})
```

```ts
it('renders Telegram brief in terms of the single diagnostic lane', () => {
  const text = formatTelegramBrief({
    brief: {
      summary: 'Block cash: 3 approvals pending.',
      nextBestAction: { title: 'Clear approvals', detail: 'Approve the visible sendable queue.' },
    },
  } as any)

  expect(text).toContain('300EUR diagnostic')
  expect(text).toContain('Clear approvals')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/hermes-operator/context.test.ts lib/hermes-operator/brief.test.ts lib/hermes-operator/notifications.test.ts lib/hermes-operator/telegram-read-model.test.ts`

Expected: FAIL with summary/content mismatches.

- [ ] **Step 3: Implement lane-scoped counters and copy**

```ts
// inside lib/hermes-operator/context.ts
const laneAwaitingApproval = prospects.summary.laneAwaitingApproval
const laneFollowUpsDue = prospects.summary.laneFollowUpDue
const laneHotLeads = prospects.summary.laneHotReplies
```

```ts
// inside lib/hermes-operator/brief.ts
if (context.pipeline.laneAwaitingApproval > 0) {
  return {
    summary: `Block cash: ${context.pipeline.laneAwaitingApproval} diagnostic approvals pending.`,
    nextBestAction: {
      title: 'Clear approvals',
      detail: 'Approve the visible contactable send queue for the 300EUR diagnostic.',
    },
  }
}
```

```ts
// inside lib/hermes-operator/telegram-read-model.ts
lines.push('Active lane: 300EUR diagnostic')
lines.push(`Next: ${brief.nextBestAction.title}`)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/hermes-operator/context.test.ts lib/hermes-operator/brief.test.ts lib/hermes-operator/notifications.test.ts lib/hermes-operator/telegram-read-model.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/hermes-operator/context.ts lib/hermes-operator/brief.ts lib/hermes-operator/telegram-read-model.ts lib/hermes-operator/notifications.ts lib/hermes-operator/context.test.ts lib/hermes-operator/brief.test.ts lib/hermes-operator/notifications.test.ts lib/hermes-operator/telegram-read-model.test.ts
git commit -m "feat(hermes): manage the diagnostic cash lane explicitly"
```

---

### Task 5: Run end-to-end verification for the lane and document operator usage

**Files:**
- Modify: `docs/runbooks/telegram-hermes-operator.md`
- Verify: `app/studio/prospects/page.tsx`
- Verify: `app/studio/revenue/page.tsx`
- Verify: `app/studio/page.tsx`

- [ ] **Step 1: Add a short operator runbook section for the diagnostic lane**

```md
## Diagnostic cash lane

Active commercial lane:

- offer: `300EUR diagnostic`
- target: `freelancers / small agencies`
- CTA: `book diagnostic call`

Daily operator order:

1. clear visible approvals
2. clear due follow-ups
3. act on hot replies
4. refresh prospecting only after queue debt is handled
```

- [ ] **Step 2: Run focused tests for the integrated lane**

Run:

```bash
npm test -- \
  lib/revenue/diagnostic-cash-lane.test.ts \
  lib/studio/diagnostic-cash-lane-view.test.ts \
  lib/prospect/api-view.test.ts \
  lib/api-routes/studio-prospects-read-split.test.ts \
  lib/hermes-operator/context.test.ts \
  lib/hermes-operator/brief.test.ts \
  lib/hermes-operator/telegram-read-model.test.ts \
  lib/hermes-operator/notifications.test.ts \
  lib/revenue/weekly-review.test.ts
```

Expected: PASS

- [ ] **Step 3: Run type and build verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected:

- `typecheck` exits `0`
- `build` exits `0`

- [ ] **Step 4: Manual operator verification in the app**

Check in the browser:

- `/studio` shows the active `300EUR diagnostic` lane in the daily operating story
- `/studio/prospects` reads like a send/follow-up queue, not a generic CRM
- `/studio/revenue` shows paid truth and does not imply fake winners without paid proof
- Telegram `/brief` mentions the lane and the next best action clearly

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/telegram-hermes-operator.md
git commit -m "docs(operator): add diagnostic cash lane operating runbook"
```

---

## Self-Review

### Spec coverage

- Single offer / single segment / single CTA: covered in Tasks 1, 2, 3
- Contactable-only active queue: covered in Task 2
- Cash-first Studio and Revenue presentation: covered in Task 3
- Hermes as queue manager and Telegram operator: covered in Task 4
- Daily operator usage and verification: covered in Task 5

No uncovered spec sections remain.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” references remain in task steps.
- Each coding step contains concrete code or content.

### Type consistency

- Lane naming is consistent:
  - `300EUR diagnostic`
  - `300eur-diagnostic`
  - `freelancers-small-agencies`
- Queue metrics are consistently named:
  - `laneContactable`
  - `laneAwaitingApproval`
  - `laneFollowUpDue`
  - `laneHotReplies`

---

Plan complete and saved to `docs/superpowers/plans/2026-06-07-diagnostic-cash-lane-implementation.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
