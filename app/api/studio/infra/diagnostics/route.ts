import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
import {
  buildDevopsSummaryApiView,
  reconcileDevopsSummaryApiView,
  type DevopsDiagnosticRunRow,
} from '@/lib/devops/api-view'
import {
  buildDeploymentParity,
  buildInfraOpsTimeline,
  type InfraOpsEventRow,
} from '@/lib/infra-ops-timeline'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const diagnostics = await collectInfraDiagnostics({
    supabase: supabase as unknown as InfraDiagnosticsSupabase,
    userId: user!.id,
  })

  const { data: latestRun } = await supabase
    .from('devops_diagnostic_runs')
    .select(
      'id,summary_status,checked_at,created_at,summary_payload,runtime_payload,timeline_payload'
    )
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: events } = await supabase
    .from('agent_events')
    .select('id,event_type,severity,metadata,created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(40)

  const timeline = buildInfraOpsTimeline({
    events: (events ?? []) as InfraOpsEventRow[],
    diagnostics,
  })
  const parity = buildDeploymentParity({
    runtime: diagnostics.runtime,
    expectedCommit: process.env.EXPECTED_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
  })
  const devopsSummary = reconcileDevopsSummaryApiView({
    diagnostics,
    timeline,
    parity,
    view: buildDevopsSummaryApiView({
      row: (latestRun as DevopsDiagnosticRunRow | null) ?? null,
    }),
  })

  return NextResponse.json(
    {
      ...diagnostics,
      devopsSummary,
      recentIncidents: devopsSummary.incidents.slice(0, 6),
      deploymentParity: devopsSummary.parity ?? null,
    },
    { status: diagnostics.summary.ok ? 200 : 207 }
  )
}
