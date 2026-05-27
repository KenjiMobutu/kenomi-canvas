import { describe, expect, it } from 'vitest'
import { buildDevopsSummaryContext, deriveDevopsSummarySeed } from './summary'
import type { InfraDiagnostics } from '@/lib/infra-diagnostics'
import type { DeploymentParity, InfraOpsTimeline } from '@/lib/infra-ops-timeline'

const baseDiagnostics: InfraDiagnostics = {
  checkedAt: '2026-05-27T10:00:00.000Z',
  runtime: {
    environment: 'production',
    sourceCommit: 'abc123456789',
    commitShort: 'abc1234',
  },
  summary: {
    ok: true,
    checksOk: 3,
    checksTotal: 3,
  },
  services: [
    {
      id: 'ollama',
      label: 'Ollama',
      status: 'ok',
      source: 'settings',
      urlLabel: '192.168.0.14:11434',
      latencyMs: 42,
      lastError: null,
      repairAction: 'Aucune action',
      checkedAt: '2026-05-27T10:00:00.000Z',
    },
    {
      id: 'coolify',
      label: 'Coolify',
      status: 'ok',
      source: 'settings',
      urlLabel: '192.168.0.19:8000/api/v1/version',
      latencyMs: 31,
      lastError: null,
      repairAction: 'Aucune action',
      checkedAt: '2026-05-27T10:00:00.000Z',
    },
  ],
  proxmox: {
    id: 'proxmox',
    label: 'Proxmox',
    status: 'ok',
    source: 'settings',
    urlLabel: '192.168.0.10:8006/api2/json/nodes/proxmox/status',
    latencyMs: 51,
    lastError: null,
    repairAction: 'Aucune action',
    checkedAt: '2026-05-27T10:00:00.000Z',
    detail: '1 node · 4 VMs',
  },
}

const baseTimeline: InfraOpsTimeline = {
  summary: {
    actionsTotal: 1,
    openIncidents: 0,
    lastActionAt: '2026-05-27T10:00:00.000Z',
  },
  events: [],
  incidents: [],
}

const parity: DeploymentParity = {
  status: 'ok',
  runtimeCommit: 'abc1234',
  expectedCommit: 'abc1234',
  message: 'Runtime aligné avec le commit attendu',
}

describe('deriveDevopsSummarySeed', () => {
  it('derives an ok summary with no operator step when diagnostics are healthy', () => {
    const seed = deriveDevopsSummarySeed({
      diagnostics: baseDiagnostics,
      timeline: baseTimeline,
      parity,
    })

    expect(seed).toMatchObject({
      globalStatus: 'ok',
      headline: 'Infra healthy',
      operatorNextStep: 'No immediate action required.',
    })
  })

  it('derives a degraded summary from mismatched deploy parity', () => {
    const seed = deriveDevopsSummarySeed({
      diagnostics: baseDiagnostics,
      timeline: baseTimeline,
      parity: { ...parity, status: 'mismatch', message: 'Runtime différent du commit attendu' },
    })

    expect(seed).toMatchObject({
      globalStatus: 'degraded',
      headline: 'Deployment parity mismatch',
    })
    expect(seed.operatorNextStep).toContain('runtime commit')
  })

  it('derives a down summary from an open incident and service outage', () => {
    const diagnostics = {
      ...baseDiagnostics,
      summary: { ok: false, checksOk: 2, checksTotal: 3 },
      services: [
        {
          ...baseDiagnostics.services[0],
          status: 'down' as const,
          lastError: 'timeout' as const,
        },
        baseDiagnostics.services[1],
      ],
    } satisfies InfraDiagnostics
    const timeline = {
      ...baseTimeline,
      summary: { ...baseTimeline.summary, openIncidents: 1 },
      incidents: [
        {
          id: 'incident-1',
          targetId: 'ollama',
          targetLabel: 'Ollama',
          status: 'open' as const,
          severity: 'error',
          lastError: 'timeout',
          repairAction: 'Verify Ollama reachability on the private host.',
          createdAt: '2026-05-27T10:00:00.000Z',
        },
      ],
    }

    const seed = deriveDevopsSummarySeed({ diagnostics, timeline, parity })

    expect(seed).toMatchObject({
      globalStatus: 'down',
      headline: '1 open infra incident',
    })
    expect(seed.services[0]).toMatchObject({
      id: 'ollama',
      status: 'down',
      severity: 'high',
      reason: 'timeout',
    })
    expect(seed.operatorNextStep).toContain('Ollama')
  })
})

describe('buildDevopsSummaryContext', () => {
  it('formats diagnostics, incidents and parity into compact model context', () => {
    const context = buildDevopsSummaryContext({
      diagnostics: baseDiagnostics,
      timeline: baseTimeline,
      parity,
    })

    expect(context).toContain('DevOps diagnostics snapshot')
    expect(context).toContain('Global status: ok')
    expect(context).toContain('Service checks:')
    expect(context).toContain('- Ollama: ok')
    expect(context).toContain('Deployment parity: ok')
  })
})
