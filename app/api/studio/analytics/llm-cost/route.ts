import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'

interface AgentRunRow {
  agent_id: string
  cost_usd: number | string | null
  total_tokens: number | null
  model: string
  created_at: string
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('agent_runs')
    .select('agent_id, cost_usd, total_tokens, model, created_at')
    .eq('user_id', user!.id)
    .not('cost_usd', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as AgentRunRow[]

  function toNumber(value: unknown): number {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const totalUsd = rows.reduce((sum, r) => sum + toNumber(r.cost_usd), 0)
  const totalTokens = rows.reduce((sum, r) => sum + toNumber(r.total_tokens), 0)

  const byAgent = new Map<string, { agent_id: string; cost_usd: number; runs: number }>()
  rows.forEach((r) => {
    const agg = byAgent.get(r.agent_id) ?? { agent_id: r.agent_id, cost_usd: 0, runs: 0 }
    agg.cost_usd += toNumber(r.cost_usd)
    agg.runs += 1
    byAgent.set(r.agent_id, agg)
  })

  return NextResponse.json({
    ok: true,
    totalUsd,
    totalTokens,
    runCount: rows.length,
    byAgent: Array.from(byAgent.values()).sort((a, b) => b.cost_usd - a.cost_usd),
  })
}
