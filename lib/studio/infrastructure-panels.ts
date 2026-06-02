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

function mapPanelSeverity(value: string): InfrastructurePanelLogEntry['severity'] {
  return value === 'error' ? 'error' : value === 'warn' ? 'warn' : 'info'
}

export function buildInfrastructureLogEntries(input: {
  events?: InfraEvent[] | null
  incidents?: InfraIncident[] | null
  devopsSummary?: DevopsSummary | null
}): InfrastructurePanelLogEntry[] {
  const entries: InfrastructurePanelLogEntry[] = []

  const events = input.events ?? []
  entries.push(
    ...events.map((event) => ({
      id: event.id,
      severity: mapPanelSeverity(event.severity),
      label: event.type,
      message: event.message,
      createdAt: event.createdAt,
    }))
  )

  const incidents = input.incidents ?? []
  entries.push(
    ...incidents.map((incident) => ({
      id: incident.id,
      severity: mapPanelSeverity(incident.severity),
      label: incident.targetLabel,
      message: incident.lastError,
      createdAt: incident.createdAt,
    }))
  )

  if (input.devopsSummary) {
    entries.push({
      id: 'devops-summary',
      severity: 'info',
      label: input.devopsSummary.headline,
      message: input.devopsSummary.summary,
      createdAt: input.devopsSummary.checkedAt,
    })
  }

  return entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
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

    if (input.parity.runtimeCommit) {
      entries.push({
        id: 'runtime-commit',
        status: input.parity.status === 'ok' ? 'ok' : 'unknown',
        label: 'Live runtime',
        detail: 'Current live runtime commit',
        commit: input.parity.runtimeCommit,
        createdAt: timestamp,
      })
    }

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

  return entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
}

export function infrastructureStatusColor(
  status: 'ok' | 'mismatch' | 'unknown' | DiagnosticStatus | 'info' | 'warn' | 'error'
): 'emerald' | 'amber' | 'rose' | 'muted' {
  if (status === 'ok' || status === 'info') return 'emerald'
  if (status === 'mismatch' || status === 'down' || status === 'error') return 'rose'
  if (status === 'degraded' || status === 'warn' || status === 'unknown') return 'amber'
  return 'muted'
}
