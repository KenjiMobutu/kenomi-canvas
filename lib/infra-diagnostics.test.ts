import { describe, expect, it } from 'vitest'
import {
  buildInfraDiagnostics,
  maskDiagnosticUrl,
  resolveSettingSource,
  summarizeRuntime,
} from './infra-diagnostics'

describe('infra diagnostics', () => {
  it('renders diagnostic URLs without leaking query parameters', () => {
    expect(maskDiagnosticUrl('http://192.168.0.14:11434/api/tags?token=secret')).toBe(
      '192.168.0.14:11434/api/tags'
    )
    expect(maskDiagnosticUrl('https://supabase.kenomi.eu/rest/v1/')).toBe(
      'supabase.kenomi.eu/rest/v1/'
    )
  })

  it('marks settings values as user configured and env fallback otherwise', () => {
    expect(resolveSettingSource('http://192.168.0.14:11434')).toBe('settings')
    expect(resolveSettingSource('')).toBe('env')
    expect(resolveSettingSource(null)).toBe('env')
  })

  it('summarizes runtime commits for operator display', () => {
    expect(
      summarizeRuntime({
        NODE_ENV: 'production',
        SOURCE_COMMIT: '6f240dd510761dc430d621580001787d46769d3c',
      })
    ).toEqual({
      environment: 'production',
      sourceCommit: '6f240dd510761dc430d621580001787d46769d3c',
      commitShort: '6f240dd',
    })
  })

  it('builds smoke and repair actions from service and proxmox signals', () => {
    const diagnostics = buildInfraDiagnostics({
      checkedAt: '2026-05-19T13:30:00.000Z',
      runtime: {
        environment: 'production',
        sourceCommit: '6f240dd510761dc430d621580001787d46769d3c',
        commitShort: '6f240dd',
      },
      services: [
        {
          id: 'ollama',
          label: 'Ollama',
          url: 'http://192.168.0.14:11434/api/tags',
          source: 'settings',
          ok: true,
          latencyMs: 24,
        },
        {
          id: 'n8n',
          label: 'n8n',
          url: 'https://n8n.kenomi.eu/healthz',
          source: 'env',
          ok: false,
          latencyMs: 5000,
          error: 'This operation was aborted',
        },
      ],
      proxmox: {
        ok: true,
        url: 'https://192.168.0.10:8006/api2/json/nodes/proxmox/status',
        source: 'settings',
        latencyMs: 41,
        vmCount: 3,
        nodeCount: 1,
      },
    })

    expect(diagnostics.summary).toEqual({ ok: false, checksOk: 2, checksTotal: 3 })
    expect(diagnostics.services[0]).toMatchObject({
      id: 'ollama',
      status: 'ok',
      repairAction: 'Aucune action',
      urlLabel: '192.168.0.14:11434/api/tags',
    })
    expect(diagnostics.services[1]).toMatchObject({
      id: 'n8n',
      status: 'down',
      repairAction: 'Verifier URL n8n / DNS / container Coolify',
      lastError: 'This operation was aborted',
    })
    expect(diagnostics.proxmox).toMatchObject({
      status: 'ok',
      repairAction: 'Aucune action',
      detail: '1 node · 3 VMs',
    })
  })
})
