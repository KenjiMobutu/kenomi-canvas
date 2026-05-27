import type { RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import type { InfraDiagnostics } from '@/lib/infra-diagnostics'
import type { DeploymentParity, InfraOpsTimeline } from '@/lib/infra-ops-timeline'

export type DevopsSummaryStatus = 'ok' | 'degraded' | 'down'

function deriveSummaryStatus(diagnostics: InfraDiagnostics): DevopsSummaryStatus {
  const rows = [...diagnostics.services, diagnostics.proxmox]
  if (rows.some((row) => row.status === 'down')) return 'down'
  if (rows.some((row) => row.status === 'degraded') || !diagnostics.summary.ok) return 'degraded'
  return 'ok'
}

export function buildDevopsDiagnosticRunRow(input: {
  userId: string
  diagnostics: InfraDiagnostics | null
  timeline: InfraOpsTimeline | null
  parity?: DeploymentParity | null
  summaryPayload?: Record<string, unknown> | null
}): Record<string, unknown> | null {
  if (!input.diagnostics || !input.timeline) return null

  return {
    user_id: input.userId,
    summary_status: deriveSummaryStatus(input.diagnostics),
    checked_at: input.diagnostics.checkedAt,
    runtime_payload: input.diagnostics.runtime,
    summary_payload: input.summaryPayload ?? null,
    services_payload: {
      summary: input.diagnostics.summary,
      services: input.diagnostics.services,
    },
    proxmox_payload: input.diagnostics.proxmox,
    timeline_payload: {
      summary: input.timeline.summary,
      events: input.timeline.events,
      incidents: input.timeline.incidents,
      parity: input.parity ?? null,
    },
    created_at: input.diagnostics.checkedAt,
  }
}

export async function appendDevopsDiagnosticRun(input: {
  supabase: RunAgentStepSupabase
  userId: string
  diagnostics: InfraDiagnostics | null
  timeline: InfraOpsTimeline | null
  parity?: DeploymentParity | null
  summaryPayload?: Record<string, unknown> | null
}): Promise<void> {
  const row = buildDevopsDiagnosticRunRow(input)
  if (!row) return

  const { error } = await input.supabase.from('devops_diagnostic_runs').insert(row)
  if (error) throw new Error(error.message)
}
