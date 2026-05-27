# Phase 7 — Worker Plane Isolation Design

Date: 2026-05-27
Status: Proposed
Scope: `kenomi-canvas` control plane / worker plane separation for autonomy jobs

## Goal

Make the autonomy execution layer conform more closely to the target architecture:

- Studio routes remain the human control plane.
- job execution moves behind a dedicated worker-facing contract.
- queue processing becomes lease-based, recoverable, and explicitly scoped.
- the zero-trust posture becomes more concrete instead of relying on convention.

This phase does **not** add new business agents. It hardens the execution plane already used by `Prospect`, `Scout`, and `DevOps`.

## Current Problem

Today, `/api/studio/autonomy/jobs` mixes three concerns:

1. operator queue reads,
2. operator actions such as retry/cancel,
3. worker execution through `AUTONOMY_WORKER_SECRET`.

That works, but the boundary is weak:

- worker traffic still goes through a Studio route,
- job claiming has no explicit lease expiry contract,
- no `locked_by` identity is stored,
- stale locks are not modeled cleanly,
- job kinds are not explicitly allowlisted for a given worker request,
- the API surface does not clearly separate human traffic from machine traffic.

This phase fixes that.

## Design Principles

1. **Separate planes clearly**
   Human UI and operator APIs stay in `app/api/studio/*`.
   Worker execution moves to an internal endpoint with a stricter contract.

2. **Keep execution narrow**
   The worker should only drain allowed job kinds, not expose generic operator capabilities.

3. **Use recoverable leases**
   Queue processing must tolerate worker crashes and reclaim stale jobs safely.

4. **Preserve existing product flows**
   `Prospect`, `Scout`, and `DevOps` should continue to run without changing their user-facing workflow.

5. **No new trust expansion**
   This phase must not introduce broader secrets access, broader Supabase access, or direct human access through the worker secret.

## Architecture

### Control plane

The Studio route stays focused on operator workflows:

- `GET /api/studio/autonomy/jobs`
- `POST /api/studio/autonomy/jobs` for retry/cancel
- `PATCH /api/studio/autonomy/jobs` for approval resolution
- `DELETE /api/studio/autonomy/jobs` for approval gate cleanup

This route must no longer execute queued jobs.

### Worker plane

Add a dedicated internal route:

- `POST /api/internal/autonomy/worker/drain`

This route:

- authenticates with `x-autonomy-worker-token`,
- accepts a small worker request payload,
- claims executable jobs using lease semantics,
- runs allowed jobs only,
- returns worker-oriented execution results.

This route is not exposed as a Studio operator API.

## Data Model Changes

Extend `public.autonomy_jobs` with explicit execution metadata:

- `locked_by text null`
- `lock_expires_at timestamptz null`
- `runner_type text null`

Recommended meanings:

- `locked_by`: worker identity such as `worker:prod:coolify-1`
- `lock_expires_at`: lease expiry timestamp
- `runner_type`: initial value `internal_worker`

Existing columns remain:

- `status`
- `locked_at`
- `attempt_count`
- `next_run_at`
- `last_error`
- `payload`

`locked_at` stays useful for audit and display; `lock_expires_at` becomes the recovery boundary.

## Worker Request Contract

`POST /api/internal/autonomy/worker/drain`

Request body:

```json
{
  "worker_id": "worker:prod:coolify-1",
  "limit": 3,
  "allowed_job_kinds": ["run_agent"]
}
```

Rules:

- `worker_id` required, non-empty string
- `limit` optional, bounded to a small max such as `10`
- `allowed_job_kinds` optional but validated against known kinds
- request rejected if the worker secret is missing or invalid

The worker route must never accept operator actions such as retry/cancel/approval resolution.

## Queue Lease Model

### Claiming

When a worker drains the queue:

- only jobs in `status='queued'` are eligible,
- only jobs whose `next_run_at <= now()` are eligible,
- only jobs whose kind is in the allowlist are eligible.

The claim writes:

- `status='running'`
- `locked_at=now`
- `locked_by=<worker_id>`
- `lock_expires_at=now + lease_window`
- `attempt_count=attempt_count + 1`

### Completion

On success:

- `status='completed'`
- `locked_at=null`
- `locked_by=null`
- `lock_expires_at=null`
- `last_error=null`
- append output into `payload.output`

### Failure

On failure:

- `status='failed'`
- `locked_at=null`
- `locked_by=null`
- `lock_expires_at=null`
- `last_error=<message>`

### Stale lock recovery

A queued-job claimant must also be able to recover stale running jobs if:

- `status='running'`
- `lock_expires_at < now()`

Recovery policy for this phase:

- mark stale running job back to `queued`
- clear `locked_at`, `locked_by`, `lock_expires_at`
- keep `attempt_count` unchanged during recovery itself
- optionally append a machine-readable recovery message to `last_error`

This keeps the model simple and observable.

## Allowed Job Kinds

For this phase, the worker only needs to execute:

- `run_agent`

Any other kind should be ignored or rejected by the worker drain route depending on the request.

This is deliberate. The execution plane should grow by explicit allowlist, not by accident.

## API Behavior Changes

### `/api/studio/autonomy/jobs`

After this phase:

- `GET` remains operator-only queue/status read
- `POST` remains operator-only retry/cancel
- `PATCH` remains operator-only approval resolution
- `DELETE` remains operator-only approval gate deletion
- no worker execution mode in this route

### `/api/internal/autonomy/worker/drain`

New behavior:

- worker-only auth
- drain queue
- return processed jobs with:
  - `jobId`
  - `status`
  - `agentRunId`
  - `result`
  - `error` when relevant

## Internal Library Changes

### `lib/autonomy/job-runner.ts`

Refactor responsibilities:

- claim queued jobs by kind and lease
- reclaim stale leases
- complete/fail jobs with lease cleanup
- expose a worker-oriented `processQueuedAutonomyJobs` API that requires:
  - `workerId`
  - `allowedJobKinds`
  - `limit`

### `app/api/studio/autonomy/jobs/route.ts`

Remove worker mode from this file.

### New internal route

Add:

- `app/api/internal/autonomy/worker/drain/route.ts`

This route should be thin and delegate to `job-runner`.

## Audit And Observability

Add audit events for:

- `autonomy.job.claimed`
- `autonomy.job.completed`
- `autonomy.job.failed`
- `autonomy.job.recovered`

Metadata should include:

- `job_id`
- `worker_id`
- `job_kind`
- `agent_id` if present
- `lock_expires_at` where relevant

This phase does not add a new UI page, but these events should support later observability work.

## Security Posture

This phase preserves the current posture and makes it stricter:

- no Studio user can impersonate worker execution without the worker secret
- worker secret grants queue draining only, not human actions
- worker requests do not rely on browser cookies
- worker execution remains server-side through `supabaseAdmin`
- zero-trust scope is improved by reducing mixed-surface routes

## Backward Compatibility

Existing product flows must keep working after migration:

- `Prospect` enqueue + worker drain + approval flow
- `Scout` enqueue + worker drain
- `DevOps` enqueue + worker drain

The frontend should not need a functional change beyond continuing to read operator queue data from `/api/studio/autonomy/jobs`.

## Testing Strategy

### Unit tests

- claim queued job with valid allowlisted kind
- reject/drain nothing for disallowed kinds
- recover stale running job
- clear lease metadata on complete
- clear lease metadata on fail
- worker route rejects missing/invalid token
- Studio route no longer drains worker jobs

### Smoke

Add or update a smoke flow that proves:

1. enqueue a `run_agent` job,
2. drain it through `/api/internal/autonomy/worker/drain`,
3. verify completion,
4. verify operator route still returns queue state,
5. verify retry/cancel still operate through Studio route.

### Live verification

Production verification must include:

- migration applied
- app redeployed
- worker drain route exercised with `AUTONOMY_WORKER_SECRET`
- at least one existing autonomous flow validated end-to-end

## Non-Goals

This phase does not include:

- multiple worker classes per agent
- browser sandbox workers
- separate VM pool orchestration
- DLQ design
- cost-aware routing
- action execution beyond current `run_agent` queue work

Those belong to later phases.

## Acceptance Criteria

This phase is done when:

1. worker execution is removed from `/api/studio/autonomy/jobs`,
2. a dedicated internal worker drain route exists,
3. `autonomy_jobs` stores `locked_by`, `lock_expires_at`, `runner_type`,
4. stale running jobs can be recovered,
5. worker drain accepts only allowlisted kinds,
6. operator queue APIs still work,
7. migration, redeploy, and smoke pass in prod.
