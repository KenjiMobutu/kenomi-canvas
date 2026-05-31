import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
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
  update?(row: Record<string, unknown>): QueryBuilder<T>
}

type HermesNotificationsRouteSupabase = {
  from(table: string): QueryBuilder<any>
}

const notificationsPatchSchema = z.object({
  type: z.enum(['resolve_alert', 'mute_alert']),
  alertId: z.string().uuid().or(z.string().min(1)),
})

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

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = notificationsPatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload alert invalide' }, { status: 400 })
  }

  const nextStatus = parsed.data.type === 'resolve_alert' ? 'resolved' : 'muted'
  const nowIso = new Date().toISOString()
  const result = await (supabase as unknown as HermesNotificationsRouteSupabase)
    .from('business_alerts')
    .update?.({
      status: nextStatus,
      updated_at: nowIso,
    })
    .eq('user_id', user!.id)
    .eq('id', parsed.data.alertId)

  if (result?.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  const refreshed = await (supabase as unknown as HermesNotificationsRouteSupabase)
    .from('business_alerts')
    .select('id, severity, category, headline, detail, status, channel, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (refreshed.error) {
    return NextResponse.json({ error: refreshed.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    alerts: (refreshed.data ?? []).map((row: Record<string, unknown>) => ({
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
