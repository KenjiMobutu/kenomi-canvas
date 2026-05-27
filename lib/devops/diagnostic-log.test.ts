import { describe, expect, it } from 'vitest'
import { appendDevopsDiagnosticRun, buildDevopsDiagnosticRunRow } from './diagnostic-log'
import type { InfraDiagnostics } from '@/lib/infra-diagnostics'
import type { DeploymentParity, InfraOpsTimeline } from '@/lib/infra-ops-timeline'

const diagnostics: InfraDiagnostics = {
  checkedAt: '2026-05-27T10:00:00.000Z',
  runtime: {
    environment: 'production',
    sourceCommit: 'abc123456789',
    commitShort: 'abc1234',
  },
  summary: {
    ok: false,
    checksOk: 3,
    checksTotal: 5,
  },
  services: [
    {
      id: 'ollama',
      label: 'Ollama',
      status: 'down',
      source: 'settings',
      urlLabel: '192.168.0.14:11434',
      latencyMs: 5000,
      lastError: 'timeout',
      repairAction: 'Verifier URL Ollama settings/env et port 11434',
      checkedAt: '2026-05-27T10:00:00.000Z',
    },
  ],
  proxmox: {
    id: 'proxmox',
    label: 'Proxmox',
    status: 'ok',
    source: 'settings',
    urlLabel: '192.168.0.10:8006/api2/json/nodes/proxmox/status',
    latencyMs: 45,
    lastError: null,
    repairAction: 'Aucune action',
    checkedAt: '2026-05-27T10:00:00.000Z',
    detail: '1 node · 4 VMs',
  },
}

const timeline: InfraOpsTimeline = {
  summary: {
    actionsTotal: 2,
    openIncidents: 1,
    lastActionAt: '2026-05-27T10:00:00.000Z',
  },
  events: [
    {
      id: 'event-1',
      type: 'record_incident',
      severity: 'error',
      targetId: 'ollama',
      targetLabel: 'Ollama',
      status: 'down',
      message: 'Ollama · down · timeout',
      createdAt: '2026-05-27T10:00:00.000Z',
    },
  ],
  incidents: [
    {
      id: 'incident-1',
      targetId: 'ollama',
      targetLabel: 'Ollama',
      status: 'open',
      severity: 'error',
      lastError: 'timeout',
      repairAction: 'Verifier URL Ollama settings/env et port 11434',
      createdAt: '2026-05-27T10:00:00.000Z',
    },
  ],
}

const parity: DeploymentParity = {
  status: 'mismatch',
  runtimeCommit: 'abc1234',
  expectedCommit: 'def9999',
  message: 'Runtime différent du commit attendu',
}

describe('buildDevopsDiagnosticRunRow', () => {
  it('builds an append-only snapshot row with summary status and payloads', () => {
    const row = buildDevopsDiagnosticRunRow({
      userId: 'user-1',
      diagnostics,
      timeline,
      parity,
      summaryPayload: {
        global_status: 'down',
        headline: '1 open infra incident',
      },
    })

    expect(row).toMatchObject({
      user_id: 'user-1',
      summary_status: 'down',
      checked_at: '2026-05-27T10:00:00.000Z',
      runtime_payload: {
        environment: 'production',
        sourceCommit: 'abc123456789',
      },
      summary_payload: {
        global_status: 'down',
        headline: '1 open infra incident',
      },
      services_payload: {
        summary: diagnostics.summary,
        services: diagnostics.services,
      },
      proxmox_payload: diagnostics.proxmox,
      timeline_payload: {
        summary: timeline.summary,
        incidents: timeline.incidents,
        parity,
      },
    })
  })

  it('returns null when required inputs are absent', () => {
    expect(
      buildDevopsDiagnosticRunRow({
        userId: 'user-1',
        diagnostics: null,
        timeline,
        parity,
      })
    ).toBeNull()
    expect(
      buildDevopsDiagnosticRunRow({
        userId: 'user-1',
        diagnostics,
        timeline: null,
        parity,
      })
    ).toBeNull()
  })
})

describe('appendDevopsDiagnosticRun', () => {
  it('writes a single snapshot row to devops_diagnostic_runs', async () => {
    const inserted: Array<Record<string, unknown>> = []
    const supabase = {
      from(table: string) {
        return {
          insert(row: Record<string, unknown>) {
            if (table === 'devops_diagnostic_runs') inserted.push(row)
            return Promise.resolve({ data: row, error: null })
          },
        }
      },
    }

    await appendDevopsDiagnosticRun({
      supabase: supabase as never,
      userId: 'user-1',
      diagnostics,
      timeline,
      parity,
      summaryPayload: {
        global_status: 'down',
      },
    })

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      user_id: 'user-1',
      summary_status: 'down',
    })
  })

  it('skips writes when the snapshot is incomplete', async () => {
    const inserted: Array<Record<string, unknown>> = []
    const supabase = {
      from(_table: string) {
        return {
          insert(row: Record<string, unknown>) {
            inserted.push(row)
            return Promise.resolve({ data: row, error: null })
          },
        }
      },
    }

    await appendDevopsDiagnosticRun({
      supabase: supabase as never,
      userId: 'user-1',
      diagnostics: null,
      timeline,
      parity,
    })

    expect(inserted).toHaveLength(0)
  })
})
