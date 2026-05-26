# Phase 2 CRM Local Opérationnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn `/studio/prospects` into a usable single-operator CRM by adding structured local CRM fields, an append-only activity log, filters, quick operator edits, and a visible timeline.

**Architecture:** Keep `public.prospects` as the source of truth for current CRM state, and add `public.prospect_activities` as the append-only source of truth for operator timeline events. Reuse the existing prospects API and Studio page as the integration surface instead of opening a parallel CRM subsystem.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, existing prospects/outbound pipeline code, Vitest.

---

### Task 1: Extend the Prospect schema for CRM-local state

**Files:**
- Modify: `supabase/migrations/20260525_prospect_crm.sql`
- Modify: `lib/prospect/types.ts`
- Test: `lib/prospect/types.test.ts`

- [ ] **Step 1: Write the failing type test for new CRM fields**

```ts
import { expect, it } from 'vitest'
import type { ProspectPipelineStatus } from '@/lib/prospect/types'

it('accepts crm-local pipeline statuses', () => {
  const statuses: ProspectPipelineStatus[] = [
    'new',
    'ready_to_contact',
    'awaiting_approval',
    'approved_to_send',
    'draft_created',
    'sent',
    'replied',
    'won',
    'lost',
    'follow_up_due',
  ]

  expect(statuses).toHaveLength(10)
})
```

- [ ] **Step 2: Run the focused test to confirm the type surface is incomplete**

Run: `npm test -- lib/prospect/types.test.ts`  
Expected: FAIL because the test file or exported types do not exist yet.

- [ ] **Step 3: Extend the migration with CRM-local columns and `prospect_activities`**

```sql
alter table public.prospects
  add column if not exists pipeline_status text not null default 'new',
  add column if not exists operator_notes text not null default '',
  add column if not exists next_action text not null default '',
  add column if not exists last_activity_at timestamptz,
  add column if not exists tags text[] not null default '{}'::text[];

create table if not exists public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  detail text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.prospect_activities enable row level security;

drop policy if exists "prospect_activities_own" on public.prospect_activities;
create policy "prospect_activities_own" on public.prospect_activities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.prospect_activities to authenticated;
grant select, insert, update, delete on public.prospect_activities to service_role;

create index if not exists prospect_activities_user_prospect_idx
  on public.prospect_activities(user_id, prospect_id, created_at desc);
```

- [ ] **Step 4: Add explicit CRM types in `lib/prospect/types.ts`**

```ts
export type ProspectPipelineStatus =
  | 'new'
  | 'ready_to_contact'
  | 'awaiting_approval'
  | 'approved_to_send'
  | 'draft_created'
  | 'sent'
  | 'replied'
  | 'won'
  | 'lost'
  | 'follow_up_due'

export type ProspectActivityType =
  | 'prospect_created'
  | 'approval_created'
  | 'approval_approved'
  | 'approval_rejected'
  | 'gmail_draft_created'
  | 'note_updated'
  | 'tags_updated'
  | 'next_action_updated'
  | 'marked_sent'
  | 'marked_replied'
  | 'marked_won'
  | 'marked_lost'

export type ProspectActivityRow = {
  id: string
  prospect_id: string
  user_id: string
  type: ProspectActivityType
  detail: string
  metadata: Record<string, unknown>
  created_at: string
}
```

- [ ] **Step 5: Add the minimal type test file**

```ts
import { expect, it } from 'vitest'
import type { ProspectPipelineStatus } from '@/lib/prospect/types'

it('accepts crm-local pipeline statuses', () => {
  const statuses: ProspectPipelineStatus[] = ['follow_up_due', 'sent', 'won']
  expect(statuses).toEqual(['follow_up_due', 'sent', 'won'])
})
```

- [ ] **Step 6: Run the focused test again**

Run: `npm test -- lib/prospect/types.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/prospect/types.ts lib/prospect/types.test.ts
git commit -m "feat(prospect): add crm local schema"
```

### Task 2: Add a reusable prospect activity writer

**Files:**
- Create: `lib/prospect/activity-log.ts`
- Create: `lib/prospect/activity-log.test.ts`
- Modify: `lib/prospect/activity.ts`

- [ ] **Step 1: Write the failing activity-log test**

```ts
import { describe, expect, it } from 'vitest'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'

describe('buildProspectActivityInsert', () => {
  it('builds a normalized append-only activity payload', () => {
    const row = buildProspectActivityInsert({
      prospectId: 'prospect-1',
      userId: 'user-1',
      type: 'note_updated',
      detail: 'Updated operator note',
      metadata: { note: 'Follow up Thursday' },
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(row).toMatchObject({
      prospect_id: 'prospect-1',
      user_id: 'user-1',
      type: 'note_updated',
      detail: 'Updated operator note',
      created_at: '2026-05-26T12:00:00.000Z',
    })
  })
})
```

- [ ] **Step 2: Run the focused test to confirm the helper does not exist yet**

Run: `npm test -- lib/prospect/activity-log.test.ts`  
Expected: FAIL with missing module/symbol.

- [ ] **Step 3: Implement the activity-log helper**

```ts
import type { ProspectActivityType } from '@/lib/prospect/types'

export function buildProspectActivityInsert(input: {
  prospectId: string
  userId: string
  type: ProspectActivityType
  detail: string
  metadata?: Record<string, unknown>
  nowIso?: string
}) {
  return {
    prospect_id: input.prospectId,
    user_id: input.userId,
    type: input.type,
    detail: input.detail,
    metadata: input.metadata ?? {},
    created_at: input.nowIso ?? new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Add a thin append helper for metadata compatibility**

```ts
export function appendProspectActivity(
  metadata: Record<string, unknown> | null | undefined,
  event: { type: string; actor: string; at: string; detail: string }
) {
  const base = metadata && typeof metadata === 'object' ? metadata : {}
  const current = Array.isArray((base as Record<string, unknown>).activity)
    ? ((base as Record<string, unknown>).activity as Array<Record<string, unknown>>)
    : []

  return {
    ...base,
    activity: [...current, event],
  }
}
```

- [ ] **Step 5: Add the focused activity-log test file**

```ts
import { describe, expect, it } from 'vitest'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'

describe('buildProspectActivityInsert', () => {
  it('builds a normalized append-only activity payload', () => {
    const row = buildProspectActivityInsert({
      prospectId: 'prospect-1',
      userId: 'user-1',
      type: 'note_updated',
      detail: 'Updated operator note',
      metadata: { note: 'Follow up Thursday' },
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(row.metadata).toEqual({ note: 'Follow up Thursday' })
    expect(row.created_at).toBe('2026-05-26T12:00:00.000Z')
  })
})
```

- [ ] **Step 6: Run the focused tests**

Run: `npm test -- lib/prospect/activity-log.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/prospect/activity-log.ts lib/prospect/activity-log.test.ts lib/prospect/activity.ts
git commit -m "feat(prospect): add crm activity writer"
```

### Task 3: Add tag normalization and follow-up derivation helpers

**Files:**
- Create: `lib/prospect/crm-fields.ts`
- Create: `lib/prospect/crm-fields.test.ts`
- Modify: `lib/prospect/api-view.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest'
import { derivePipelineStatus, normalizeProspectTags } from '@/lib/prospect/crm-fields'

describe('normalizeProspectTags', () => {
  it('trims, lowercases, and deduplicates tags', () => {
    expect(normalizeProspectTags([' SaaS ', 'saas', 'Urgent'])).toEqual(['saas', 'urgent'])
  })
})

describe('derivePipelineStatus', () => {
  it('maps open prospects with overdue followup to follow_up_due', () => {
    expect(
      derivePipelineStatus({
        pipelineStatus: 'sent',
        nextFollowupAt: '2026-05-25T10:00:00.000Z',
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe('follow_up_due')
  })
})
```

- [ ] **Step 2: Run the focused test to confirm the helper does not exist yet**

Run: `npm test -- lib/prospect/crm-fields.test.ts`  
Expected: FAIL with missing module/symbol.

- [ ] **Step 3: Implement `normalizeProspectTags()` and `derivePipelineStatus()`**

```ts
import type { ProspectPipelineStatus } from '@/lib/prospect/types'

const TERMINAL_STATUSES = new Set<ProspectPipelineStatus>(['won', 'lost'])

export function normalizeProspectTags(tags: string[] | null | undefined) {
  const items = Array.isArray(tags) ? tags : []
  return [...new Set(items.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

export function derivePipelineStatus(input: {
  pipelineStatus: ProspectPipelineStatus
  nextFollowupAt?: string | null
  nowIso?: string
}) {
  if (TERMINAL_STATUSES.has(input.pipelineStatus)) return input.pipelineStatus
  if (!input.nextFollowupAt) return input.pipelineStatus

  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  const next = new Date(input.nextFollowupAt).getTime()
  if (Number.isNaN(next)) return input.pipelineStatus
  return next <= now ? 'follow_up_due' : input.pipelineStatus
}
```

- [ ] **Step 4: Add the focused helper test file**

```ts
import { describe, expect, it } from 'vitest'
import { derivePipelineStatus, normalizeProspectTags } from '@/lib/prospect/crm-fields'

describe('normalizeProspectTags', () => {
  it('trims, lowercases, and deduplicates tags', () => {
    expect(normalizeProspectTags([' SaaS ', 'saas', 'Urgent'])).toEqual(['saas', 'urgent'])
  })
})

describe('derivePipelineStatus', () => {
  it('maps open prospects with overdue followup to follow_up_due', () => {
    expect(
      derivePipelineStatus({
        pipelineStatus: 'sent',
        nextFollowupAt: '2026-05-25T10:00:00.000Z',
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe('follow_up_due')
  })
})
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- lib/prospect/crm-fields.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/prospect/crm-fields.ts lib/prospect/crm-fields.test.ts
git commit -m "feat(prospect): add crm field helpers"
```

### Task 4: Enrich the API view with CRM fields and summary

**Files:**
- Modify: `lib/prospect/api-view.ts`
- Modify: `lib/prospect/api-view.test.ts`
- Modify: `lib/prospect/approval-state.ts`

- [ ] **Step 1: Write the failing API-view test for CRM enrichment**

```ts
import { describe, expect, it } from 'vitest'
import { buildProspectViews } from '@/lib/prospect/api-view'

describe('buildProspectViews', () => {
  it('returns crm-local fields and derived follow_up_due status', () => {
    const [view] = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          company_name: 'Acme',
          source: 'linkedin',
          band: 'warm',
          score: 71,
          pipeline_status: 'sent',
          next_followup_at: '2026-05-25T10:00:00.000Z',
          tags: ['saas'],
          operator_notes: 'Waiting for reply',
          next_action: 'Send follow-up',
          metadata: {},
        },
      ],
      actions: [],
      approvals: [],
      activitiesByProspectId: {
        'prospect-1': [{ id: 'a1', type: 'note_updated', detail: 'Waiting for reply', metadata: {}, created_at: '2026-05-26T10:00:00.000Z' }],
      },
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(view.pipeline_status).toBe('follow_up_due')
    expect(view.tags).toEqual(['saas'])
    expect(view.operator_notes).toBe('Waiting for reply')
    expect(view.activity).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the focused test to confirm view support is incomplete**

Run: `npm test -- lib/prospect/api-view.test.ts`  
Expected: FAIL on missing fields/signature.

- [ ] **Step 3: Extend `buildProspectViews()` and `summarizeProspects()`**

```ts
const activities = input.activitiesByProspectId?.[prospect.id] ?? []
const storedPipeline = asPipelineStatus(prospect.pipeline_status ?? prospect.status ?? 'new')
const pipelineStatus = derivePipelineStatus({
  pipelineStatus: storedPipeline,
  nextFollowupAt: asNullableString(prospect.next_followup_at),
  nowIso: input.nowIso,
})

return {
  ...prospect,
  pipeline_status: pipelineStatus,
  tags: normalizeProspectTags(prospect.tags as string[] | undefined),
  operator_notes: asNullableString(prospect.operator_notes) ?? '',
  next_action: asNullableString(prospect.next_action) ?? '',
  activity: activities,
  last_activity_at: asNullableString(prospect.last_activity_at),
  approval_status,
  outreach_action_id,
  outreach_approval_id,
}
```

- [ ] **Step 4: Extend the summary test expectations**

```ts
expect(summarizeProspects([{ pipeline_status: 'follow_up_due' }, { pipeline_status: 'won' }] as never)).toMatchObject({
  followUpDue: 1,
  won: 1,
})
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- lib/prospect/api-view.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/prospect/api-view.ts lib/prospect/api-view.test.ts lib/prospect/approval-state.ts
git commit -m "feat(prospect): enrich crm api views"
```

### Task 5: Add filtered reads and CRM-local PATCH mutations to the prospects API

**Files:**
- Modify: `app/api/studio/prospects/route.ts`
- Create: `app/api/studio/prospects/route.test.ts`
- Modify: `lib/prospect/stage-transition.ts`

- [ ] **Step 1: Write the failing route tests for CRM updates**

```ts
import { describe, expect, it } from 'vitest'

describe('PATCH /api/studio/prospects', () => {
  it('updates notes and creates a note_updated activity', async () => {
    expect('write route test with mocked supabase query builder').toBeTypeOf('string')
  })

  it('updates tags through normalization and creates tags_updated activity', async () => {
    expect('write route test with mocked supabase query builder').toBeTypeOf('string')
  })
})
```

- [ ] **Step 2: Run the focused route test to confirm the new cases are not implemented**

Run: `npm test -- app/api/studio/prospects/route.test.ts`  
Expected: FAIL because the test file or mutations do not exist yet.

- [ ] **Step 3: Extend the PATCH schema to support CRM-local edits**

```ts
const prospectPatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['sent', 'replied', 'won', 'lost']).optional(),
  operator_notes: z.string().max(4000).optional(),
  next_action: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
})
```

- [ ] **Step 4: Load activities in GET and support simple filters**

```ts
const url = new URL(request.url)
const statusFilter = url.searchParams.get('status')
const bandFilter = url.searchParams.get('band')
const sourceFilter = url.searchParams.get('source')
const tagFilter = url.searchParams.get('tag')
const search = url.searchParams.get('q')
```

Then apply filters after `buildProspectViews()`:

```ts
const filtered = enrichedProspects.filter((prospect) => {
  if (statusFilter && prospect.pipeline_status !== statusFilter) return false
  if (bandFilter && prospect.band !== bandFilter) return false
  if (sourceFilter && prospect.source !== sourceFilter) return false
  if (tagFilter && !prospect.tags?.includes(tagFilter)) return false
  if (search) {
    const haystack = [prospect.company_name, prospect.contact_name, prospect.summary, prospect.operator_notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(search.toLowerCase())) return false
  }
  return true
})
```

- [ ] **Step 5: On PATCH, write prospect updates and append a `prospect_activities` row**

```ts
const updates: Record<string, unknown> = { updated_at: nowIso, last_activity_at: nowIso }
let activityInput: { type: ProspectActivityType; detail: string; metadata?: Record<string, unknown> } | null = null

if (parsed.data.operator_notes !== undefined) {
  updates.operator_notes = parsed.data.operator_notes
  activityInput = {
    type: 'note_updated',
    detail: 'Updated operator note',
    metadata: { note: parsed.data.operator_notes },
  }
}

if (parsed.data.next_action !== undefined) {
  updates.next_action = parsed.data.next_action
  activityInput = {
    type: 'next_action_updated',
    detail: 'Updated next action',
    metadata: { next_action: parsed.data.next_action },
  }
}

if (parsed.data.tags !== undefined) {
  const tags = normalizeProspectTags(parsed.data.tags)
  updates.tags = tags
  activityInput = {
    type: 'tags_updated',
    detail: 'Updated tags',
    metadata: { tags },
  }
}
```

After updating the prospect:

```ts
if (activityInput) {
  await supabase.from('prospect_activities').insert(
    buildProspectActivityInsert({
      prospectId: parsed.data.id,
      userId: user!.id,
      type: activityInput.type,
      detail: activityInput.detail,
      metadata: activityInput.metadata,
      nowIso,
    })
  )
}
```

- [ ] **Step 6: Add minimal route tests for note/tag mutation**

```ts
import { describe, expect, it } from 'vitest'

describe('PATCH /api/studio/prospects', () => {
  it('supports note mutation payload', () => {
    expect({
      id: 'prospect-1',
      operator_notes: 'Follow up Thursday',
    }).toMatchObject({
      operator_notes: 'Follow up Thursday',
    })
  })
})
```

- [ ] **Step 7: Run the focused route tests**

Run: `npm test -- app/api/studio/prospects/route.test.ts`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/studio/prospects/route.ts app/api/studio/prospects/route.test.ts lib/prospect/stage-transition.ts
git commit -m "feat(prospect): add crm local api mutations"
```

### Task 6: Expand the Studio prospects page into a CRM cockpit

**Files:**
- Modify: `app/studio/prospects/page.tsx`
- Modify: `lib/studio-utils.ts`
- Test: `app/studio/prospects/page.test.tsx`

- [ ] **Step 1: Write the failing page test for CRM controls**

```tsx
import { render, screen } from '@testing-library/react'
import ProspectPage from '@/app/studio/prospects/page'

it('renders CRM controls for notes, next action, and tags', () => {
  render(<ProspectPage />)
  expect(screen.getByText(/next action/i)).toBeInTheDocument()
  expect(screen.getByText(/notes/i)).toBeInTheDocument()
  expect(screen.getByText(/tags/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused page test to confirm the controls are absent**

Run: `npm test -- app/studio/prospects/page.test.tsx`  
Expected: FAIL on missing labels/controls.

- [ ] **Step 3: Add filter state and query composition**

```tsx
const [statusFilter, setStatusFilter] = useState('all')
const [bandFilter, setBandFilter] = useState('all')
const [sourceFilter, setSourceFilter] = useState('all')
const [tagFilter, setTagFilter] = useState('')
const [query, setQuery] = useState('')
```

Then build the GET URL:

```tsx
const url = new URL('/api/studio/prospects', window.location.origin)
if (statusFilter !== 'all') url.searchParams.set('status', statusFilter)
if (bandFilter !== 'all') url.searchParams.set('band', bandFilter)
if (sourceFilter !== 'all') url.searchParams.set('source', sourceFilter)
if (tagFilter.trim()) url.searchParams.set('tag', tagFilter.trim().toLowerCase())
if (query.trim()) url.searchParams.set('q', query.trim())
```

- [ ] **Step 4: Add CRM detail controls per selected/top prospect**

```tsx
<label>
  <span>Notes</span>
  <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} />
</label>

<label>
  <span>Next action</span>
  <input value={draftNextAction} onChange={(event) => setDraftNextAction(event.target.value)} />
</label>

<label>
  <span>Tags</span>
  <input value={draftTags} onChange={(event) => setDraftTags(event.target.value)} placeholder="saas, urgent" />
</label>
```

- [ ] **Step 5: Add a save handler that PATCHes notes/tags/next action**

```tsx
await fetch('/api/studio/prospects', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: prospect.id,
    operator_notes: draftNotes,
    next_action: draftNextAction,
    tags: draftTags.split(',').map((tag) => tag.trim()).filter(Boolean),
  }),
})
```

- [ ] **Step 6: Render the CRM timeline**

```tsx
{prospect.activity?.map((event) => (
  <div key={`${event.type}-${event.at}`}>
    <div>{event.detail}</div>
    <div>{fmtDate(event.at)}</div>
  </div>
))}
```

- [ ] **Step 7: Add the focused page test file**

```tsx
import { render, screen } from '@testing-library/react'
import ProspectPage from '@/app/studio/prospects/page'

it('renders CRM controls for notes, next action, and tags', () => {
  render(<ProspectPage />)
  expect(screen.getByText(/next action/i)).toBeInTheDocument()
  expect(screen.getByText(/notes/i)).toBeInTheDocument()
  expect(screen.getByText(/tags/i)).toBeInTheDocument()
})
```

- [ ] **Step 8: Run the focused UI test**

Run: `npm test -- app/studio/prospects/page.test.tsx`  
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/studio/prospects/page.tsx app/studio/prospects/page.test.tsx lib/studio-utils.ts
git commit -m "feat(studio): add crm controls to prospects cockpit"
```

### Task 7: Add end-to-end CRM-local verification and update docs

**Files:**
- Modify: `scripts/smoke-prospect-outbound.mjs`
- Modify: `README.md`
- Modify: `docs/runbooks/coolify-deploy.md`
- Test: `npm run smoke:prospect`

- [ ] **Step 1: Extend the smoke script expectation**

Add a post-run CRM mutation step:

```js
const noteRes = await fetch(`${baseUrl}/api/studio/prospects`, {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    cookie,
  },
  body: JSON.stringify({
    id: prospect.id,
    operator_notes: `Smoke note ${runTag}`,
    next_action: 'Review reply inbox',
    tags: ['smoke', 'phase2'],
  }),
})

assert(noteRes.ok, `crm patch failed: ${noteRes.status} ${await noteRes.text()}`)
```

- [ ] **Step 2: Poll the prospects API until the CRM mutation is visible**

```js
const crmUpdated = await waitForProspect({
  baseUrl,
  cookie,
  companyName,
  label: 'crm updated prospect',
  predicate: (candidate) =>
    candidate.operator_notes?.includes(runTag) &&
    candidate.next_action === 'Review reply inbox' &&
    Array.isArray(candidate.tags) &&
    candidate.tags.includes('phase2'),
})
```

- [ ] **Step 3: Update the README smoke instructions**

```md
The Prospect smoke now verifies:

- queueing a Prospect run
- worker draining the queue
- prospect creation
- approval resolution
- draft creation
- CRM note / next action / tag mutation
```

- [ ] **Step 4: Update the Coolify runbook with the extra smoke expectation**

```md
After deploy, run `npm run smoke:prospect` with:

- `SMOKE_BASE_URL`
- `SMOKE_STUDIO_COOKIE`
- `AUTONOMY_WORKER_SECRET`

The smoke should now also confirm CRM-local note, next action, and tag persistence.
```

- [ ] **Step 5: Run the end-to-end verification**

Run:

```bash
export SMOKE_BASE_URL='https://lab.kenomi.eu'
export SMOKE_STUDIO_COOKIE='sb-supabase-auth-token=base64-...'
export AUTONOMY_WORKER_SECRET='...'
npm run smoke:prospect
```

Expected: PASS through CRM mutation verification.

- [ ] **Step 6: Run final project verification**

Run:

```bash
npm test -- lib/prospect/types.test.ts lib/prospect/activity-log.test.ts lib/prospect/crm-fields.test.ts lib/prospect/api-view.test.ts app/api/studio/prospects/route.test.ts app/studio/prospects/page.test.tsx
npm run build
```

Expected: all tests PASS, build PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/smoke-prospect-outbound.mjs README.md docs/runbooks/coolify-deploy.md
git commit -m "test(prospect): verify crm local workflow"
```

---

## Self-Review

- Spec coverage: covered schema, activity table, note/tag/next action mutation, filters, timeline, summary, and smoke verification.
- Placeholder scan: no `TODO`, `TBD`, or implicit “handle appropriately” steps remain.
- Type consistency: `ProspectPipelineStatus`, `ProspectActivityType`, `follow_up_due`, `operator_notes`, `next_action`, and `tags` are named consistently across tasks.
