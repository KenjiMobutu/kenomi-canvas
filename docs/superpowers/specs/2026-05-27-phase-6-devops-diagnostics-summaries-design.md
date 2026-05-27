# Phase 6 DevOps Diagnostics and Incident Summaries Design

## Goal

Make the `DevOps Agent` operational as a read-only infrastructure agent that:

- aggregates existing diagnostic signals,
- derives recent incidents and open incidents coherently,
- generates a readable incident summary for the operator,
- exposes all of this inside Studio without adding any repair action execution.

This phase is intentionally narrow:

- diagnostics only,
- incident summaries only,
- no remediation actions,
- no privileged execution expansion,
- no new zero-trust exceptions.

Success means the operator can open Studio and understand, in one place:

- which infra services are healthy,
- which incidents are open or recently resolved,
- what the likely problem is,
- what manual action should be considered next.

---

## Scope

### In scope

- reuse of existing health and diagnostics signals
- persistence of DevOps diagnostic snapshots or equivalent event rows
- derivation of incident state from persisted diagnostic events
- generation of a DevOps summary from real infra signals
- Studio rendering of incidents and summaries
- agent run path for `devops`
- tests for persistence, incident derivation, and summary generation

### Out of scope

- any repair action execution
- Proxmox, Coolify, or service mutations
- approval flows for repair actions
- new monitoring stack components such as Prometheus alert routing or Loki ingestion
- Scout, Prospect, or business automation changes

---

## Existing Anchors

The current codebase already contains the base of the diagnostic plane:

- `lib/infra-diagnostics.ts`
- `lib/infra-ops-timeline.ts`
- `/api/studio/services/health`
- `/api/studio/infra/proxmox`
- `/api/studio/infra/diagnostics`
- `/studio/infrastructure`

This phase should build on those foundations, not replace them.

The DevOps Agent should become a synthesis layer above the current diagnostics, not a second independent health system.

---

## Architecture

The design keeps three layers:

1. **Signal collection**
   Existing service and Proxmox diagnostics continue to produce raw health signals.

2. **Incident derivation**
   Diagnostic events are persisted and converted into:
   - current state by service
   - recent incident list
   - open vs resolved incident status

3. **DevOps summary generation**
   The DevOps Agent reads the current diagnostic state plus recent incidents and returns:
   - a short global summary
   - the most important affected services
   - likely cause or failure pattern
   - suggested manual operator next step

No action execution is attached to this agent in this phase.

---

## Signal Sources

The DevOps Agent should consume only signals already available or already trusted:

- service health checks (`Hermes`, `Ollama`, `n8n`, `Supabase`, `Coolify`)
- Proxmox status and VM counts
- existing infra diagnostic event history
- runtime deployment parity (`SOURCE_COMMIT` vs expected commit)

This keeps the source surface explicit and compatible with the current security posture.

The agent must not invent signals or infer hidden service state that is not grounded in those inputs.

---

## Persistence Model

This phase should persist a lightweight diagnostic history for DevOps summarization.

Recommended table:

- `public.devops_diagnostic_runs`

Recommended fields:

- `id`
- `user_id`
- `summary_status`
- `checked_at`
- `runtime_payload`
- `services_payload`
- `proxmox_payload`
- `timeline_payload`
- `created_at`

This is not meant to replace `agent_runs` or the existing audit log.
It is an operational snapshot table for infrastructure summarization and UI history.

Append-only semantics are preferred.

---

## Incident Derivation

Incident derivation should stay deterministic.

Rules:

- if a service is currently `down`, incident is `open`
- if a previous incident exists and current status returns to `ok`, incident becomes `resolved`
- `degraded` remains visible but lower severity than `down`
- missing telemetry is not silently promoted to a hard outage unless the source explicitly says so

Incident identity should be tied to the service target and recent event pattern, not to freeform LLM text.

This keeps incident state stable and testable.

---

## DevOps Agent Output

The DevOps Agent should return structured JSON, not free text only.

Recommended output shape:

```json
{
  "global_status": "ok|degraded|down",
  "headline": "short operator-facing status line",
  "services": [
    {
      "id": "ollama",
      "status": "down",
      "severity": "high",
      "reason": "network timeout",
      "next_step": "verify Ollama reachability on the private host"
    }
  ],
  "summary": "2-4 sentence synthesis grounded in diagnostics",
  "operator_next_step": "single highest-value manual step"
}
```

The summary must be grounded in diagnostic input. It should not hallucinate shell actions, credentials, or machine internals.

---

## Studio Surface

This phase should extend the existing `/studio/infrastructure` page instead of creating a separate DevOps product area.

Recommended additions:

- `Incident Summary` card
  - global status
  - summary text
  - operator next step

- `Recent Incidents` list
  - target service
  - severity
  - status (`open` / `resolved`)
  - last error
  - last seen time

- `Last DevOps Run` metadata
  - checked at
  - runtime commit
  - deployment parity

The UI should remain dense and operator-first, not explanatory or marketing-like.

---

## Execution Path

`runAgentStep(agentId='devops')` should:

1. collect or read the latest diagnostics,
2. derive incidents and current state,
3. build a concise DevOps context,
4. call the model,
5. persist the agent run as usual,
6. persist the diagnostic snapshot row,
7. expose the result to Studio.

This path should remain read-only with respect to infrastructure.

---

## Failure Model

Expected degraded cases:

- one diagnostic source unavailable
- Proxmox data missing
- service health route partial failure
- LLM summary failure

Required behavior:

- raw diagnostics should still render even if the DevOps summary fails
- summary generation failure must not erase incident visibility
- one missing source should degrade the report, not crash the page

The operator must always retain access to the underlying signals.

---

## Security Constraints

This phase must preserve the current zero-trust posture:

- no direct Proxmox execution
- no direct Coolify deployment or restart action
- no shell execution from the DevOps Agent
- no new secret exposure to the browser
- all sensitive URLs remain server-only or sanitized

This is an observability and synthesis phase, not a control-plane escalation.

---

## Testing

Required coverage:

1. diagnostic snapshot persistence
2. incident derivation from service status transitions
3. degraded-mode behavior when one source fails
4. DevOps output schema parsing
5. Studio projection for recent incidents and summary

Live validation target:

- a `devops` run on production that produces:
  - one persisted diagnostic summary row
  - one readable summary in Studio
  - a consistent incident list matching the current infra state

---

## Why This Design

This is the right next slice because:

- it makes the DevOps Agent useful without increasing infra risk,
- it reuses the diagnostics already built instead of replacing them,
- it creates a stable basis for later phases with repair actions,
- it improves architectural conformity while staying within the current trust boundaries.

It is the smallest DevOps phase that materially improves operational observability.
