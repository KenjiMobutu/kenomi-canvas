type DiagnosticStatus = 'ok' | 'degraded' | 'down'

export type InfrastructurePanelLogEntry = {
  id: string
  severity: 'info' | 'warn' | 'error'
  label: string
  message: string
  createdAt: string
}

export type InfrastructurePanelDeployEntry = {
  id: string
  status: 'ok' | 'mismatch' | 'unknown'
  label: string
  detail: string
  commit: string
  createdAt: string
}

type InfraEvent = {
  id: string
  type: string
  severity: string
  message: string
  createdAt: string
}

type InfraIncident = {
  id: string
  targetLabel: string
  severity: string
  lastError: string
  createdAt: string
}

type DeploymentParity = {
  status: 'ok' | 'mismatch' | 'unknown'
  runtimeCommit: string
  expectedCommit: string
  message: string
}

type DevopsSummary = {
  headline: string
  summary: string
  checkedAt: string
  runtimeCommit: string | null
}

export function buildInfrastructureLogEntries(input: {
  events?: InfraEvent[] | null
  incidents?: InfraIncident[] | null
  devopsSummary?: DevopsSummary | null
}): InfrastructurePanelLogEntry[] {
  const events = input.events ?? []
  if (events.length > 0) {
    return events.slice(0, 6).map((event) => ({
      id: event.id,
      severity:
        event.severity === 'error' ? 'error' : event.severity === 'warn' ? 'warn' : 'info',
      label: event.type,
      message: event.message,
      createdAt: event.createdAt,
    }))
  }

  const incidents = input.incidents ?? []
  if (incidents.length > 0) {
    return incidents.slice(0, 6).map((incident) => ({
      id: incident.id,
      severity:
        incident.severity === 'error' ? 'error' : incident.severity === 'warn' ? 'warn' : 'info',
      label: incident.targetLabel,
      message: incident.lastError,
      createdAt: incident.createdAt,
    }))
  }

  if (input.devopsSummary) {
    return [
      {
        id: 'devops-summary',
        severity: 'info',
        label: input.devopsSummary.headline,
        message: input.devopsSummary.summary,
        createdAt: input.devopsSummary.checkedAt,
      },
    ]
  }

  return []
}

export function buildInfrastructureDeployEntries(input: {
  parity?: DeploymentParity | null
  devopsSummary?: DevopsSummary | null
  checkedAt?: string | null
}): InfrastructurePanelDeployEntry[] {
  const entries: InfrastructurePanelDeployEntry[] = []
  const timestamp = input.devopsSummary?.checkedAt ?? input.checkedAt ?? new Date(0).toISOString()

  if (input.parity) {
    entries.push({
      id: 'runtime-parity',
      status: input.parity.status,
      label: 'Runtime parity',
      detail: input.parity.message,
      commit: input.parity.runtimeCommit || '—',
      createdAt: timestamp,
    })

    if (input.parity.expectedCommit && input.parity.expectedCommit !== 'non configuré') {
      entries.push({
        id: 'expected-commit',
        status: input.parity.status === 'ok' ? 'ok' : 'unknown',
        label: 'Expected commit',
        detail: 'Expected deployment target',
        commit: input.parity.expectedCommit,
        createdAt: timestamp,
      })
    }
  } else if (input.devopsSummary?.runtimeCommit) {
    entries.push({
      id: 'runtime-commit',
      status: 'unknown',
      label: 'Runtime commit',
      detail: 'Current live runtime',
      commit: input.devopsSummary.runtimeCommit,
      createdAt: timestamp,
    })
  }

  return entries.slice(0, 6)
}

export function infrastructureStatusColor(
  status: 'ok' | 'mismatch' | 'unknown' | DiagnosticStatus | 'info' | 'warn' | 'error'
): 'emerald' | 'amber' | 'rose' | 'muted' {
  if (status === 'ok' || status === 'info') return 'emerald'
  if (status === 'mismatch' || status === 'down' || status === 'error') return 'rose'
  if (status === 'degraded' || status === 'warn' || status === 'unknown') return 'amber'
  return 'muted'
}
