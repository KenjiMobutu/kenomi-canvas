> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# Phase 8 — Business Schedules

## Goal

Add recurring business schedules for:

- `Scout`
- `Prospect`
- `follow-ups`
- `DevOps`

The scheduler must enqueue work into `autonomy_jobs`, and execution must continue through the worker plane.

## Scope

- new `business_schedules` table
- internal scheduler route
- schedule visibility and pause/resume controls
- job enqueueing for the four target loops
- worker compatibility for `run_agent` and `follow_up_scan`
- live validation in production

## Non-goals

- budget caps
- kill switches
- cron expressions
- DLQ / retry policy engine
- multi-user ownership

## Files expected to change

### Database

- `supabase/migrations/20260527_business_schedules.sql`

### Scheduler / backend

- `lib/autonomy/job-runner.ts`
- `lib/autonomy/job-runner.test.ts`
- `lib/autonomy/scheduler.ts`
- `lib/autonomy/scheduler.test.ts`
- `app/api/internal/autonomy/scheduler/run/route.ts`
- `app/api/internal/autonomy/worker/drain/route.ts`
- `app/api/studio/automations/runs/route.ts` or a dedicated schedules route

### Studio UI

- `app/studio/automations/page.tsx`

### Smoke / docs

- `scripts/smoke-devops-diagnostics.mjs`
- `README.md`
- `docs/runbooks/coolify-deploy.md`

## Task 1 — Add persistent business schedules

- [ ] create `public.business_schedules`
- [ ] add unique `(user_id, schedule_key)`
- [ ] seed or lazily bootstrap 4 schedules:
  - `scout`
  - `prospect`
  - `follow_ups`
  - `devops`
- [ ] include fields:
  - `status`
  - `interval_minutes`
  - `last_enqueued_at`
  - `last_completed_at`
  - `next_run_at`
  - `payload`

### Verification

- migration applies cleanly
- schedule rows exist for the active user

## Task 2 — Build scheduler service

- [ ] create scheduler library that:
  - lists active due schedules
  - skips paused/future schedules
  - enqueues jobs once
  - advances `next_run_at`
- [ ] implement schedule-specific enqueue rules:
  - `Scout` -> `run_agent`
  - `Prospect` -> `run_agent`
  - `DevOps` -> `run_agent`
  - `follow_ups` -> `follow_up_scan`
- [ ] persist scheduler audit metadata

### Verification

- unit tests for:
  - due schedule enqueue
  - paused schedule skip
  - future schedule skip
  - `next_run_at` advance

## Task 3 — Add internal scheduler route

- [ ] create `POST /api/internal/autonomy/scheduler/run`
- [ ] auth with `AUTONOMY_SCHEDULER_SECRET`
- [ ] return structured scheduling report
- [ ] reject missing/invalid token

### Verification

- route rejects unauthorized caller
- route enqueues expected jobs for due schedules

## Task 4 — Extend worker plane for follow-up scans

- [ ] allow worker execution of:
  - `run_agent`
  - `follow_up_scan`
- [ ] add deterministic handling for `follow_up_scan`
- [ ] preserve existing `Prospect`, `Scout`, and `DevOps` worker behavior

### Verification

- worker still drains `run_agent`
- worker can process `follow_up_scan`
- no regression on Prospect smoke

## Task 5 — Expose schedules in Studio

- [ ] extend Studio API to list schedules
- [ ] add pause/resume
- [ ] add run-now trigger
- [ ] display:
  - label
  - status
  - interval
  - last enqueued
  - last completed
  - next run

### Verification

- `/studio/automations` shows schedule state
- toggling active/paused persists

## Task 6 — Deploy and validate live

- [ ] apply migration in prod
- [ ] redeploy `kenomi-canvas`
- [ ] run live scheduler trigger
- [ ] drain worker
- [ ] confirm business effect

### Recommended live validation order

1. `DevOps` schedule
2. `Scout` schedule
3. `Prospect` schedule
4. `follow_ups` schedule

### Live acceptance

- scheduler route enqueues jobs
- worker processes enqueued jobs
- Studio reflects updated timestamps
- at least one deterministic smoke passes in prod

## Suggested commit shape

1. `feat(schedules): add business schedules schema`
2. `feat(schedules): add internal scheduler`
3. `feat(automations): expose business schedules in studio`
4. `test(smoke): validate scheduled devops run`

## Final verification checklist

- [ ] `npm test -- lib/autonomy/job-runner.test.ts lib/autonomy/scheduler.test.ts`
- [ ] `npm run build`
- [ ] prod migration applied
- [ ] prod redeploy complete
- [ ] live scheduler trigger works
- [ ] live smoke passes
