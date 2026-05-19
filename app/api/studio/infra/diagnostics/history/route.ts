import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
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

  const { data } = await supabase
    .from('agent_events')
    .select('id,event_type,severity,metadata,created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(40)

  const timeline = buildInfraOpsTimeline({
    events: (data ?? []) as InfraOpsEventRow[],
    diagnostics,
  })
  const parity = buildDeploymentParity({
    runtime: diagnostics.runtime,
    expectedCommit: process.env.EXPECTED_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
  })

  return NextResponse.json({
    checkedAt: diagnostics.checkedAt,
    summary: timeline.summary,
    events: timeline.events.slice(0, 10),
    incidents: timeline.incidents.slice(0, 6),
    parity,
  })
}
