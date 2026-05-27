import type { InfraDiagnostics, InfraDiagnosticLine, ProxmoxDiagnosticLine } from '@/lib/infra-diagnostics'
import type { DeploymentParity, InfraIncident, InfraOpsTimeline } from '@/lib/infra-ops-timeline'

export type DevopsServiceSummary = {
  id: string
  status: 'ok' | 'degraded' | 'down'
  severity: 'low' | 'medium' | 'high'
  reason: string
  next_step: string
}

export type DevopsSummarySeed = {
  globalStatus: 'ok' | 'degraded' | 'down'
  headline: string
  services: DevopsServiceSummary[]
  operatorNextStep: string
}

function toSeverity(status: 'ok' | 'degraded' | 'down'): DevopsServiceSummary['severity'] {
  if (status === 'down') return 'high'
  if (status === 'degraded') return 'medium'
  return 'low'
}

function summarizeLine(
  line: InfraDiagnosticLine | ProxmoxDiagnosticLine
): DevopsServiceSummary | null {
  if (line.status === 'ok') return null
  return {
    id: line.id,
    status: line.status,
    severity: toSeverity(line.status),
    reason: line.lastError || `${line.label} unavailable`,
    next_step: line.repairAction,
  }
}

function summarizeIncident(incident: InfraIncident): DevopsServiceSummary {
  return {
    id: incident.targetId,
    status: 'down',
    severity: incident.severity === 'error' ? 'high' : 'medium',
    reason: incident.lastError,
    next_step: incident.repairAction,
  }
}

function dedupeServices(services: DevopsServiceSummary[]): DevopsServiceSummary[] {
  const map = new Map<string, DevopsServiceSummary>()
  for (const service of services) {
    const existing = map.get(service.id)
    if (!existing) {
      map.set(service.id, service)
      continue
    }
    const rank = { low: 1, medium: 2, high: 3 }
    if (rank[service.severity] >= rank[existing.severity]) {
      map.set(service.id, service)
    }
  }
  return [...map.values()]
}

export function deriveDevopsSummarySeed(input: {
  diagnostics: InfraDiagnostics
  timeline: InfraOpsTimeline
  parity?: DeploymentParity | null
}): DevopsSummarySeed {
  const incidentServices = input.timeline.incidents
    .filter((incident) => incident.status === 'open')
    .map(summarizeIncident)
  const diagnosticServices = [...input.diagnostics.services, input.diagnostics.proxmox]
    .map(summarizeLine)
    .filter((service): service is DevopsServiceSummary => Boolean(service))
  const services = dedupeServices([...incidentServices, ...diagnosticServices])

  if (services.length > 0) {
    return {
      globalStatus: services.some((service) => service.status === 'down') ? 'down' : 'degraded',
      headline:
        input.timeline.summary.openIncidents > 0
          ? `${input.timeline.summary.openIncidents} open infra incident${input.timeline.summary.openIncidents > 1 ? 's' : ''}`
          : `${services.length} degraded service${services.length > 1 ? 's' : ''}`,
      services,
      operatorNextStep: `Check ${services[0].id === 'proxmox' ? 'Proxmox' : services[0].id.charAt(0).toUpperCase() + services[0].id.slice(1)} first: ${services[0].next_step}`,
    }
  }

  if (input.parity?.status === 'mismatch') {
    return {
      globalStatus: 'degraded',
      headline: 'Deployment parity mismatch',
      services: [],
      operatorNextStep: 'Verify the runtime commit against the expected deploy commit.',
    }
  }

  return {
    globalStatus: 'ok',
    headline: 'Infra healthy',
    services: [],
    operatorNextStep: 'No immediate action required.',
  }
}

function lineSummary(line: InfraDiagnosticLine | ProxmoxDiagnosticLine): string {
  return `- ${line.label}: ${line.status} · ${line.lastError || `${line.latencyMs}ms`} · next: ${line.repairAction}`
}

export function buildDevopsSummaryContext(input: {
  diagnostics: InfraDiagnostics
  timeline: InfraOpsTimeline
  parity?: DeploymentParity | null
}): string {
  const seed = deriveDevopsSummarySeed(input)
  const incidentLines =
    input.timeline.incidents.length > 0
      ? input.timeline.incidents
          .slice(0, 4)
          .map(
            (incident) =>
              `- ${incident.targetLabel}: ${incident.status} · ${incident.lastError} · next: ${incident.repairAction}`
          )
          .join('\n')
      : '- none'

  return [
    'DevOps diagnostics snapshot',
    `Checked at: ${input.diagnostics.checkedAt}`,
    `Global status: ${seed.globalStatus}`,
    `Headline: ${seed.headline}`,
    `Operator next step: ${seed.operatorNextStep}`,
    '',
    'Service checks:',
    ...input.diagnostics.services.map(lineSummary),
    lineSummary(input.diagnostics.proxmox),
    '',
    `Deployment parity: ${input.parity?.status ?? 'unknown'} · ${input.parity?.message ?? 'No parity data'}`,
    '',
    'Recent incidents:',
    incidentLines,
  ].join('\n')
}
