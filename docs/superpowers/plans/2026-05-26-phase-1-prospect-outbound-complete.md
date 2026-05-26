# Phase 1 Prospect Outbound Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the first commercial loop by turning an approved Prospect draft into a Gmail-ready draft, then tracking it through a minimal outbound pipeline.

**Architecture:** Keep `public.prospects` as the CRM-local source of truth for prospect state, and keep `autonomy_actions` / `human_approvals` as the approval source of truth. Reuse the existing approval executor to materialize a Gmail-facing draft artifact only after approval, then expose state transitions and activity history through `/api/studio/prospects` and `/studio/prospects`.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, existing `autonomy_actions` / `human_approvals`, existing `campaign_drafts` patterns, Vitest.

---

### Task 1: Add outbound pipeline states and activity model

**Files:**
- Modify: `supabase/migrations/20260525_prospect_crm.sql`
- Modify: `lib/prospect/types.ts`
- Create: `lib/prospect/activity.ts`
- Create: `lib/prospect/activity.test.ts`

- [ ] **Step 1: Write the failing activity-state test**

```ts
import { appendProspectActivity } from './activity'

it('appends an approval-created event to prospect metadata activity', () => {
  const next = appendProspectActivity(
    { activity: [] },
    {
      type: 'approval_created',
      actor: 'system',
      at: '2026-05-26T10:00:00.000Z',
      detail: 'send_outreach approval created',
    }
  )

  expect(next.activity).toEqual([
    {
      type: 'approval_created',
      actor: 'system',
      at: '2026-05-26T10:00:00.000Z',
      detail: 'send_outreach approval created',
    },
  ])
})
```

- [ ] **Step 2: Run the focused test to confirm the helper does not exist yet**

Run: `npm test -- lib/prospect/activity.test.ts`
Expected: FAIL with missing module/symbol.

- [ ] **Step 3: Add explicit prospect pipeline types and activity helper**

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

export type ProspectActivityEvent = {
  type:
    | 'prospect_created'
    | 'approval_created'
    | 'approval_approved'
    | 'approval_rejected'
    | 'gmail_draft_created'
    | 'marked_sent'
    | 'marked_replied'
    | 'marked_won'
    | 'marked_lost'
  actor: 'system' | 'operator'
  at: string
  detail: string
}

export function appendProspectActivity(
  metadata: Record<string, unknown> | null | undefined,
  event: ProspectActivityEvent
) {
  const base = metadata && typeof metadata === 'object' ? metadata : {}
  const current = Array.isArray((base as Record<string, unknown>).activity)
    ? ((base as Record<string, unknown>).activity as ProspectActivityEvent[])
    : []
  return {
    ...base,
    activity: [...current, event],
  }
}
```

- [ ] **Step 4: Extend the migration with outbound pipeline columns**

```sql
alter table public.prospects
  add column if not exists draft_provider text,
  add column if not exists draft_external_id text,
  add column if not exists draft_created_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists owner_user_id uuid;
```

- [ ] **Step 5: Run the focused tests again**

Run: `npm test -- lib/prospect/activity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/prospect/types.ts lib/prospect/activity.ts lib/prospect/activity.test.ts
git commit -m "feat(prospect): add outbound activity model"
```

### Task 2: Materialize Gmail drafts after approval

**Files:**
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `lib/autonomy/approval-executor.test.ts`
- Create: `lib/prospect/gmail-draft.ts`
- Create: `lib/prospect/gmail-draft.test.ts`

- [ ] **Step 1: Write the failing Gmail draft builder test**

```ts
import { buildGmailDraftPayload } from '@/lib/prospect/gmail-draft'

it('builds a Gmail-ready draft payload from send_outreach action input', () => {
  const payload = buildGmailDraftPayload({
    to: 'marie@acme.test',
    subject: 'Acme Studio — qualifier plus vite',
    body: 'Bonjour Marie...',
  })

  expect(payload).toMatchObject({
    channel: 'email',
    provider: 'gmail',
    status: 'draft',
  })
  expect(String(payload.content)).toContain('Bonjour Marie')
})
```

- [ ] **Step 2: Run the focused test to confirm no Gmail draft helper exists yet**

Run: `npm test -- lib/prospect/gmail-draft.test.ts`
Expected: FAIL with missing module/symbol.

- [ ] **Step 3: Add a Gmail draft payload builder modeled after `campaign_drafts`**

```ts
export function buildGmailDraftPayload(input: {
  prospectId: string
  companyName: string
  contactName?: string | null
  to?: string | null
  subject: string
  body: string
}) {
  return {
    channel: 'email',
    provider: 'gmail',
    status: 'draft',
    content: input.body,
    metadata: {
      title: input.subject,
      to: input.to ?? '',
      contact_name: input.contactName ?? '',
      prospect_id: input.prospectId,
      company_name: input.companyName,
      asset_kind: 'outreach_email',
    },
  }
}
```

- [ ] **Step 4: Write the failing approval executor test**

```ts
it('approving send_outreach creates a Gmail draft and marks the prospect approved_to_send', async () => {
  // seed autonomy_actions + human_approvals + prospects
  // resolveHumanApproval(...decision:'approved')
  // assert campaign_drafts insert and prospect update
})
```

- [ ] **Step 5: Implement `send_outreach` handling in `resolveHumanApproval()`**

```ts
if (action.action_type === 'send_outreach') {
  const draftId = randomUUID()
  const draft = buildGmailDraftPayload({
    prospectId,
    companyName,
    contactName,
    to: contactEmail,
    subject,
    body,
  })

  await update(
    input.supabase.from('campaign_drafts').insert({
      id: draftId,
      user_id: input.userId,
      venture_id: null,
      channel: draft.channel,
      content: draft.content,
      status: 'draft',
      metadata: {
        ...draft.metadata,
        provider: 'gmail',
      },
      created_at: nowIso,
      updated_at: nowIso,
    })
  )

  await update(
    input.supabase
      .from('prospects')
      .update({
        status: 'approved_to_send',
        draft_provider: 'gmail',
        draft_external_id: draftId,
        draft_created_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', prospectId)
      .eq('user_id', input.userId)
  )

  executed = false
  actionStatus = 'completed'
  output = {
    executed: false,
    handler: 'send_outreach',
    draft_id: draftId,
    provider: 'gmail',
  }
}
```

- [ ] **Step 6: Append approval and draft-created activity events**

```ts
metadata: appendProspectActivity(
  appendProspectActivity(existingMetadata, {
    type: 'approval_approved',
    actor: 'operator',
    at: nowIso,
    detail: 'Outreach approved',
  }),
  {
    type: 'gmail_draft_created',
    actor: 'system',
    at: nowIso,
    detail: `Gmail draft ${draftId} created`,
  }
)
```

- [ ] **Step 7: Run focused tests**

Run: `npm test -- lib/prospect/gmail-draft.test.ts lib/autonomy/approval-executor.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/prospect/gmail-draft.ts lib/prospect/gmail-draft.test.ts lib/autonomy/approval-executor.ts lib/autonomy/approval-executor.test.ts
git commit -m "feat(prospect): create gmail drafts after outreach approval"
```

### Task 3: Expose outbound pipeline state through the prospects API

**Files:**
- Modify: `app/api/studio/prospects/route.ts`
- Modify: `lib/prospect/api-view.ts`
- Modify: `lib/prospect/api-view.test.ts`

- [ ] **Step 1: Write the failing pipeline aggregation test**

```ts
it('maps an approved outreach approval plus gmail draft into approved_to_send state', () => {
  const prospects = buildProspectViews({
    prospects: [
      {
        id: 'prospect-1',
        status: 'approved_to_send',
        draft_provider: 'gmail',
        draft_external_id: 'draft-1',
        metadata: { activity: [] },
      },
    ],
    actions: [],
    approvals: [],
  })

  expect(prospects[0]).toMatchObject({
    pipeline_status: 'approved_to_send',
    draft_provider: 'gmail',
    draft_external_id: 'draft-1',
  })
})
```

- [ ] **Step 2: Run the focused test to confirm the view model lacks outbound pipeline state**

Run: `npm test -- lib/prospect/api-view.test.ts`
Expected: FAIL on missing fields.

- [ ] **Step 3: Extend the view model with outbound pipeline fields**

```ts
export interface ProspectRecordView extends ProspectRecordRow {
  pipeline_status: ProspectPipelineStatus
  approval_status: ProspectApprovalStatus
  draft_provider: string | null
  draft_external_id: string | null
  activity: ProspectActivityEvent[]
}
```

- [ ] **Step 4: Normalize pipeline state in `buildProspectViews()`**

```ts
const pipelineStatus =
  row.status === 'approved_to_send' && typeof row.draft_external_id === 'string'
    ? 'draft_created'
    : (row.status as ProspectPipelineStatus)
```

- [ ] **Step 5: Extend `/api/studio/prospects` summary payload**

```ts
summary: {
  total: prospectRows.length,
  hot,
  warm,
  cold,
  readyToContact,
  dueFollowups,
  awaitingApproval,
  approvedToSend,
  draftCreated,
  sent,
  replied,
}
```

- [ ] **Step 6: Run focused tests**

Run: `npm test -- lib/prospect/api-view.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/studio/prospects/route.ts lib/prospect/api-view.ts lib/prospect/api-view.test.ts
git commit -m "feat(prospect): expose outbound pipeline state"
```

### Task 4: Upgrade `/studio/prospects` into an operator pipeline

**Files:**
- Modify: `app/studio/prospects/page.tsx`
- Test: `npm run build`

- [ ] **Step 1: Add outbound summary cards**

```tsx
{[
  { label: 'Awaiting', value: summary.awaitingApproval, color: amber },
  { label: 'Drafted', value: summary.draftCreated, color: cyan },
  { label: 'Sent', value: summary.sent, color: emerald },
  { label: 'Replied', value: summary.replied, color: accent },
]}
```

- [ ] **Step 2: Add operator actions for post-approval transitions**

```tsx
async function updateProspectStage(prospectId: string, status: 'sent' | 'replied' | 'won' | 'lost') {
  const res = await fetch('/api/studio/prospects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: prospectId, status }),
  })
  // reload + toast
}
```

- [ ] **Step 3: Show Gmail draft linkage and timeline**

```tsx
<Chip label={prospect.draft_provider ? `draft ${prospect.draft_provider}` : 'no draft'} tone="cold" />
{prospect.activity?.slice(-4).map((event) => (
  <div key={`${event.type}:${event.at}`}>{event.at} · {event.detail}</div>
))}
```

- [ ] **Step 4: Gate buttons by pipeline state**

```tsx
{prospect.pipeline_status === 'draft_created' && (
  <button onClick={() => void updateProspectStage(prospect.id, 'sent')}>Mark sent</button>
)}
{prospect.pipeline_status === 'sent' && (
  <>
    <button onClick={() => void updateProspectStage(prospect.id, 'replied')}>Mark replied</button>
    <button onClick={() => void updateProspectStage(prospect.id, 'lost')}>Mark lost</button>
  </>
)}
{prospect.pipeline_status === 'replied' && (
  <button onClick={() => void updateProspectStage(prospect.id, 'won')}>Mark won</button>
)}
```

- [ ] **Step 5: Run build verification**

Run: `npm run build`
Expected: PASS with `/studio/prospects` rendering cleanly.

- [ ] **Step 6: Commit**

```bash
git add app/studio/prospects/page.tsx
git commit -m "feat(prospect): add outbound operator pipeline view"
```

### Task 5: Support prospect stage updates in the API

**Files:**
- Modify: `app/api/studio/prospects/route.ts`
- Create: `app/api/studio/prospects/route.test.ts`

- [ ] **Step 1: Write the failing status-transition test**

```ts
it('updates a prospect to sent and stamps last_contacted_at', async () => {
  // seed prospect
  // POST with { id, status: 'sent' }
  // assert update row + metadata activity event
})
```

- [ ] **Step 2: Run the focused test to confirm transitions are not implemented**

Run: `npm test -- app/api/studio/prospects/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement safe status transitions**

```ts
const stageUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['sent', 'replied', 'won', 'lost']),
})
```

```ts
const patch =
  parsed.data.status === 'sent'
    ? { status: 'sent', last_contacted_at: nowIso }
    : parsed.data.status === 'replied'
      ? { status: 'replied' }
      : parsed.data.status === 'won'
        ? { status: 'won', closed_at: nowIso }
        : { status: 'lost', closed_at: nowIso }
```

- [ ] **Step 4: Append activity on each stage transition**

```ts
metadata: appendProspectActivity(existingMetadata, {
  type: parsed.data.status === 'sent' ? 'marked_sent' : parsed.data.status === 'replied' ? 'marked_replied' : parsed.data.status === 'won' ? 'marked_won' : 'marked_lost',
  actor: 'operator',
  at: nowIso,
  detail: `Prospect marked ${parsed.data.status}`,
})
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- app/api/studio/prospects/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/studio/prospects/route.ts app/api/studio/prospects/route.test.ts
git commit -m "feat(prospect): support outbound stage transitions"
```

### Task 6: Verify the full Phase 1 loop

**Files:**
- Modify: `scripts/smoke-app.mjs`
- Create: `scripts/smoke-prospect-outbound.mjs`
- Modify: `README.md`
- Modify: `docs/runbooks/coolify-deploy.md`

- [ ] **Step 1: Add a smoke script for the full Prospect outbound loop**

```js
// create prospect
// approve outreach
// assert gmail draft created
// mark sent
// fetch prospects summary and assert counts
```

- [ ] **Step 2: Run the focused smoke script locally against the deployed stack**

Run: `node scripts/smoke-prospect-outbound.mjs`
Expected: PASS with prospect approved, draft created, status sent.

- [ ] **Step 3: Update docs with required env and operator flow**

```md
- `HERMES_AGENT_URL`
- `HERMES_AGENT_API_KEY`
- Gmail draft provider flow (human approval only)
- Prospect operator flow: approve -> draft -> sent -> replied -> won/lost
```

- [ ] **Step 4: Run final verification**

Run:
```bash
npm test -- lib/prospect/activity.test.ts lib/prospect/gmail-draft.test.ts lib/prospect/api-view.test.ts lib/autonomy/approval-executor.test.ts app/api/studio/prospects/route.test.ts
npm run typecheck
npm run build
node scripts/smoke-prospect-outbound.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-prospect-outbound.mjs scripts/smoke-app.mjs README.md docs/runbooks/coolify-deploy.md
git commit -m "docs(prospect): verify outbound approval-to-draft loop"
```

