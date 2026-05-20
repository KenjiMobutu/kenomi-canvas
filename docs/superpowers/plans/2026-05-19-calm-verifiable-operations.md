# Calm Verifiable Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daily Studio operations calm, verifiable, and easy to repair by ensuring every important UI number has a real source, a visible freshness state, and a next repair action.

**Architecture:** Add a small operations data layer that derives page-level health from existing Supabase tables and infrastructure APIs. Surface that layer first in Cockpit, then reuse it in Agents, Infrastructure, Analytics, and Automations so pages stop inventing operational meaning locally.

**Tech Stack:** Next.js App Router, React client pages, Supabase browser/server clients, Vitest, TypeScript, existing `CkShell` Studio UI, Coolify-hosted Supabase for remote validation.

---

## File Structure

- Create `lib/ops/source-status.ts`: shared freshness, source, and repair metadata types.
- Create `lib/ops/source-status.test.ts`: unit tests for freshness and status derivation.
- Create `lib/ops/studio-ops-summary.ts`: pure aggregation for Cockpit health cards.
- Create `lib/ops/studio-ops-summary.test.ts`: unit tests for Cockpit summary.
- Create `app/api/studio/ops/summary/route.ts`: authenticated API returning one operational summary payload.
- Modify `app/studio/page.tsx`: replace static rhythm/status blocks with summary-driven status and repair links.
- Modify `app/studio/agents/page.tsx`: add source/freshness labels and use real runs for all run surfaces.
- Modify `app/studio/infrastructure/page.tsx`: add repair actions and latest check timestamps to service cards.
- Modify `app/studio/analytics/page.tsx`: keep non-instrumented panels empty and add source labels for live panels.
- Modify `app/studio/automations/page.tsx`: show run source/freshness and actionable empty/error states.
- Create `scripts/audit-studio-coherence.mjs`: browser-readable/static audit script for known fake-number patterns.
- Modify `package.json`: add `ops:coherence`.

---

### Task 1: Shared Source Status Model

**Files:**

- Create: `lib/ops/source-status.ts`
- Create: `lib/ops/source-status.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { getFreshnessStatus, makeSourceStatus } from './source-status'

describe('source status', () => {
  it('marks recent data as fresh', () => {
    expect(
      getFreshnessStatus('2026-05-19T10:00:00.000Z', new Date('2026-05-19T10:04:00.000Z'), 10)
    ).toBe('fresh')
  })

  it('marks old data as stale', () => {
    expect(
      getFreshnessStatus('2026-05-19T09:00:00.000Z', new Date('2026-05-19T10:04:00.000Z'), 10)
    ).toBe('stale')
  })

  it('builds a repairable missing source status', () => {
    expect(
      makeSourceStatus({
        source: 'agent_runs',
        checkedAt: null,
        repairHref: '/studio/agents',
        emptyLabel: 'Aucun run agent enregistré',
      })
    ).toEqual({
      source: 'agent_runs',
      checkedAt: null,
      freshness: 'missing',
      repairHref: '/studio/agents',
      emptyLabel: 'Aucun run agent enregistré',
    })
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/ops/source-status.test.ts`

Expected: failure because `lib/ops/source-status.ts` does not exist.

- [ ] **Step 3: Implement shared model**

```ts
export type FreshnessStatus = 'fresh' | 'stale' | 'missing'

export interface SourceStatus {
  source: string
  checkedAt: string | null
  freshness: FreshnessStatus
  repairHref: string
  emptyLabel: string
}

export function getFreshnessStatus(
  checkedAt: string | null,
  now: Date = new Date(),
  staleAfterMinutes = 15
): FreshnessStatus {
  if (!checkedAt) return 'missing'
  const checkedMs = Date.parse(checkedAt)
  if (!Number.isFinite(checkedMs)) return 'missing'
  const ageMs = now.getTime() - checkedMs
  return ageMs <= staleAfterMinutes * 60_000 ? 'fresh' : 'stale'
}

export function makeSourceStatus(input: {
  source: string
  checkedAt: string | null
  repairHref: string
  emptyLabel: string
  now?: Date
  staleAfterMinutes?: number
}): SourceStatus {
  return {
    source: input.source,
    checkedAt: input.checkedAt,
    freshness: getFreshnessStatus(input.checkedAt, input.now, input.staleAfterMinutes),
    repairHref: input.repairHref,
    emptyLabel: input.emptyLabel,
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- --run lib/ops/source-status.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ops/source-status.ts lib/ops/source-status.test.ts
git commit -m "feat: add source status model"
```

---

### Task 2: Cockpit Operations Summary API

**Files:**

- Create: `lib/ops/studio-ops-summary.ts`
- Create: `lib/ops/studio-ops-summary.test.ts`
- Create: `app/api/studio/ops/summary/route.ts`

- [ ] **Step 1: Write aggregation tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildStudioOpsSummary } from './studio-ops-summary'

describe('studio ops summary', () => {
  it('reports calm state when critical sources are empty but not failing', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 0,
      automationRunCount: 0,
      pendingApprovalCount: 0,
      failedAutomationRunCount: 0,
      staleServiceCount: 0,
      latestAgentRunAt: null,
      latestAutomationRunAt: null,
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.mode).toBe('calm')
    expect(summary.cards.map((card) => card.label)).toEqual([
      'Agents',
      'Automations',
      'Approvals',
      'Infrastructure',
    ])
    expect(summary.cards[0].value).toBe('0')
    expect(summary.cards[0].source.source).toBe('agent_runs')
  })

  it('reports attention when approvals or failures exist', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 2,
      automationRunCount: 3,
      pendingApprovalCount: 1,
      failedAutomationRunCount: 1,
      staleServiceCount: 0,
      latestAgentRunAt: '2026-05-19T09:59:00.000Z',
      latestAutomationRunAt: '2026-05-19T09:58:00.000Z',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.mode).toBe('attention')
    expect(summary.primaryRepairHref).toBe('/studio/agents')
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/ops/studio-ops-summary.test.ts`

Expected: failure because the summary module does not exist.

- [ ] **Step 3: Implement pure summary builder**

```ts
import { makeSourceStatus, type SourceStatus } from './source-status'

export type StudioOpsMode = 'calm' | 'attention'

export interface StudioOpsCard {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'muted'
  source: SourceStatus
}

export interface StudioOpsSummary {
  mode: StudioOpsMode
  primaryRepairHref: string
  cards: StudioOpsCard[]
}

export function buildStudioOpsSummary(input: {
  agentRunCount: number
  automationRunCount: number
  pendingApprovalCount: number
  failedAutomationRunCount: number
  staleServiceCount: number
  latestAgentRunAt: string | null
  latestAutomationRunAt: string | null
  now?: Date
}): StudioOpsSummary {
  const mode: StudioOpsMode =
    input.pendingApprovalCount > 0 ||
    input.failedAutomationRunCount > 0 ||
    input.staleServiceCount > 0
      ? 'attention'
      : 'calm'

  return {
    mode,
    primaryRepairHref:
      input.pendingApprovalCount > 0
        ? '/studio/agents'
        : input.failedAutomationRunCount > 0
          ? '/studio/automations'
          : input.staleServiceCount > 0
            ? '/studio/infrastructure'
            : '/studio',
    cards: [
      {
        label: 'Agents',
        value: String(input.agentRunCount),
        tone: input.agentRunCount > 0 ? 'ok' : 'muted',
        source: makeSourceStatus({
          source: 'agent_runs',
          checkedAt: input.latestAgentRunAt,
          repairHref: '/studio/agents',
          emptyLabel: 'Aucun run agent enregistré',
          now: input.now,
        }),
      },
      {
        label: 'Automations',
        value: String(input.automationRunCount),
        tone:
          input.failedAutomationRunCount > 0
            ? 'warn'
            : input.automationRunCount > 0
              ? 'ok'
              : 'muted',
        source: makeSourceStatus({
          source: 'automation_runs',
          checkedAt: input.latestAutomationRunAt,
          repairHref: '/studio/automations',
          emptyLabel: 'Aucun run automation enregistré',
          now: input.now,
        }),
      },
      {
        label: 'Approvals',
        value: String(input.pendingApprovalCount),
        tone: input.pendingApprovalCount > 0 ? 'warn' : 'ok',
        source: makeSourceStatus({
          source: 'human_approvals',
          checkedAt: new Date().toISOString(),
          repairHref: '/studio/agents',
          emptyLabel: 'Aucun gate en attente',
          now: input.now,
        }),
      },
      {
        label: 'Infrastructure',
        value: String(input.staleServiceCount),
        tone: input.staleServiceCount > 0 ? 'warn' : 'ok',
        source: makeSourceStatus({
          source: 'services_health',
          checkedAt: new Date().toISOString(),
          repairHref: '/studio/infrastructure',
          emptyLabel: 'Tous les checks infra répondent',
          now: input.now,
        }),
      },
    ],
  }
}
```

- [ ] **Step 4: Implement authenticated route**

Create `app/api/studio/ops/summary/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildStudioOpsSummary } from '@/lib/ops/studio-ops-summary'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [agentRuns, automationRuns, pendingApprovals, failedAutomationRuns] = await Promise.all([
    supabase
      .from('agent_runs')
      .select('created_at', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('automation_runs')
      .select('triggered_at', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('triggered_at', { ascending: false })
      .limit(1),
    supabase
      .from('human_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('status', 'pending'),
    supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .neq('status', 'success'),
  ])

  const firstError = [
    agentRuns.error,
    automationRuns.error,
    pendingApprovals.error,
    failedAutomationRuns.error,
  ].find(Boolean)

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    summary: buildStudioOpsSummary({
      agentRunCount: agentRuns.count ?? 0,
      automationRunCount: automationRuns.count ?? 0,
      pendingApprovalCount: pendingApprovals.count ?? 0,
      failedAutomationRunCount: failedAutomationRuns.count ?? 0,
      staleServiceCount: 0,
      latestAgentRunAt: agentRuns.data?.[0]?.created_at ?? null,
      latestAutomationRunAt: automationRuns.data?.[0]?.triggered_at ?? null,
    }),
  })
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --run lib/ops/source-status.test.ts lib/ops/studio-ops-summary.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ops app/api/studio/ops/summary/route.ts
git commit -m "feat: add studio operations summary"
```

---

### Task 3: Cockpit Becomes The Daily Operations Surface

**Files:**

- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Add summary state and loader**

Add these types and state near existing Cockpit page state:

```ts
type OpsSummaryCard = {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'muted'
  source: {
    source: string
    checkedAt: string | null
    freshness: 'fresh' | 'stale' | 'missing'
    repairHref: string
    emptyLabel: string
  }
}

type OpsSummaryPayload = {
  mode: 'calm' | 'attention'
  primaryRepairHref: string
  cards: OpsSummaryCard[]
}

const [opsSummary, setOpsSummary] = useState<OpsSummaryPayload | null>(null)
```

Add a `useEffect`:

```ts
useEffect(() => {
  let cancelled = false
  fetch('/api/studio/ops/summary')
    .then((res) => res.json())
    .then((data) => {
      if (!cancelled && data?.ok) setOpsSummary(data.summary as OpsSummaryPayload)
    })
    .catch(() => {
      if (!cancelled) setOpsSummary(null)
    })
  return () => {
    cancelled = true
  }
}, [])
```

- [ ] **Step 2: Replace static daily status with summary cards**

Create a small Cockpit component inside `app/studio/page.tsx`:

```tsx
function OpsSummaryStrip({ summary }: { summary: OpsSummaryPayload | null }) {
  const cards = summary?.cards ?? []
  if (cards.length === 0) {
    return (
      <section
        style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: text }}>
          Operations
        </h3>
        <p style={{ margin: '10px 0 0', color: muted, fontSize: 12 }}>
          Résumé opérationnel indisponible.
        </p>
      </section>
    )
  }

  return (
    <section
      style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: text }}>
          Operations
        </h3>
        <a
          href={summary.primaryRepairHref}
          style={{ color: summary.mode === 'attention' ? amber : emerald, fontSize: 11 }}
        >
          {summary.mode === 'attention' ? 'Voir action' : 'Calme'}
        </a>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}
      >
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.source.repairHref}
            style={{
              textDecoration: 'none',
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${line}`,
              background: surface2,
              color: text,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted,
                letterSpacing: '.12em',
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              {card.value}
            </div>
            <div
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, marginTop: 4 }}
            >
              {card.source.source} · {card.source.freshness}
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Render it above KPI grid**

Place:

```tsx
<OpsSummaryStrip summary={opsSummary} />
```

above the current Cockpit KPI section.

- [ ] **Step 4: Browser verify**

Run: `npm run dev`

Open: `http://localhost:3001/studio`

Expected:

- Operations section appears.
- Cards link to Agents, Automations, and Infrastructure.
- Empty states say the source is missing instead of implying fake activity.

- [ ] **Step 5: Commit**

```bash
git add app/studio/page.tsx
git commit -m "feat: make cockpit operations summary-driven"
```

---

### Task 4: Agents Page Repairability

**Files:**

- Modify: `app/studio/agents/page.tsx`
- Modify: `lib/agent-run-metrics.ts`
- Modify: `lib/agent-run-metrics.test.ts`

- [ ] **Step 1: Extend agent metrics test for repair hints**

Add to `lib/agent-run-metrics.test.ts`:

```ts
it('keeps 24h runs separate from lifetime runs', () => {
  const metrics = buildAgentRunMetrics(
    [
      { agent_id: 'scout', duration_ms: 1000, created_at: '2026-05-19T09:00:00.000Z' },
      { agent_id: 'scout', duration_ms: 1000, created_at: '2026-05-17T09:00:00.000Z' },
    ],
    ['scout'],
    new Date('2026-05-19T10:00:00.000Z')
  )

  expect(metrics.scout.run_count).toBe(2)
  expect(metrics.scout.runs_24h).toBe(1)
})
```

- [ ] **Step 2: Run test**

Run: `npm test -- --run lib/agent-run-metrics.test.ts`

Expected: pass if current helper already supports this.

- [ ] **Step 3: Add visible source label in AgentInspector**

Under the stats grid in `AgentInspector`, add:

```tsx
<div
  style={{
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    color: muted2,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
  }}
>
  source agent_runs · {runMetric.run_count === 0 ? 'aucun run enregistré' : 'historique réel'}
</div>
```

- [ ] **Step 4: Add repair action for missing runs**

Near the existing `Run mission` button, render:

```tsx
{
  runMetric.run_count === 0 && (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px dashed ${line2}`,
        background: surface2,
        color: muted,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      Aucun run réel pour cet agent. Lancez une mission pour créer une ligne dans agent_runs.
    </div>
  )
}
```

- [ ] **Step 5: Browser verify**

Open: `http://localhost:3001/studio/agents`

Expected:

- No `+43 runs`.
- Source label mentions `agent_runs`.
- Scout with no user runs shows repair guidance.

- [ ] **Step 6: Commit**

```bash
git add app/studio/agents/page.tsx lib/agent-run-metrics.ts lib/agent-run-metrics.test.ts
git commit -m "feat: expose agent run source and repair hint"
```

---

### Task 5: Infrastructure Service Cards Get Repair Actions

**Files:**

- Modify: `app/studio/infrastructure/page.tsx`
- Modify: `app/api/studio/infra/services/route.ts`

- [ ] **Step 1: Extend service payload**

In `app/api/studio/infra/services/route.ts`, return each service with:

```ts
{
  id: service.id,
  label: service.label,
  status: service.status,
  url: service.url,
  checkedAt: new Date().toISOString(),
  repairHref: '/studio/settings',
}
```

For Proxmox-specific issues, use:

```ts
repairHref: '/studio/infrastructure'
```

- [ ] **Step 2: Add type fields on page**

In `app/studio/infrastructure/page.tsx`, extend `InfraService`:

```ts
checkedAt?: string | null
repairHref?: string
```

- [ ] **Step 3: Show latest check and repair link**

Inside each service card, add:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>
    {service.checkedAt ? `check ${minutesAgo(service.checkedAt)}` : 'check —'}
  </span>
  <a
    href={service.repairHref ?? '/studio/settings'}
    style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      color: service.status === 'ok' ? muted2 : amber,
    }}
  >
    réparer
  </a>
</div>
```

- [ ] **Step 4: Browser verify**

Open: `http://localhost:3001/studio/infrastructure`

Expected:

- Each service card shows check freshness.
- Non-ok service has an obvious repair link.
- Supabase remains treated as self-hosted via Coolify settings.

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/infra/services/route.ts app/studio/infrastructure/page.tsx
git commit -m "feat: add infrastructure repair links"
```

---

### Task 6: Analytics Source Labels And Instrumentation Backlog

**Files:**

- Modify: `app/studio/analytics/page.tsx`
- Create: `lib/metrics/analytics-source-status.test.ts`

- [ ] **Step 1: Add source assertions test**

Create `lib/metrics/analytics-source-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { aggregateLive } from '@/app/studio/analytics/page'

describe('analytics live aggregation', () => {
  it('reports no data when all venture event counters are zero', () => {
    expect(aggregateLive([]).hasData).toBe(false)
  })
})
```

If `aggregateLive` is not exported, move it to `lib/metrics/analytics-live.ts` and import it from both the page and the test.

- [ ] **Step 2: Run test and verify failure or pass**

Run: `npm test -- --run lib/metrics/analytics-source-status.test.ts`

Expected: if `aggregateLive` is not exported, TypeScript fails; then move it as described in Step 1.

- [ ] **Step 3: Add source labels to live cards**

In the Live KPIs block, add below the KPI grid:

```tsx
<div
  style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.1em' }}
>
  source venture_events · page_view, waitlist_signup, payment_succeeded, campaign_spend
</div>
```

- [ ] **Step 4: Keep non-instrumented panels empty**

Ensure these strings remain visible when no source exists:

```tsx
Aucune attribution agent fiable
Aucune cohorte calculée
Aucune donnée d'attribution
Aucune étape de funnel
```

- [ ] **Step 5: Browser verify**

Open: `http://localhost:3001/studio/analytics`

Expected:

- No equal fake `14%` attribution list.
- No generated `M3 avg 38%`.
- Live KPIs cite `venture_events`.

- [ ] **Step 6: Commit**

```bash
git add app/studio/analytics/page.tsx lib/metrics/analytics-live.ts lib/metrics/analytics-source-status.test.ts
git commit -m "feat: expose analytics data sources"
```

---

### Task 7: Coherence Audit Script

**Files:**

- Create: `scripts/audit-studio-coherence.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create script**

```js
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

const files = [...globSync('app/studio/**/*.tsx'), ...globSync('app/studio/*.tsx')]

const forbiddenPatterns = [
  { pattern: /\\+\\{Math\\.round\\([^}]+\\)\\} runs/, label: 'computed fake run badge' },
  { pattern: /M3 avg 38%/, label: 'fake cohort average' },
  { pattern: /14%/, label: 'equal fake attribution percent' },
]

const failures = []

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(source)) {
      failures.push(`${file}: ${rule.label}`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\\n'))
  process.exit(1)
}

console.log('ok studio coherence')
```

- [ ] **Step 2: Add package script**

Add to `package.json` scripts:

```json
"ops:coherence": "node scripts/audit-studio-coherence.mjs"
```

- [ ] **Step 3: Run script**

Run: `npm run ops:coherence`

Expected: `ok studio coherence`

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-studio-coherence.mjs package.json
git commit -m "test: add studio coherence audit"
```

---

### Task 8: Final Verification Sweep

**Files:**

- No new files unless fixes are required.

- [ ] **Step 1: Run automated verification**

```bash
npm test -- --run lib/ops/source-status.test.ts lib/ops/studio-ops-summary.test.ts lib/agent-run-metrics.test.ts lib/automation-run-metrics.test.ts
npm run ops:coherence
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Browser sweep**

Open each page on `http://localhost:3001`:

```text
/studio
/studio/agents
/studio/automations
/studio/analytics
/studio/infrastructure
/studio/settings
/studio/ventures
/studio/marketing
/studio/documents
/studio/chat
/studio/api-keys
/studio/gamification
```

Expected:

- No login redirect while connected.
- No fake run badge.
- No fake equal attribution.
- Empty data is shown as empty data.
- Pages with failures show a repair link.

- [ ] **Step 3: Remote Supabase validation**

Use the remembered Coolify path:

```bash
ssh -o BatchMode=yes coolify 'docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -P pager=off -c "select count(*) from public.agent_runs;"'
```

Expected: query succeeds against the Coolify-hosted Supabase DB.

- [ ] **Step 4: Commit final fixes**

```bash
git status --short
git add app lib scripts package.json
git commit -m "feat: make studio operations verifiable"
```

---

## Completion Criteria

- Cockpit gives the daily operational answer: calm or attention.
- Every critical number on Agents, Automations, Analytics, Infrastructure, and Cockpit names its source.
- Missing data is displayed as missing, not simulated.
- Repair links exist for approvals, automations, and infrastructure.
- `npm run ops:coherence`, `npm run typecheck`, and `npm run build` pass.
- Browser sweep confirms connected pages do not show the previously observed fake signals.
