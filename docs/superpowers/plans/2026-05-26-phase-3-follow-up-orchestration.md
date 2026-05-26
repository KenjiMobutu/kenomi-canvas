# Phase 3 Follow-Up Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add follow-up sequencing for sent prospects so the first follow-up requires approval, later follow-ups enter `follow_up_due`, and operators can manage the sequence from `/studio/prospects`.

**Architecture:** Extend `public.prospects` with follow-up sequence fields and reuse `campaign_drafts`, `autonomy_actions`, `human_approvals`, and `prospect_activities` instead of building a separate workflow subsystem. Keep follow-up generation in focused Prospect helpers, trigger it from the existing worker/API surfaces, and materialize operator actions through the current prospects route and Studio prospects page.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgREST, existing autonomy worker routes, local Gmail draft materialization, repo smoke script.

---

### Task 1: Persist follow-up sequence state

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260525_prospect_crm.sql`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/types.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/types.test.ts`

- [ ] Add `follow_up_count`, `last_outreach_kind`, `last_follow_up_generated_at`, and `follow_up_version` to the cumulative Prospect migration with `ADD COLUMN IF NOT EXISTS` backfills.
- [ ] Extend `ProspectPipelineStatus` and activity event unions to cover `follow_up_1`, `follow_up_2`, `follow_up_3` tracking and follow-up activity entries.
- [ ] Add or update type tests so the new pipeline and activity literals compile and stay stable.

### Task 2: Add follow-up orchestration helpers

**Files:**
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/follow-up.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/gmail-draft.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/crm-fields.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/follow-up.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/crm-fields.test.ts`

- [ ] Write helper tests that pin the J+2 / J+5 / J+10 cadence, terminal-state stop conditions, `follow_up_due` derivation, and regeneration version bumps.
- [ ] Implement helpers for:
  - deciding the next follow-up kind from the current prospect row;
  - calculating the next follow-up due date after `sent` and after each follow-up send;
  - generating a concise follow-up draft from existing prospect context;
  - deciding whether a due follow-up needs approval (`follow_up_1`) or direct operator queueing (`follow_up_2`, `follow_up_3`).
- [ ] Extend Gmail draft payload metadata so follow-up drafts carry `outreach_kind`, `follow_up_count`, and `follow_up_version`.

### Task 3: Materialize follow-ups through runtime and approvals

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/approval-executor.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/activity-log.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/approval-state.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/approval-executor.test.ts`

- [ ] Add a focused runtime path that scans due prospects, generates the current follow-up draft, updates the prospect row, appends `prospect_activities`, and creates a `send_follow_up` approval only for `follow_up_1`.
- [ ] Reuse `campaign_drafts` for follow-up drafts; for approved first follow-ups, materialize the Gmail draft and update the prospect row the same way initial outreach does, with follow-up-specific metadata and activities.
- [ ] Generalize approval-state handling so Prospect views can reason about both `send_outreach` and `send_follow_up` actions without losing the existing initial-outreach behavior.
- [ ] Add runtime and executor tests that cover:
  - due `sent` prospect -> `follow_up_1` draft + approval;
  - approved `follow_up_1` -> Gmail draft created;
  - rejected `follow_up_1` -> rejected activity only;
  - `follow_up_2` and `follow_up_3` -> no approval.

### Task 4: Expose follow-up actions in the prospects API

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/prospects/route.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/api-view.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/stage-transition.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/api-view.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/stage-transition.test.ts`

- [ ] Extend the GET projection so prospect records expose follow-up counters, current follow-up kind, current approval id, and queue state in a stable API shape.
- [ ] Extend PATCH to support operator actions:
  - `mark_follow_up_sent`
  - `skip_follow_up`
  - `regenerate_follow_up`
  while preserving Phase 1/2 CRM edits and status transitions.
- [ ] Make every PATCH mutation append the correct `prospect_activities` row and recalculate `next_followup_at`, `follow_up_count`, `follow_up_version`, and `pipeline_status` consistently.

### Task 5: Add follow-up controls to `/studio/prospects`

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/prospects/page.tsx`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/scripts/smoke-prospect-outbound.mjs`

- [ ] Extend the prospects page data model with follow-up fields and approval metadata for first follow-ups.
- [ ] Show the current follow-up rank (`F/U 1`, `F/U 2`, `F/U 3`) and queue state alongside existing CRM chips.
- [ ] Add operator controls:
  - approve/reject first follow-up;
  - mark follow-up sent;
  - skip;
  - regenerate;
  gated by the current prospect state.
- [ ] Extend the smoke script so it can validate one Phase 3 path: initial send -> due first follow-up -> approval -> mark follow-up sent -> updated next due date and activity trail.

### Task 6: Verify and document the Phase 3 operator flow

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/README.md`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/docs/runbooks/coolify-deploy.md`

- [ ] Document the new follow-up sequence behavior, including the approval rule for `follow_up_1` and the operator-only handling for later follow-ups.
- [ ] Document the live validation path, including required env vars for the smoke script and the expected state transitions in Studio.

