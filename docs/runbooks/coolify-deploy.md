# Coolify Deploy Runbook

## Scope

Use this runbook when a `deploy` autonomy action fails, hangs, or deploys an
incorrect service.

## Required Configuration

```bash
COOLIFY_URL=https://coolify.example.internal
COOLIFY_TOKEN=...
TRUSTED_PRIVATE_HOSTS=coolify.example.internal
SOURCE_COMMIT=<git-sha-built>
EXPECTED_SOURCE_COMMIT=<git-sha-expected>
```

If `COOLIFY_URL` uses a private tailnet or LAN host, the hostname must be listed
in `TRUSTED_PRIVATE_HOSTS`. This prevents broad SSRF access while allowing the
known internal deploy target.

`SOURCE_COMMIT` must be passed as a Docker build arg and runtime env whenever
Coolify builds a new image. The Infrastructure page compares it with
`EXPECTED_SOURCE_COMMIT` when present so operators can see whether the running
container matches the commit they expected to deploy.

## Normal Flow

1. `POST /api/studio/deployments` creates an `autonomy_actions` row with
   `action_type='deploy'`.
2. Production deploys are `blocked` and require `human_approvals`.
3. Approval calls the Coolify client.
4. `autonomy_actions.output.deploymentId` stores the Coolify deployment id.

## Triage Checklist

1. Open `/studio/agents` and inspect `Autonomy Ops > Actions`.
2. Find the failed `deploy` action.
3. Read `output.error`.
4. Verify `input.projectId` and `input.serviceId`.
5. Check Coolify logs for the matching deployment id if present.

## Dry Run

Before retrying risky deploys:

```bash
AUTONOMY_DRY_RUN=true
```

Approving the deploy should mark the action completed with `output.dry_run=true`
without calling Coolify.

## Retry

If the failure was transient, create a new deploy action from Studio or reset the
failed action only if you understand the previous state. Prefer a new action for
audit clarity.

## Rollback

Rollback should be executed from Coolify using the known-good deployment/image.
After rollback:

1. Add a note to the failed `autonomy_actions.output` if needed.
2. Keep `AUTONOMY_ENABLED=false` until smoke checks pass.
3. Run:

```bash
npm run smoke
```

## Emergency Disable

```bash
AUTONOMY_ENABLED=false
```

This blocks further orchestration while preserving manual Studio access.
