import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { selectDueAgentRuns } from '@/lib/agent-orchestration'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_ORCHESTRATOR_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  const cronAuthorized = isCronAuthorized(req)

  if (cronAuthorized) {
    return NextResponse.json(
      { ok: false, error: 'Cron orchestration requires service-role scoping — not yet implemented' },
      { status: 501 }
    )
  }

  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('agent_schedules')
    .select('id, agent_id, enabled, next_run_at, requires_human_approval')
    .eq('user_id', user!.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = selectDueAgentRuns(data ?? [])
  return NextResponse.json({ ok: true, due })
}
