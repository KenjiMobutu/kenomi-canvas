import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

type QueryBuilder<T = unknown> = PromiseLike<QueryResult<T[]>> & {
  select(columns?: string): QueryBuilder<T>
  eq(field: string, value: unknown): QueryBuilder<T>
  order(field: string, options?: { ascending?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

type HermesBriefRouteSupabase = {
  from(table: string): QueryBuilder<any>
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const result = await (supabase as unknown as HermesBriefRouteSupabase)
    .from('hermes_operator_briefs')
    .select(
      'id, run_id, summary, cash_delta_7d, top_blocker, top_opportunity, best_offer, best_segment, best_source, main_leak, next_best_action, created_at'
    )
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  const row = result.data
  const brief = row
    ? {
        id: String(row.id ?? ''),
        runId: String(row.run_id ?? ''),
        summary: String(row.summary ?? ''),
        cashDelta7d: Number(row.cash_delta_7d ?? 0),
        topBlocker: String(row.top_blocker ?? ''),
        topOpportunity: String(row.top_opportunity ?? ''),
        bestOffer: String(row.best_offer ?? ''),
        bestSegment: String(row.best_segment ?? ''),
        bestSource: String(row.best_source ?? ''),
        mainLeak: String(row.main_leak ?? ''),
        nextBestAction: String(row.next_best_action ?? ''),
        createdAt: String(row.created_at ?? ''),
      }
    : null

  return NextResponse.json({ ok: true, brief })
}
