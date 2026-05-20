import { describe, expect, it } from 'vitest'
import {
  buildDiagnosticActionAudit,
  buildDiagnosticActionResult,
  getDiagnosticActions,
  parseDiagnosticActionRequest,
} from './infra-diagnostic-actions'
import type { InfraDiagnosticLine } from './infra-diagnostics'

const okLine: InfraDiagnosticLine = {
  id: 'ollama',
  label: 'Ollama',
  status: 'ok',
  source: 'settings',
  urlLabel: '192.168.0.14:11434/api/tags',
  latencyMs: 24,
  lastError: null,
  repairAction: 'Aucune action',
  checkedAt: '2026-05-19T13:30:00.000Z',
}

const downLine: InfraDiagnosticLine = {
  id: 'n8n',
  label: 'n8n',
  status: 'down',
  source: 'settings',
  urlLabel: 'n8n.kenomi.eu/healthz',
  latencyMs: 5000,
  lastError: 'This operation was aborted',
  repairAction: 'Verifier URL n8n / DNS / container Coolify',
  checkedAt: '2026-05-19T13:30:00.000Z',
}

describe('infra diagnostic actions', () => {
  it('offers recheck for healthy rows and incident recording for unhealthy rows', () => {
    expect(getDiagnosticActions(okLine).map((action) => action.id)).toEqual(['recheck'])
    expect(getDiagnosticActions(downLine).map((action) => action.id)).toEqual([
      'recheck',
      'record_incident',
    ])
  })

  it('validates action requests without accepting unknown commands', () => {
    expect(parseDiagnosticActionRequest({ action: 'recheck', targetId: 'n8n' })).toEqual({
      action: 'recheck',
      targetId: 'n8n',
    })

    expect(() => parseDiagnosticActionRequest({ action: 'restart', targetId: 'n8n' })).toThrow(
      'Payload action diagnostic invalide'
    )
  })

  it('builds calm operator-facing results', () => {
    expect(
      buildDiagnosticActionResult({
        action: 'recheck',
        target: okLine,
      })
    ).toMatchObject({
      ok: true,
      code: 'rechecked',
      message: 'Ollama recheck OK · 24ms',
    })

    expect(
      buildDiagnosticActionResult({
        action: 'record_incident',
        target: downLine,
      })
    ).toMatchObject({
      ok: true,
      code: 'incident_recorded',
      message: 'Incident trace pour n8n · This operation was aborted',
    })
  })

  it('builds audit metadata without leaking raw secrets', () => {
    expect(
      buildDiagnosticActionAudit({
        action: 'record_incident',
        target: downLine,
      })
    ).toEqual({
      eventType: 'infra.diagnostic.record_incident',
      severity: 'error',
      metadata: {
        action: 'record_incident',
        action_label: 'Tracer',
        checked_at: '2026-05-19T13:30:00.000Z',
        operator_message: 'Incident trace pour n8n · This operation was aborted',
        target_id: 'n8n',
        target_label: 'n8n',
        status: 'down',
        source: 'settings',
        url_label: 'n8n.kenomi.eu/healthz',
        latency_ms: 5000,
        last_error: 'This operation was aborted',
        repair_action: 'Verifier URL n8n / DNS / container Coolify',
      },
    })
  })
})
