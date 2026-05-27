# Phase 8 — Business Schedules Design

Date: 2026-05-27
Status: Proposed
Scope: recurring business schedules for `Scout`, `Prospect`, `follow-ups`, and `DevOps`

## Goal

Make the platform run core business loops on a recurring basis instead of only on manual triggers.

This phase introduces business schedules that enqueue work into `autonomy_jobs`, while preserving the worker plane introduced in Phase 7.

The intent is simple:

- schedules decide **when** to enqueue work,
- `autonomy_jobs` decide **what** gets executed,
- the worker plane decides **how** the queued work is executed,
- Studio remains the human control plane.

## Why This Phase Exists Now

Current autonomy is functional but still operator-triggered too often.

We already have:

- autonomous agents,
- queue execution,
- worker isolation,
- CRM/follow-up logic,
- DevOps diagnostic summaries.

What is missing is regular recurrence for the core loops:

- finding signals,
- generating prospects,
- triggering follow-up generation,
- refreshing infra diagnostics.

This phase closes that gap without introducing a full autonomy policy engine yet.

## Design Principles

1. **Schedules enqueue jobs, they do not bypass the queue**
   Every recurring run must still go through `autonomy_jobs`.

2. **One scheduler, multiple business loops**
   A central scheduler is easier to reason about than four unrelated timer implementations.

3. **Operator-visible and pausable**
   Every schedule must be visible and pausable from Studio.

4. **No hidden direct execution**
   A recurring schedule should never call `runAgentStep` directly.

5. **Keep frequency rules simple**
   This phase uses practical intervals, not an overbuilt cron framework.

## Schedules In Scope

### 1. Scout schedule

Purpose:

- periodically scan Reddit source signals,
- enqueue a `Scout` run when due,
- keep the opportunity funnel active without manual clicking.

Default cadence for this phase:

- every 6 hours

### 2. Prospect schedule

Purpose:

- periodically enqueue `Prospect` runs from active acquisition context,
- ensure the pipeline continues to generate fresh leads.

Default cadence:

- every 8 hours

### 3. Follow-up schedule

Purpose:

- scan `prospects` for `next_followup_at <= now()`,
- enqueue follow-up generation work through the existing flow,
- keep follow-up sequences alive without manual polling.

Default cadence:

- every 30 minutes

### 4. DevOps schedule

Purpose:

- refresh infra diagnostics snapshots and summaries on a regular cadence,
- keep `/studio/infrastructure` current even without manual trigger.

Default cadence:

- every 30 minutes

## Architecture

### Control plane

Studio exposes:

- current schedule state,
- last run,
- next due time,
- paused/active toggle,
- manual trigger.

### Scheduler plane

A central scheduler endpoint evaluates configured schedules and enqueues due work.

Recommended route:

- `POST /api/internal/autonomy/scheduler/run`

This route:

- is authenticated with a scheduler secret,
- scans active schedule definitions,
- enqueues due jobs only,
- updates run timestamps,
- returns a scheduling report.

### Worker plane

No direct changes in responsibility:

- scheduler creates jobs,
- worker drain executes jobs.

That separation must remain intact.

## Data Model

Add a new table:

- `public.business_schedules`

Fields:

- `id uuid primary key`
- `user_id uuid not null`
- `schedule_key text not null`
- `label text not null`
- `status text not null` with values:
  - `active`
  - `paused`
- `interval_minutes integer not null`
- `last_enqueued_at timestamptz null`
- `last_completed_at timestamptz null`
- `next_run_at timestamptz not null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique key:

- `(user_id, schedule_key)`

Initial `schedule_key` values:

- `scout`
- `prospect`
- `follow_ups`
- `devops`

## Schedule Payload Model

Payload remains intentionally small.

Examples:

### Scout

```json
{
  "agentId": "scout"
}
```

### Prospect

```json
{
  "agentId": "prospect",
  "focus": "prospect"
}
```

### Follow-ups

```json
{
  "mode": "follow_ups"
}
```

### DevOps

```json
{
  "agentId": "devops"
}
```

## Scheduling Rules

For each active row in `business_schedules`:

- if `status != active`, skip
- if `next_run_at > now()`, skip
- otherwise enqueue work once
- then update:
  - `last_enqueued_at = now()`
  - `next_run_at = now() + interval_minutes`

This phase deliberately does **not** implement:

- missed-run replay batches,
- jitter windows,
- adaptive cadence,
- complex cron strings,
- dependency graphs between schedules.

## Enqueue Semantics Per Schedule

### Scout

Enqueue:

- `autonomy_jobs.kind = 'run_agent'`
- payload:
  - `agentId = 'scout'`
  - standard prompt for Reddit scouting

### Prospect

Enqueue:

- `autonomy_jobs.kind = 'run_agent'`
- payload:
  - `agentId = 'prospect'`
  - standard prospect prompt

### Follow-ups

Enqueue:

- one or more `run_agent` jobs or a dedicated `follow_up_scan` kind

Recommended for this phase:

- use a dedicated job kind:
  - `kind = 'follow_up_scan'`

Reason:

- the scheduler job is not itself a single `Prospect` generation;
- it scans due rows and triggers follow-up generation logic deterministically.

### DevOps

Enqueue:

- `autonomy_jobs.kind = 'run_agent'`
- payload:
  - `agentId = 'devops'`

## Worker Compatibility

The worker plane must explicitly allow:

- `run_agent`
- `follow_up_scan`

The `follow_up_scan` execution path can remain in app code rather than LLM-only execution.

This is the first place where the worker plane executes more than one kind, but still through explicit allowlist.

## API Surface

### New internal scheduler route

- `POST /api/internal/autonomy/scheduler/run`

Auth:

- `x-autonomy-scheduler-token`

Request body:

```json
{
  "limit": 10
}
```

Response:

```json
{
  "ok": true,
  "processed": [
    {
      "scheduleKey": "devops",
      "enqueued": 1
    }
  ]
}
```

### Studio route

Add or extend a schedule-facing Studio API, for example:

- `GET /api/studio/automations/runs`
- or a dedicated route:
  - `GET /api/studio/schedules`
  - `PATCH /api/studio/schedules`

Required capabilities:

- list schedule rows,
- toggle `active` / `paused`,
- manual trigger.

## UI Surface

Recommended location:

- `/studio/automations`

Display for each schedule:

- label
- status badge
- interval
- last enqueued
- last completed
- next run
- buttons:
  - `Pause`
  - `Resume`
  - `Run now`

No need for a brand-new page in this phase if the existing automations surface can host it cleanly.

## Follow-up Scan Behavior

The scheduler should not generate follow-up content directly.

Instead:

1. scheduler enqueues `follow_up_scan`
2. worker claims `follow_up_scan`
3. follow-up scan finds due prospects
4. it triggers the already-existing follow-up flow

This preserves a clean separation:

- schedule timing,
- queue execution,
- domain logic.

## Security Posture

This phase adds one new machine secret:

- `AUTONOMY_SCHEDULER_SECRET`

Rules:

- scheduler secret is distinct from `AUTONOMY_WORKER_SECRET`
- scheduler route cannot perform operator actions
- scheduler route only enqueues jobs
- worker route only drains jobs
- Studio routes remain cookie-authenticated for humans

## Observability

For each schedule run, persist enough information to answer:

- was the schedule due?
- was work enqueued?
- how many jobs were created?
- when will it run again?

Minimum audit events:

- `schedule.run.started`
- `schedule.run.enqueued`
- `schedule.run.skipped`
- `schedule.run.failed`

## Testing Strategy

### Unit

- enqueue only due active schedules
- skip paused schedules
- skip future schedules
- advance `next_run_at` correctly
- `follow_up_scan` path enqueues/executed through worker
- scheduler route rejects invalid/missing token

### Integration

- scheduler run creates `autonomy_jobs`
- worker drain processes enqueued jobs
- Studio schedule listing shows updated timestamps

### Smoke

Add a new smoke:

- trigger scheduler route
- verify at least one schedule enqueues a job
- drain worker
- verify resulting business effect

Recommended live smoke for this phase:

- `DevOps` schedule because it is low-risk and deterministic

## Non-goals

This phase does not yet include:

- budget caps
- global kill switch
- retry backoff policy engine
- dead-letter queues
- user-configurable cron expressions
- multi-user ownership semantics

## Acceptance Criteria

This phase is done when:

1. `Scout`, `Prospect`, `follow-ups`, and `DevOps` have persistent schedule rows,
2. a scheduler route enqueues due work,
3. worker plane executes the enqueued work,
4. schedules are visible and pausable,
5. migration, redeploy, and live smoke pass in production.
