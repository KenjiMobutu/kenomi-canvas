# Autonomy Incident Runbook

## Scope

Use this runbook when autonomous jobs, actions, or approval gates behave
unexpectedly.

## Immediate Stop

Set the global kill switch and redeploy/restart the app:

```bash
AUTONOMY_ENABLED=false
```

Expected behavior: `POST /api/studio/agents/orchestrate` returns no executable
work and records a blocked reason. Manual Studio access remains available.

## Safe Investigation Mode

Enable dry-run before testing external actions:

```bash
AUTONOMY_DRY_RUN=true
```

Expected behavior: approved external actions (`create_checkout`, `deploy`,
`publish_campaign`, `scale_budget`) complete with `output.dry_run=true` and do
not call Stripe, Coolify, or n8n.

## Triage Checklist

1. Open `/studio/agents`.
2. Review `Autonomy Ops` tabs:
   - Jobs: queued/running/failed/completed.
   - Actions: blocked/running/completed/failed.
   - Approvals: pending/approved/rejected.
3. Reject unknown or unsafe pending approvals.
4. Inspect failed action `output.error` and failed job `last_error`.
5. Check budget breach labels before approving marketing or scale actions.

## Stuck Approval

If an approval is stale or unsafe:

1. Use the Studio `Reject` button in Approval Gates.
2. Confirm the linked `autonomy_actions.status` becomes `cancelled`.
3. If the UI is unavailable, use a service-role SQL repair in Supabase:

```sql
update public.human_approvals
set status = 'rejected', updated_at = now()
where id = '<approval_id>' and status = 'pending';

update public.autonomy_actions
set status = 'cancelled', output = jsonb_build_object('approved', false), updated_at = now()
where id = '<action_id>';
```

## Failed Job Replay

Only replay non-destructive jobs.

```sql
update public.autonomy_jobs
set status = 'queued',
    next_run_at = now(),
    locked_at = null,
    last_error = null,
    updated_at = now()
where id = '<job_id>' and status = 'failed';
```

Keep `AUTONOMY_DRY_RUN=true` for the first replay if the job can create external
side effects.

## Worker Queue Drain

If jobs stay queued, trigger the internal worker endpoint from the Coolify VM:

```bash
curl -X POST "$APP_BASE_URL/api/internal/autonomy/worker/drain" \
  -H "x-autonomy-worker-token: $AUTONOMY_WORKER_SECRET" \
  -H "content-type: application/json" \
  -d '{"worker_id":"incident:manual","limit":5,"allowed_job_kinds":["run_agent"]}'
```

Expected behavior: queued jobs move to `running`, then `completed` or `failed`,
and `autonomy_jobs.last_error` captures any failure reason.

## Recovery Gate

Before re-enabling autonomy:

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

Then restore:

```bash
AUTONOMY_ENABLED=true
AUTONOMY_DRY_RUN=false
```

## DevOps Agent Scope

In Phase 6, the `devops` agent is read-only:

- it reads diagnostics and incident history,
- it writes `devops_diagnostic_runs`,
- it does not restart services,
- it does not call Coolify, Proxmox, or shell repair paths.

Use this smoke to verify the summary layer after deploy:

```bash
export SMOKE_BASE_URL=https://lab.kenomi.eu
export SMOKE_STUDIO_COOKIE='sb-supabase-auth-token=base64-...'
npm run smoke:devops
```
