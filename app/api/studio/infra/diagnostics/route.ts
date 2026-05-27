import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
import { buildDevopsSummaryApiView, type DevopsDiagnosticRunRow } from '@/lib/devops/api-view'

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

  const devopsSummary = buildDevopsSummaryApiView({
    row: (latestRun as DevopsDiagnosticRunRow | null) ?? null,
  })

  return NextResponse.json(
    {
      ...diagnostics,
      devopsSummary,
      recentIncidents: devopsSummary?.incidents.slice(0, 6) ?? [],
      deploymentParity: devopsSummary?.parity ?? null,
    },
    { status: diagnostics.summary.ok ? 200 : 207 }
  )
}
