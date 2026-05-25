# Prospect Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship the first autonomous acquisition loop: discover prospects, score them, draft personalized outreach, store CRM state, and surface operator controls in Studio.

**Architecture:** Hermes stays the reasoning layer, but the business agent is `prospect`, not `Hermes`. The control plane remains the Next.js Studio; Supabase/PostgreSQL stores CRM and audit state; workers do the scraping and enrichment inside isolated execution; n8n handles external delivery; Qdrant stores semantic memory for prospects and conversation context.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, n8n webhooks, Ollama/Hermes reasoning, Playwright in sacrificial workers, Qdrant for memory, Gmail/Telegram/Discord integrations, existing autonomy jobs/actions/approvals.

---

### Task 1: Add the prospect CRM data model

**Files:**
- Create: `supabase/migrations/20260525_prospect_crm.sql`
- Modify: `lib/user-settings-normalization.ts`
- Modify: `lib/user-settings-normalization.test.ts`
- Modify: `lib/infra-config.ts`
- Modify: `lib/infra-config.test.ts`
- Modify: `docs/runbooks/database-migrations.md`

- [ ] **Step 1: Write the failing test**

```ts
it('normalizes prospect crm and outreach settings', () => {
  const settings = normalizeUserSettings({
    prospect_sources: null,
    prospect_outreach_email: null,
    prospect_crm_provider: null,
  })

  expect(settings.prospect_sources).toEqual([])
  expect(settings.prospect_outreach_email).toBe('')
  expect(settings.prospect_crm_provider).toBe('supabase')
})
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- --run lib/user-settings-normalization.test.ts lib/infra-config.test.ts`
Expected: FAIL because the new prospect settings do not exist yet.

- [ ] **Step 3: Add the minimal schema and normalization**

```sql
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_url text,
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_role text,
  score integer not null default 0,
  status text not null default 'new',
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Run the targeted test again**

Run: `npm test -- --run lib/user-settings-normalization.test.ts lib/infra-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/user-settings-normalization.ts lib/user-settings-normalization.test.ts lib/infra-config.ts lib/infra-config.test.ts docs/runbooks/database-migrations.md
git commit -m "feat(prospect): add CRM settings and prospect schema"
```

### Task 2: Build the prospect scoring and outreach engine

**Files:**
- Create: `lib/prospect/types.ts`
- Create: `lib/prospect/score-prospect.test.ts`
- Create: `lib/prospect/build-outreach.test.ts`
- Create: `lib/prospect/memory.test.ts`
- Create: `lib/prospect/score-prospect.ts`
- Create: `lib/prospect/build-outreach.ts`
- Create: `lib/prospect/memory.ts`
- Modify: `lib/agent-output-schemas.ts`
- Modify: `lib/agent-output-schemas.test.ts`
- Modify: `lib/model-families.ts`
- Modify: `lib/llm-client.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('scores a prospect using signal strength, fit, and urgency', () => {
  const result = scoreProspect({
    companyName: 'Acme Studio',
    source: 'upwork',
    signals: ['urgent lead', 'budget', 'technical fit'],
    fit: 'high',
    urgency: 'high',
  })

  expect(result.score).toBeGreaterThanOrEqual(80)
  expect(result.band).toBe('hot')
})
```

- [ ] **Step 2: Run the test to confirm the new module is missing**

Run: `npm test -- --run lib/prospect/score-prospect.test.ts`
Expected: FAIL until the prospect schema and scoring helpers exist.

- [ ] **Step 3: Add the minimal scoring, memory, and draft generation**

```ts
export interface ProspectScoreInput {
  companyName: string
  source: 'linkedin' | 'malt' | 'upwork' | 'indeed' | 'reddit' | 'other'
  signals: string[]
  fit: 'low' | 'medium' | 'high'
  urgency: 'low' | 'medium' | 'high'
}

export function scoreProspect(input: ProspectScoreInput) {
  const score = Math.min(
    100,
    (input.fit === 'high' ? 35 : input.fit === 'medium' ? 20 : 5) +
      (input.urgency === 'high' ? 35 : input.urgency === 'medium' ? 20 : 5) +
      Math.min(input.signals.length * 5, 20)
  )

  return { score, band: score >= 80 ? 'hot' : score >= 55 ? 'warm' : 'cold' }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --run lib/prospect/score-prospect.test.ts lib/prospect/build-outreach.test.ts lib/prospect/memory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prospect/types.ts lib/prospect/score-prospect.ts lib/prospect/build-outreach.ts lib/prospect/memory.ts lib/agent-output-schemas.ts lib/agent-output-schemas.test.ts lib/model-families.ts lib/llm-client.ts
git commit -m "feat(prospect): add scoring and Hermes outreach drafting"
```

### Task 3: Wire Prospect into autonomy execution and approvals

**Files:**
- Modify: `lib/pipeline-types.ts`
- Modify: `lib/pipeline-types.test.ts`
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`
- Create: `lib/studio-utils.test.ts`
- Modify: `app/api/studio/agents/orchestrate/route.ts`
- Modify: `app/api/studio/autonomy/jobs/route.ts`
- Create: `app/api/studio/prospects/run/route.ts`
- Create: `app/api/studio/prospects/route.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('accepts prospect as a first-class autonomous agent', () => {
  expect(AGENTS_DATA.some((agent) => agent.id === 'prospect')).toBe(true)
  expect(AGENTS_DATA.find((agent) => agent.id === 'prospect')?.name).toBe('Prospect')
})
```

- [ ] **Step 2: Run the test and confirm the chain does not know prospect yet**

Run: `npm test -- --run lib/studio-utils.test.ts lib/autonomy/run-agent-step.test.ts`
Expected: FAIL on the new prospect assertions until the agent list and runner know about `prospect`.

- [ ] **Step 3: Implement the new agent path**

```ts
case 'prospect':
  return {
    agentId: 'prospect',
    model: chosenModel,
    systemPrompt: PROSPECT_SYSTEM_PROMPT,
    outputSchema: prospectOutputSchema,
    sideEffects: ['draft_outreach', 'crm_upsert', 'approval_gate_for_send'],
  }
```

- [ ] **Step 4: Add the route that starts a prospect run**

```ts
export async function POST(req: Request) {
  // validate user
  // create autonomy_jobs row
  // enqueue prospect job
  // return { ok: true, jobId }
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- --run lib/pipeline-types.test.ts lib/autonomy/run-agent-step.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline-types.ts lib/pipeline-types.test.ts lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts app/api/studio/agents/orchestrate/route.ts app/api/studio/autonomy/jobs/route.ts app/api/studio/prospects/run/route.ts app/api/studio/prospects/route.ts
git commit -m "feat(prospect): wire prospect agent into autonomy"
```

### Task 4: Build the Studio operator surface for prospecting

**Files:**
- Create: `app/studio/prospects/page.tsx`
- Create: `scripts/smoke-prospect-agent.mjs`
- Create: `scripts/smoke-prospect-agent.test.ts`
- Modify: `app/studio/page.tsx`
- Modify: `app/studio/agents/page.tsx`
- Modify: `app/studio/settings/page.tsx`
- Modify: `lib/studio-utils.ts`
- Modify: `docs/agents.md`

- [ ] **Step 1: Write the failing test**

```ts
it('guards the prospect browser surface and run contract', () => {
  expect(source).toContain('/studio/prospects')
  expect(source).toContain('/api/studio/prospects/run')
  expect(source).toContain('hot leads')
})
```

- [ ] **Step 2: Run the UI test or smoke**

Run: `npm test -- --run scripts/smoke-prospect-agent.test.ts`
Expected: FAIL until the new surface and smoke script exist.

- [ ] **Step 3: Add the new Prospect page and navigation entry**

```tsx
export default function ProspectPage() {
  return (
    <CkShell title="Prospect">
      {/* lead queue, scores, drafts, approvals, send status, CRM state */}
    </CkShell>
  )
}
```

- [ ] **Step 4: Surface live status and settings**

Add:
- prospect source list
- approved send channels
- CRM provider selection
- queue health and recent replies

- [ ] **Step 5: Run the smoke and typecheck**

Run:
```bash
npm run typecheck
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/studio/prospects/page.tsx app/studio/page.tsx app/studio/agents/page.tsx app/studio/settings/page.tsx lib/studio-utils.ts docs/agents.md
git commit -m "feat(prospect): add operator surface"
```

### Task 5: Close the loop with runbooks and smoke tests

**Files:**
- Create: `scripts/smoke-prospect-agent.mjs`
- Create: `scripts/smoke-prospect-agent.test.ts`
- Modify: `docs/runbooks/daily-operations.md`
- Modify: `docs/runbooks/autonomy-incident.md`
- Modify: `docs/security.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing smoke test**

```ts
it('guards the prospect acquisition loop contract', () => {
  expect(source).toContain('prospect')
  expect(source).toContain('CRM')
  expect(source).toContain('approval')
})
```

- [ ] **Step 2: Run the smoke test and confirm it fails initially**

Run: `npm test -- --run scripts/smoke-prospect-agent.test.ts`
Expected: FAIL until the script exists.

- [ ] **Step 3: Implement the smoke script**

```js
// 1. fetch the Prospect page
// 2. fetch the prospect run route
// 3. verify CRM state and approval gate text are present
// 4. verify the external send path is not exposed without approval
```

- [ ] **Step 4: Run the full local validation**

Run:
```bash
npm test
npm run typecheck
npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-prospect-agent.mjs scripts/smoke-prospect-agent.test.ts docs/runbooks/daily-operations.md docs/runbooks/autonomy-incident.md docs/security.md README.md
git commit -m "feat(prospect): document and smoke-test acquisition loop"
```
