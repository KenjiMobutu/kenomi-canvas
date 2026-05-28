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
}

type HermesNotificationsRouteSupabase = {
  from(table: string): QueryBuilder<any>
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const result = await (supabase as unknown as HermesNotificationsRouteSupabase)
    .from('business_alerts')
    .select('id, severity, category, headline, detail, status, channel, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    alerts: (result.data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      severity: row.severity === 'critical' || row.severity === 'warn' ? row.severity : 'info',
      category: String(row.category ?? ''),
      headline: String(row.headline ?? ''),
      detail: String(row.detail ?? ''),
      status: String(row.status ?? 'open'),
      channel: String(row.channel ?? 'studio'),
      createdAt: String(row.created_at ?? ''),
    })),
  })
}
