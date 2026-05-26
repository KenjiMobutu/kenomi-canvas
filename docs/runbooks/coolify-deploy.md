# Coolify Deploy Runbook

## Scope

Use this runbook when a `deploy` autonomy action fails, hangs, or deploys an
incorrect service.

## Required Configuration

```bash
COOLIFY_URL=https://coolify.example.internal
COOLIFY_TOKEN=...
HERMES_AGENT_URL=https://hermes.kenomi.eu
OLLAMA_BASE_URL=http://192.168.0.14:11434
QDRANT_URL=http://qdrant.internal:6333
QDRANT_COLLECTION_PROSPECTS=prospects
EMBEDDING_MODEL=nomic-embed-text:latest
TRUSTED_PRIVATE_HOSTS=coolify.example.internal
SOURCE_COMMIT=<git-sha-built>
EXPECTED_SOURCE_COMMIT=<git-sha-expected>
HERMES_AGENT_API_KEY=...
```

If `COOLIFY_URL` uses a private tailnet or LAN host, the hostname must be listed
in `TRUSTED_PRIVATE_HOSTS`. This prevents broad SSRF access while allowing the
known internal deploy target.

`SOURCE_COMMIT` must be passed as a Docker build arg and runtime env whenever
Coolify builds a new image. The Infrastructure page compares it with
`EXPECTED_SOURCE_COMMIT` when present so operators can see whether the running
container matches the commit they expected to deploy.

Deployment order for the live topology:

1. Push the new app image to Coolify.
2. Verify `Hermes Agent` responds through the reverse proxy.
3. Verify `Ollama` remains reachable only from the private Mac Mini M4 path.
4. Re-run the Studio health checks.
5. Re-run the Prospect outbound smoke loop with a valid Studio cookie:

```bash
export SMOKE_BASE_URL=https://lab.kenomi.eu
export SMOKE_STUDIO_COOKIE='sb-supabase-auth-token=base64-...'
export AUTONOMY_WORKER_SECRET='...'
npm run smoke:prospect
```

6. Approve or unblock the autonomy action only after the public UI, private LLM, and Prospect outbound loop all pass.

If the autonomy worker is not drained continuously in production, `AUTONOMY_WORKER_SECRET` lets the smoke trigger the queue worker explicitly through `/api/studio/autonomy/jobs`.

The Prospect smoke is only considered green if it also confirms the Phase 2 CRM-local mutation path:

- `operator_notes`
- `next_action`
- `tags`

For Phase 3, the same smoke must also validate the first follow-up loop:

- first due follow-up generated as `follow_up_1`
- approval `send_follow_up`
- Gmail draft materialized after approval
- operator transition back to `sent`
- `follow_up_count=1` with the next due date scheduled

Phase 4 adds Qdrant-backed Prospect memory, but the outbound smoke must remain runnable even when `QDRANT_URL` or `EMBEDDING_MODEL` are absent. Memory writes and retrieval are best effort only; a disabled or failing Qdrant must not block the Prospect loop.

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
