import type { InfraDiagnostics } from '@/lib/infra-diagnostics'
import type { DeploymentParity, InfraIncident, InfraOpsTimeline } from '@/lib/infra-ops-timeline'
import { deriveDevopsSummarySeed } from '@/lib/devops/summary'

export type DevopsDiagnosticRunRow = {
  id: string
  summary_status: 'ok' | 'degraded' | 'down'
  checked_at: string
  created_at: string
  summary_payload?: Record<string, unknown> | null
  runtime_payload?: Record<string, unknown> | null
  timeline_payload?: Record<string, unknown> | null
}

export type DevopsSummaryApiView = {
  id: string
  status: 'ok' | 'degraded' | 'down'
  headline: string
  summary: string
  operatorNextStep: string
  checkedAt: string
  createdAt: string
  runtimeCommit: string | null
  parity: DeploymentParity | null
  services: Array<Record<string, unknown>>
  incidents: InfraIncident[]
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function buildDevopsSummaryApiView(input: {
  row: DevopsDiagnosticRunRow | null
}): DevopsSummaryApiView | null {
  const row = input.row
  if (!row) return null

  const summaryPayload = (row.summary_payload ?? {}) as Record<string, unknown>
  const timelinePayload = (row.timeline_payload ?? {}) as Record<string, unknown>
  const runtimePayload = (row.runtime_payload ?? {}) as Record<string, unknown>

  return {
    id: row.id,
    status:
      (summaryPayload.global_status as DevopsSummaryApiView['status'] | undefined) ??
      row.summary_status,
    headline: stringValue(summaryPayload.headline, 'Infra snapshot'),
    summary: stringValue(summaryPayload.summary, 'No DevOps summary available.'),
    operatorNextStep: stringValue(
      summaryPayload.operator_next_step,
      'Review the latest infra diagnostics.'
    ),
    checkedAt: row.checked_at,
    createdAt: row.created_at,
    runtimeCommit: stringValue(runtimePayload.commitShort) || stringValue(runtimePayload.sourceCommit) || null,
    parity: (timelinePayload.parity as DeploymentParity | undefined) ?? null,
    services: arrayValue<Record<string, unknown>>(summaryPayload.services),
    incidents: arrayValue<InfraIncident>(timelinePayload.incidents),
  }
}

function summarizeLiveInfra(input: {
  diagnostics: InfraDiagnostics
  timeline: InfraOpsTimeline
  parity: DeploymentParity | null
}) {
  const seed = deriveDevopsSummarySeed(input)

  if (seed.services.length > 0) {
    const topServices = seed.services
      .slice(0, 2)
      .map((service) => `${service.id}: ${service.reason}`)
      .join(' · ')
    return `Infra ${seed.globalStatus}. ${topServices}`
  }

  if (input.parity?.status === 'mismatch') {
    return input.parity.message
  }

  return 'All monitored services respond normally.'
}

export function reconcileDevopsSummaryApiView(input: {
  diagnostics: InfraDiagnostics
  timeline: InfraOpsTimeline
  parity: DeploymentParity | null
  view: DevopsSummaryApiView | null
}): DevopsSummaryApiView {
  const currentRuntimeCommit =
    input.diagnostics.runtime.commitShort || input.diagnostics.runtime.sourceCommit.slice(0, 7)
  const isStale =
    input.view?.runtimeCommit &&
    currentRuntimeCommit &&
    input.view.runtimeCommit !== currentRuntimeCommit

  if (!input.view || isStale) {
    const seed = deriveDevopsSummarySeed({
      diagnostics: input.diagnostics,
      timeline: input.timeline,
      parity: input.parity,
    })

    return {
      id: input.view?.id ?? 'live',
      status: seed.globalStatus,
      headline: seed.headline,
      summary: summarizeLiveInfra({
        diagnostics: input.diagnostics,
        timeline: input.timeline,
        parity: input.parity,
      }),
      operatorNextStep: seed.operatorNextStep,
      checkedAt: input.diagnostics.checkedAt,
      createdAt: input.view?.createdAt ?? input.diagnostics.checkedAt,
      runtimeCommit: currentRuntimeCommit || null,
      parity: input.parity,
      services: seed.services,
      incidents: input.timeline.incidents,
    }
  }

  return {
    ...input.view,
    checkedAt: input.diagnostics.checkedAt,
    runtimeCommit: currentRuntimeCommit || input.view.runtimeCommit,
    parity: input.parity ?? input.view.parity,
    incidents: input.timeline.incidents.length > 0 ? input.timeline.incidents : input.view.incidents,
  }
}
