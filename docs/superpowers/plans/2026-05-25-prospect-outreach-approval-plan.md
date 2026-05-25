# Prospect Outreach Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn a successful `Prospect` run into a human-approved outreach draft, without sending any real email yet.

**Architecture:** `runAgentStep()` remains the place where Prospect writes CRM-local state into `public.prospects`. When a draft is actionable (`hot` or `warm`), it also creates an `autonomy_action` of type `send_outreach` plus a linked `human_approval`. The `/api/studio/prospects` aggregation route enriches prospects with approval state, and `/studio/prospects` becomes the operator queue for approve/reject actions.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, existing `autonomy_actions` / `human_approvals`, existing approval resolution route, Vitest.

---

### Task 1: Add prospect outreach approval data conventions

**Files:**
- Modify: `supabase/migrations/20260525_prospect_crm.sql`
- Create: `lib/prospect/approval-state.ts`
- Create: `lib/prospect/approval-state.test.ts`
- Modify: `lib/prospect/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { deriveProspectApprovalState } from './approval-state'

it('maps blocked send_outreach action + pending approval to awaiting_approval', () => {
  const state = deriveProspectApprovalState({
    action: { action_type: 'send_outreach', status: 'blocked' },
    approval: { status: 'pending' },
  })

  expect(state).toEqual({
    approvalStatus: 'awaiting_approval',
    actionable: true,
  })
})
```

- [ ] **Step 2: Run the focused test to confirm the helper does not exist yet**

Run: `npm test -- lib/prospect/approval-state.test.ts`
Expected: FAIL with module or symbol missing.

- [ ] **Step 3: Add the approval-state helper and explicit UI-facing statuses**

```ts
export type ProspectApprovalStatus =
  | 'no_approval'
  | 'awaiting_approval'
  | 'approved_to_send'
  | 'rejected'

export function deriveProspectApprovalState(input: {
  action?: { action_type?: string | null; status?: string | null } | null
  approval?: { status?: string | null } | null
}) {
  if (!input.action || input.action.action_type !== 'send_outreach') {
    return { approvalStatus: 'no_approval' as const, actionable: false }
  }
  if (input.approval?.status === 'approved') {
    return { approvalStatus: 'approved_to_send' as const, actionable: false }
  }
  if (input.approval?.status === 'rejected') {
    return { approvalStatus: 'rejected' as const, actionable: false }
  }
  return { approvalStatus: 'awaiting_approval' as const, actionable: true }
}
```

- [ ] **Step 4: Run the focused tests again**

Run: `npm test -- lib/prospect/approval-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/prospect/types.ts lib/prospect/approval-state.ts lib/prospect/approval-state.test.ts
git commit -m "feat(prospect): add outreach approval state helpers"
```

### Task 2: Create send_outreach actions during Prospect runs

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`
- Modify: `lib/autonomy/full-loop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('creates a blocked send_outreach action and pending approval for a hot prospect', async () => {
  const supabase = createFakeSupabase({
    user_settings: [
      {
        user_id: 'user-1',
        prospect_sources: ['linkedin'],
        prospect_outreach_email: 'hello@kenomi.eu',
        prospect_crm_provider: 'supabase',
      },
    ],
  })

  await runAgentStep({
    supabase,
    userId: 'user-1',
    agentId: 'prospect',
    llm: async () => ({
      content: JSON.stringify({
        company_name: 'Acme Studio',
        source: 'linkedin',
        score: 91,
        band: 'hot',
        summary: 'Need faster inbound qualification.',
        pain_points: ['manual triage'],
        outreach_subject: 'Acme Studio — qualifier les leads plus vite',
        outreach_body: 'Bonjour, je pense pouvoir réduire votre temps de tri.',
        cta: 'Partant pour un exemple concret ?',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    }),
  })

  expect(supabase.tables.autonomy_actions[0]).toMatchObject({
    action_type: 'send_outreach',
    status: 'blocked',
    risk_level: 'medium',
  })
  expect(supabase.tables.human_approvals[0]).toMatchObject({
    status: 'pending',
  })
})
```

- [ ] **Step 2: Run the focused test to confirm no approval is created yet**

Run: `npm test -- lib/autonomy/run-agent-step.test.ts`
Expected: FAIL because the prospect run only inserts `prospects`.

- [ ] **Step 3: Implement minimal action + approval creation**

```ts
if (agentId === 'prospect' && prospectInsert?.id && (prospect.band === 'hot' || prospect.band === 'warm')) {
  const existingAction = await maybeSingle<{ id?: string }>(
    supabase
      .from('autonomy_actions')
      .select('id')
      .eq('user_id', userId)
      .eq('action_type', 'send_outreach')
      .eq('status', 'blocked')
      .contains('input', { prospect_id: prospectInsert.id })
  )

  if (!existingAction?.id) {
    const action = await single<{ id?: string }>(
      supabase
        .from('autonomy_actions')
        .insert({
          user_id: userId,
          venture_id: null,
          action_type: 'send_outreach',
          risk_level: 'medium',
          status: 'blocked',
          estimated_cost_eur: 0,
          input: {
            prospect_id: prospectInsert.id,
            channel: 'email',
            company_name: prospect.company_name,
            contact_name: prospect.contact_name ?? null,
            outreach_subject: prospect.outreach_subject,
            outreach_body: prospect.outreach_body,
            source: prospect.source,
            score: prospect.score,
            band: prospect.band,
          },
          output: {},
          created_at: now().toISOString(),
          updated_at: now().toISOString(),
        })
        .select('id')
    )

    if (action?.id) {
      await supabase.from('human_approvals').insert({
        user_id: userId,
        action_id: action.id,
        status: 'pending',
        approved_by: null,
        approved_at: null,
        reason: null,
        created_at: now().toISOString(),
        updated_at: now().toISOString(),
      })
    }
  }
}
```

- [ ] **Step 4: Add duplicate-prevention and cold-prospect coverage**

Add two tests:
- `cold` prospect creates no `send_outreach` action
- rerunning the same draft with an existing blocked action does not create a duplicate

Run: `npm test -- lib/autonomy/run-agent-step.test.ts lib/autonomy/full-loop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts lib/autonomy/full-loop.test.ts
git commit -m "feat(prospect): create outreach approvals from hot leads"
```

### Task 3: Enrich the prospects API with approval state

**Files:**
- Modify: `app/api/studio/prospects/route.ts`
- Modify: `app/studio/prospects/page.tsx`
- Create: `app/api/studio/prospects/route.test.ts`

- [ ] **Step 1: Write the failing API aggregation test**

```ts
it('returns approval metadata alongside prospects', async () => {
  const payload = await getProspectsPayloadForTest({
    prospects: [{ id: 'prospect-1', user_id: 'user-1', company_name: 'Acme', source: 'linkedin', score: 88, band: 'hot', status: 'ready_to_contact', outreach_subject: 'Subject', outreach_body: 'Body', metadata: {} }],
    actions: [{ id: 'action-1', user_id: 'user-1', action_type: 'send_outreach', status: 'blocked', input: { prospect_id: 'prospect-1' } }],
    approvals: [{ id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' }],
  })

  expect(payload.prospects[0]).toMatchObject({
    approval_status: 'awaiting_approval',
    outreach_action_id: 'action-1',
    outreach_approval_id: 'approval-1',
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the route lacks approval enrichment**

Run: `npm test -- app/api/studio/prospects/route.test.ts`
Expected: FAIL until the route joins action/approval state.

- [ ] **Step 3: Extend the route query and projection**

```ts
const [prospects, settings, actions, approvals] = await Promise.all([
  supabase.from('prospects').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(100),
  supabase.from('user_settings').select('prospect_sources, prospect_outreach_email, prospect_crm_provider').eq('user_id', user!.id).maybeSingle(),
  supabase.from('autonomy_actions').select('id, action_type, status, input, created_at').eq('user_id', user!.id).eq('action_type', 'send_outreach').order('created_at', { ascending: false }).limit(200),
  supabase.from('human_approvals').select('id, action_id, status, created_at, updated_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(200),
])
```

Then derive:

```ts
return {
  ...row,
  approval_status,
  outreach_action_id: action?.id ?? null,
  outreach_approval_id: approval?.id ?? null,
}
```

- [ ] **Step 4: Update the UI model and show the derived state**

Add:
- approval status badge
- approval ids in the data model
- summary counts for `awaiting_approval` and `approved_to_send`

Run: `npm test -- app/api/studio/prospects/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/prospects/route.ts app/api/studio/prospects/route.test.ts app/studio/prospects/page.tsx
git commit -m "feat(prospect): expose outreach approval state in studio"
```

### Task 4: Add approval and rejection controls in Studio

**Files:**
- Modify: `app/studio/prospects/page.tsx`
- Modify: `app/api/studio/autonomy/jobs/route.ts`
- Create: `app/studio/prospects/page.test.tsx`

- [ ] **Step 1: Write the failing interaction test**

```tsx
it('shows approve and reject controls for pending outreach approval', async () => {
  render(<ProspectsPage />)

  expect(await screen.findByText('Awaiting approval')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the UI test to confirm controls do not exist yet**

Run: `npm test -- app/studio/prospects/page.test.tsx`
Expected: FAIL because the prospect page does not yet expose approval actions.

- [ ] **Step 3: Wire buttons to the existing autonomy approval route**

```ts
await fetch('/api/studio/autonomy/jobs', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    approvalId,
    decision: 'approved',
  }),
})
```

and

```ts
await fetch('/api/studio/autonomy/jobs', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    approvalId,
    decision: 'rejected',
  }),
})
```

- [ ] **Step 4: Refresh the prospects payload after approval resolution**

After a successful PATCH:
- refetch `/api/studio/prospects`
- refetch `/api/studio/autonomy/jobs?agent_id=prospect`
- show a toast describing `approved` or `rejected`

Run: `npm test -- app/studio/prospects/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/studio/prospects/page.tsx app/studio/prospects/page.test.tsx app/api/studio/autonomy/jobs/route.ts
git commit -m "feat(prospect): add approval controls for outreach drafts"
```

### Task 5: Verify the end-to-end ready-to-send flow

**Files:**
- Create: `scripts/smoke-prospect-approval.mjs`
- Modify: `README.md`
- Modify: `docs/runbooks/autonomy-incident.md`

- [ ] **Step 1: Write the smoke script**

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: latestProspect } = await supabase
  .from('prospects')
  .select('id, company_name, status, metadata')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

const { data: action } = await supabase
  .from('autonomy_actions')
  .select('id, action_type, status, input')
  .eq('action_type', 'send_outreach')
  .contains('input', { prospect_id: latestProspect.id })
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

console.log({ latestProspect, action })
```

- [ ] **Step 2: Run the smoke script**

Run: `node scripts/smoke-prospect-approval.mjs`
Expected: one recent prospect plus one blocked `send_outreach` action with matching `prospect_id`.

- [ ] **Step 3: Document operator behavior**

Update docs with:
- what `Awaiting approval` means
- what `Approved to send` means
- explicit note that no email is sent yet

- [ ] **Step 4: Run the final verification set**

Run:
- `npm test -- lib/autonomy/run-agent-step.test.ts lib/prospect/approval-state.test.ts app/api/studio/prospects/route.test.ts app/studio/prospects/page.test.tsx`
- `npm run build`

Expected:
- all tests PASS
- production build PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-prospect-approval.mjs README.md docs/runbooks/autonomy-incident.md
git commit -m "docs(prospect): verify ready-to-send approval flow"
```
