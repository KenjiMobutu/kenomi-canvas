import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildStudioOpsSummary } from '@/lib/ops/studio-ops-summary'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [agentRuns, automationRuns, pendingApprovals, failedAutomationRuns] = await Promise.all([
    supabase
      .from('agent_runs')
      .select('created_at', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('automation_runs')
      .select('triggered_at', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('triggered_at', { ascending: false })
      .limit(1),
    supabase
      .from('human_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('status', 'pending'),
    supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .neq('status', 'success'),
  ])

  const firstError = [
    agentRuns.error,
    automationRuns.error,
    pendingApprovals.error,
    failedAutomationRuns.error,
  ].find(Boolean)

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    summary: buildStudioOpsSummary({
      agentRunCount: agentRuns.count ?? 0,
      automationRunCount: automationRuns.count ?? 0,
      pendingApprovalCount: pendingApprovals.count ?? 0,
      failedAutomationRunCount: failedAutomationRuns.count ?? 0,
      staleServiceCount: 0,
      latestAgentRunAt: agentRuns.data?.[0]?.created_at ?? null,
      latestAutomationRunAt: automationRuns.data?.[0]?.triggered_at ?? null,
    }),
  })
}
