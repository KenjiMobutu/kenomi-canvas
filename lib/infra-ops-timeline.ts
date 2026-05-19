import type { DiagnosticStatus, InfraDiagnostics, RuntimeDiagnostic } from './infra-diagnostics'

export type InfraOpsEventRow = {
  id: string
  event_type: string
  severity: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export type InfraOpsTimelineEvent = {
  id: string
  type: string
  severity: string
  targetId: string
  targetLabel: string
  status: DiagnosticStatus | 'unknown'
  message: string
  createdAt: string
}

export type InfraIncident = {
  id: string
  targetId: string
  targetLabel: string
  status: 'open' | 'resolved'
  severity: string
  lastError: string
  repairAction: string
  createdAt: string
}

export type InfraOpsTimeline = {
  summary: {
    actionsTotal: number
    openIncidents: number
    lastActionAt: string | null
  }
  events: InfraOpsTimelineEvent[]
  incidents: InfraIncident[]
}

export type DeploymentParity = {
  status: 'ok' | 'mismatch' | 'unknown'
  runtimeCommit: string
  expectedCommit: string
  message: string
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function statusValue(value: unknown): DiagnosticStatus | 'unknown' {
  return value === 'ok' || value === 'degraded' || value === 'down' ? value : 'unknown'
}

function actionType(eventType: string): string {
  return eventType.replace(/^infra\.diagnostic\./, '')
}

function currentStatuses(diagnostics: InfraDiagnostics): Map<string, DiagnosticStatus> {
  return new Map(
    [...diagnostics.services, diagnostics.proxmox].map((line) => [line.id, line.status])
  )
}

function eventMessage(input: {
  targetLabel: string
  status: DiagnosticStatus | 'unknown'
  lastError: string
  repairAction: string
}): string {
  const suffix = input.lastError || input.repairAction
  return `${input.targetLabel} · ${input.status} · ${suffix}`
}

export function buildInfraOpsTimeline(input: {
  events: InfraOpsEventRow[]
  diagnostics: InfraDiagnostics
}): InfraOpsTimeline {
  const statuses = currentStatuses(input.diagnostics)
  const infraEvents = input.events.filter((event) =>
    event.event_type.startsWith('infra.diagnostic.')
  )

  const events = infraEvents.map((event) => {
    const metadata = event.metadata ?? {}
    const targetId = textValue(metadata.target_id, 'unknown')
    const targetLabel = textValue(metadata.target_label, targetId)
    const status = statusValue(metadata.status)
    const lastError = textValue(metadata.last_error, '')
    const repairAction = textValue(metadata.repair_action, 'Aucune action')

    return {
      id: event.id,
      type: actionType(event.event_type),
      severity: event.severity,
      targetId,
      targetLabel,
      status,
      message: eventMessage({ targetLabel, status, lastError, repairAction }),
      createdAt: event.created_at,
    }
  })

  const incidents = infraEvents
    .filter((event) => event.event_type === 'infra.diagnostic.record_incident')
    .map((event) => {
      const metadata = event.metadata ?? {}
      const targetId = textValue(metadata.target_id, 'unknown')
      const targetLabel = textValue(metadata.target_label, targetId)
      const currentStatus = statuses.get(targetId)
      const incidentStatus: 'open' | 'resolved' = currentStatus === 'ok' ? 'resolved' : 'open'

      return {
        id: event.id,
        targetId,
        targetLabel,
        status: incidentStatus,
        severity: event.severity,
        lastError: textValue(metadata.last_error, 'Erreur non renseignée'),
        repairAction: textValue(metadata.repair_action, 'Recheck puis vérifier la configuration'),
        createdAt: event.created_at,
      }
    })

  return {
    summary: {
      actionsTotal: events.length,
      openIncidents: incidents.filter((incident) => incident.status === 'open').length,
      lastActionAt: events[0]?.createdAt ?? null,
    },
    events,
    incidents,
  }
}

export function buildDeploymentParity(input: {
  runtime: RuntimeDiagnostic
  expectedCommit?: string | null
}): DeploymentParity {
  const runtimeCommit = input.runtime.commitShort || input.runtime.sourceCommit.slice(0, 7)
  const expected = input.expectedCommit?.trim() || null

  if (!expected) {
    return {
      status: 'unknown',
      runtimeCommit,
      expectedCommit: 'non configuré',
      message: 'SOURCE_COMMIT attendu non configuré côté déploiement',
    }
  }

  const expectedCommit = expected.slice(0, 7)
  const status = runtimeCommit === expectedCommit ? 'ok' : 'mismatch'

  return {
    status,
    runtimeCommit,
    expectedCommit,
    message:
      status === 'ok'
        ? 'Runtime aligné avec le commit attendu'
        : 'Runtime différent du commit attendu',
  }
}
