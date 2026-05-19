import type { DiagnosticStatus, InfraDiagnosticLine } from './infra-diagnostics'

export type InfraDiagnosticActionId = 'recheck' | 'record_incident'
export type InfraDiagnosticActionCode = 'rechecked' | 'incident_recorded'

export type InfraDiagnosticAction = {
  id: InfraDiagnosticActionId
  label: string
  tone: 'primary' | 'warning'
}

export type InfraDiagnosticActionRequest = {
  action: InfraDiagnosticActionId
  targetId: string
}

export type InfraDiagnosticActionResult = {
  ok: boolean
  code: InfraDiagnosticActionCode
  message: string
  targetId: string
  checkedAt: string
}

export type InfraDiagnosticActionAudit = {
  eventType: string
  severity: 'info' | 'warn' | 'error'
  metadata: Record<string, unknown>
}

const ACTIONS: Record<InfraDiagnosticActionId, InfraDiagnosticAction> = {
  recheck: {
    id: 'recheck',
    label: 'Recheck',
    tone: 'primary',
  },
  record_incident: {
    id: 'record_incident',
    label: 'Tracer',
    tone: 'warning',
  },
}

function severityForStatus(status: DiagnosticStatus): 'info' | 'warn' | 'error' {
  if (status === 'ok') return 'info'
  if (status === 'degraded') return 'warn'
  return 'error'
}

export function getDiagnosticActions(line: InfraDiagnosticLine): InfraDiagnosticAction[] {
  const actions = [ACTIONS.recheck]
  if (line.status !== 'ok') actions.push(ACTIONS.record_incident)
  return actions
}

export function parseDiagnosticActionRequest(input: unknown): InfraDiagnosticActionRequest {
  const payload = input as Partial<InfraDiagnosticActionRequest> | null
  const action = payload?.action
  const targetId = payload?.targetId

  if (
    (action !== 'recheck' && action !== 'record_incident') ||
    typeof targetId !== 'string' ||
    !/^[a-z0-9_-]{2,40}$/i.test(targetId)
  ) {
    throw new Error('Payload action diagnostic invalide')
  }

  return { action, targetId }
}

export function buildDiagnosticActionResult(input: {
  action: InfraDiagnosticActionId
  target: InfraDiagnosticLine
}): InfraDiagnosticActionResult {
  if (input.action === 'record_incident') {
    return {
      ok: true,
      code: 'incident_recorded',
      message: `Incident trace pour ${input.target.label} · ${
        input.target.lastError ?? input.target.repairAction
      }`,
      targetId: input.target.id,
      checkedAt: input.target.checkedAt,
    }
  }

  return {
    ok: true,
    code: 'rechecked',
    message: `${input.target.label} recheck ${input.target.status.toUpperCase()} · ${
      input.target.latencyMs
    }ms`,
    targetId: input.target.id,
    checkedAt: input.target.checkedAt,
  }
}

export function buildDiagnosticActionAudit(input: {
  action: InfraDiagnosticActionId
  target: InfraDiagnosticLine
}): InfraDiagnosticActionAudit {
  const result = buildDiagnosticActionResult(input)
  return {
    eventType: `infra.diagnostic.${input.action}`,
    severity:
      input.action === 'record_incident' ? severityForStatus(input.target.status) : 'info',
    metadata: {
      action: input.action,
      action_label: ACTIONS[input.action].label,
      checked_at: input.target.checkedAt,
      operator_message: result.message,
      target_id: input.target.id,
      target_label: input.target.label,
      status: input.target.status,
      source: input.target.source,
      url_label: input.target.urlLabel,
      latency_ms: input.target.latencyMs,
      last_error: input.target.lastError,
      repair_action: input.target.repairAction,
    },
  }
}
