import { describe, expect, it } from 'vitest'
import { buildDeploymentParity, buildInfraOpsTimeline } from './infra-ops-timeline'
import type { InfraDiagnostics } from './infra-diagnostics'

const diagnostics: InfraDiagnostics = {
  checkedAt: '2026-05-19T14:00:00.000Z',
  runtime: {
    environment: 'production',
    sourceCommit: 'abc123456789',
    commitShort: 'abc1234',
  },
  summary: {
    ok: false,
    checksOk: 4,
    checksTotal: 5,
  },
  services: [
    {
      id: 'n8n',
      label: 'n8n',
      status: 'down',
      source: 'settings',
      urlLabel: 'n8n.kenomi.eu/healthz',
      latencyMs: 5000,
      lastError: 'This operation was aborted',
      repairAction: 'Verifier URL n8n / DNS / container Coolify',
      checkedAt: '2026-05-19T14:00:00.000Z',
    },
    {
      id: 'coolify',
      label: 'Coolify',
      status: 'ok',
      source: 'settings',
      urlLabel: '192.168.0.19:8000/api/v1/version',
      latencyMs: 24,
      lastError: null,
      repairAction: 'Aucune action',
      checkedAt: '2026-05-19T14:00:00.000Z',
    },
  ],
  proxmox: {
    id: 'proxmox',
    label: 'Proxmox',
    status: 'ok',
    source: 'settings',
    urlLabel: '192.168.0.10:8006/api2/json/nodes/proxmox/status',
    latencyMs: 42,
    lastError: null,
    repairAction: 'Aucune action',
    checkedAt: '2026-05-19T14:00:00.000Z',
    detail: '1 node · 3 VMs',
  },
}

describe('infra ops timeline', () => {
  it('builds operator timeline rows from diagnostic audit events', () => {
    const timeline = buildInfraOpsTimeline({
      events: [
        {
          id: 'event-1',
          event_type: 'infra.diagnostic.recheck',
          severity: 'info',
          created_at: '2026-05-19T14:01:00.000Z',
          metadata: {
            target_id: 'coolify',
            target_label: 'Coolify',
            status: 'ok',
            latency_ms: 24,
            repair_action: 'Aucune action',
          },
        },
      ],
      diagnostics,
    })

    expect(timeline.summary).toEqual({
      actionsTotal: 1,
      openIncidents: 0,
      lastActionAt: '2026-05-19T14:01:00.000Z',
    })
    expect(timeline.events[0]).toMatchObject({
      id: 'event-1',
      type: 'recheck',
      targetLabel: 'Coolify',
      status: 'ok',
      message: 'Coolify · ok · Aucune action',
    })
  })

  it('marks incident traces as open when the current diagnostic is still down', () => {
    const timeline = buildInfraOpsTimeline({
      events: [
        {
          id: 'event-2',
          event_type: 'infra.diagnostic.record_incident',
          severity: 'error',
          created_at: '2026-05-19T14:02:00.000Z',
          metadata: {
            target_id: 'n8n',
            target_label: 'n8n',
            status: 'down',
            last_error: 'This operation was aborted',
            repair_action: 'Verifier URL n8n / DNS / container Coolify',
          },
        },
      ],
      diagnostics,
    })

    expect(timeline.summary.openIncidents).toBe(1)
    expect(timeline.incidents[0]).toMatchObject({
      id: 'event-2',
      targetId: 'n8n',
      status: 'open',
      lastError: 'This operation was aborted',
    })
  })

  it('marks incident traces as resolved when the current diagnostic is healthy', () => {
    const timeline = buildInfraOpsTimeline({
      events: [
        {
          id: 'event-3',
          event_type: 'infra.diagnostic.record_incident',
          severity: 'warn',
          created_at: '2026-05-19T14:03:00.000Z',
          metadata: {
            target_id: 'coolify',
            target_label: 'Coolify',
            status: 'degraded',
            last_error: 'HTTP 500',
            repair_action: 'Verifier Coolify URL, API token et container',
          },
        },
      ],
      diagnostics,
    })

    expect(timeline.summary.openIncidents).toBe(0)
    expect(timeline.incidents[0]).toMatchObject({
      targetId: 'coolify',
      status: 'resolved',
    })
  })

  it('compares runtime and expected deployment commits', () => {
    expect(
      buildDeploymentParity({
        runtime: diagnostics.runtime,
        expectedCommit: 'abc123456789',
      })
    ).toMatchObject({
      status: 'ok',
      runtimeCommit: 'abc1234',
      expectedCommit: 'abc1234',
    })

    expect(
      buildDeploymentParity({
        runtime: diagnostics.runtime,
        expectedCommit: 'def999999999',
      })
    ).toMatchObject({
      status: 'mismatch',
      runtimeCommit: 'abc1234',
      expectedCommit: 'def9999',
    })

    expect(buildDeploymentParity({ runtime: diagnostics.runtime })).toMatchObject({
      status: 'unknown',
      expectedCommit: 'non configuré',
    })
  })
})
