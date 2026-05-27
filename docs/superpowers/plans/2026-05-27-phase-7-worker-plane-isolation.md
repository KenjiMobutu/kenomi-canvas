> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# Phase 7 — Worker Plane Isolation

## Goal

Separate the human control plane from the worker execution plane for autonomy jobs, while preserving existing `Prospect`, `Scout`, and `DevOps` workflows.

## Scope

- add lease metadata to `autonomy_jobs`
- move worker drain out of `/api/studio/autonomy/jobs`
- add dedicated internal worker drain route
- enforce allowlisted job kinds and worker identity
- recover stale running jobs
- keep operator queue APIs intact
- validate with live migration, redeploy, and smoke

## Non-goals

- multiple worker classes
- browser sandbox workers
- DLQ design
- new business agents
- broader observability dashboards

## Files expected to change

### Database

- `supabase/migrations/20260525_prospect_crm.sql`

### Backend

- `lib/autonomy/job-runner.ts`
- `lib/autonomy/job-runner.test.ts`
- `app/api/studio/autonomy/jobs/route.ts`
- `app/api/internal/autonomy/worker/drain/route.ts`
- `lib/autonomy/operator-actions.ts` if queue semantics need adjustment
- `lib/autonomy/operator-actions.test.ts` if status handling changes

### Smoke / docs

- `scripts/smoke-prospect-outbound.mjs`
- `README.md`
- `docs/runbooks/coolify-deploy.md`

## Task 1 — Add worker lease columns

- [ ] extend `autonomy_jobs` with:
  - `locked_by`
  - `lock_expires_at`
  - `runner_type`
- [ ] backfill existing rows safely with null/default-compatible behavior
- [ ] preserve cumulative migration idempotence

### Verification

- migration applies cleanly on a dirty prod-like schema
- existing autonomy flows still read old rows without crashes

## Task 2 — Refactor job runner around leases

- [ ] update `lib/autonomy/job-runner.ts` to:
  - claim queued jobs by `kind`
  - require `workerId`
  - set `locked_by`, `lock_expires_at`, `runner_type`
  - clear lease metadata on complete/fail
- [ ] add stale lock recovery for:
  - `status = running`
  - `lock_expires_at < now()`
- [ ] keep output persistence contract stable

### Verification

- unit tests for:
  - claim queued job
  - reject disallowed kinds
  - clear lock on success
  - clear lock on failure
  - recover stale running job

## Task 3 — Split Studio route from worker route

- [ ] remove worker execution mode from:
  - `app/api/studio/autonomy/jobs/route.ts`
- [ ] keep only operator-facing actions there:
  - queue read
  - retry
  - cancel
  - approval resolution
  - approval gate delete
- [ ] add:
  - `app/api/internal/autonomy/worker/drain/route.ts`
- [ ] enforce worker auth with `AUTONOMY_WORKER_SECRET`
- [ ] validate payload:
  - `worker_id`
  - `limit`
  - `allowed_job_kinds`

### Verification

- Studio route no longer drains jobs
- worker route rejects missing/invalid token
- worker route drains only allowlisted kinds

## Task 4 — Update smoke and operator compatibility

- [ ] update smoke flow to hit the new worker route
- [ ] preserve current operator behavior for:
  - retries
  - cancellations
  - Prospect queue inspection
- [ ] keep existing Prospect smoke green

### Verification

- `npm run smoke:prospect`
- worker drain path exercised via new internal route

## Task 5 — Deploy and validate live

- [ ] apply migration on prod Supabase
- [ ] redeploy `kenomi-canvas`
- [ ] run live smoke against `https://lab.kenomi.eu`
- [ ] verify queue APIs and at least one autonomous flow

### Live acceptance

- worker drain succeeds through `/api/internal/autonomy/worker/drain`
- queued `run_agent` jobs complete
- stale running jobs can be reclaimed
- `/api/studio/autonomy/jobs` still works for operator reads/actions

## Suggested commit shape

1. `feat(autonomy): add worker lease metadata`
2. `refactor(autonomy): split studio queue from worker drain`
3. `test(smoke): move worker drain to internal route`

## Final verification checklist

- [ ] `npm test -- lib/autonomy/job-runner.test.ts lib/autonomy/operator-actions.test.ts`
- [ ] `npm run build`
- [ ] prod migration applied
- [ ] prod redeploy complete
- [ ] live smoke passes
