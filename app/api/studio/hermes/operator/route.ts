import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  buildHermesOperatorView,
  type HermesOperatorAlertViewRow,
  type HermesOperatorRecommendationViewRow,
  type HermesOperatorRunViewRow,
  type HermesOperatorSettingsViewRow,
} from '@/lib/studio/hermes-operator-view'

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
  maybeSingle(): Promise<QueryResult<T>>
  upsert?(row: Record<string, unknown>, options?: Record<string, unknown>): QueryBuilder<T>
}

const operatorPatchSchema = z.union([
  z.object({
    mode: z.enum(['observe', 'recommend', 'act']),
  }),
  z.object({
    type: z.literal('dismiss_recommendation'),
    recommendationId: z.string().uuid().or(z.string().min(1)),
  }),
])

type HermesOperatorRouteSupabase = {
  from(table: string): QueryBuilder<any>
}

async function ensureOperatorSettings(input: {
  supabase: HermesOperatorRouteSupabase
  userId: string
  now?: Date
}): Promise<HermesOperatorSettingsViewRow> {
  const existing = await input.supabase
    .from('user_operator_settings')
    .select('operator_mode, notify_in_studio')
    .eq('user_id', input.userId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) {
    return {
      operatorMode: existing.data.operator_mode === 'recommend' || existing.data.operator_mode === 'act'
        ? existing.data.operator_mode
        : 'observe',
      notifyInStudio: existing.data.notify_in_studio !== false,
    }
  }

  const nowIso = (input.now ?? new Date()).toISOString()
  const payload = {
    user_id: input.userId,
    operator_mode: 'observe',
    notify_in_studio: true,
    notify_email: false,
    notify_webhook: false,
    notification_webhook_url: '',
    quiet_hours: {},
    created_at: nowIso,
    updated_at: nowIso,
  }

  if (typeof input.supabase.from('user_operator_settings').upsert === 'function') {
    const insertResult = await input.supabase
      .from('user_operator_settings')
      .upsert?.(payload, { onConflict: 'user_id' })
    if (insertResult?.error) throw new Error(insertResult.error.message)
  }

  return {
    operatorMode: 'observe',
    notifyInStudio: true,
  }
}

async function loadOperatorView(input: {
  supabase: HermesOperatorRouteSupabase
  userId: string
  now?: Date
}) {
  const [settings, runsResult, recommendationsResult, alertsResult] = await Promise.all([
    ensureOperatorSettings(input),
    input.supabase
      .from('hermes_operator_runs')
      .select(
        'id, mode, status, model, summary, alerts_count, enqueued_jobs_count, executed_actions_count, created_at, last_error, input_snapshot'
      )
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(10),
    input.supabase
      .from('hermes_operator_recommendations')
      .select('id, run_id, kind, priority, title, detail, action_type, risk_level, status, created_at')
      .eq('user_id', input.userId)
      .order('priority', { ascending: false })
      .limit(10),
    input.supabase
      .from('business_alerts')
      .select('id, severity, category, headline, detail, status, channel, created_at')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (runsResult.error) throw new Error(runsResult.error.message)
  if (recommendationsResult.error) throw new Error(recommendationsResult.error.message)
  if (alertsResult.error) throw new Error(alertsResult.error.message)

  const runs: HermesOperatorRunViewRow[] = ((runsResult.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      mode: row.mode === 'recommend' || row.mode === 'act' ? row.mode : 'observe',
      status:
        row.status === 'failed' || row.status === 'skipped' ? row.status : 'completed',
      model: String(row.model ?? ''),
      summary: String(row.summary ?? ''),
      alertsCount: Number(row.alerts_count ?? 0),
      enqueuedJobsCount: Number(row.enqueued_jobs_count ?? 0),
      executedActionsCount: Number(row.executed_actions_count ?? 0),
      createdAt: String(row.created_at ?? ''),
      lastError: typeof row.last_error === 'string' ? row.last_error : null,
      snapshot:
        row.input_snapshot && typeof row.input_snapshot === 'object' && !Array.isArray(row.input_snapshot)
          ? {
              prospectsTotal: Number(
                (row.input_snapshot as Record<string, any>)?.prospects?.total ?? 0
              ),
              pendingApprovals: Number(
                (row.input_snapshot as Record<string, any>)?.prospects?.pendingApprovals ?? 0
              ),
              followUpsDue: Number(
                (row.input_snapshot as Record<string, any>)?.prospects?.followUpsDue ?? 0
              ),
              queuedJobs: Number(
                (row.input_snapshot as Record<string, any>)?.automation?.queuedJobs ?? 0
              ),
              failedJobs: Number(
                (row.input_snapshot as Record<string, any>)?.automation?.failedJobs ?? 0
              ),
              replied: Number(
                (row.input_snapshot as Record<string, any>)?.revenue?.conversions?.overview?.replied ??
                  0
              ),
              paid: Number(
                (row.input_snapshot as Record<string, any>)?.revenue?.conversions?.overview?.paid ?? 0
              ),
            }
          : null,
    })
  )
  const recommendations: HermesOperatorRecommendationViewRow[] = (
    (recommendationsResult.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    runId: String(row.run_id ?? ''),
    kind: String(row.kind ?? ''),
    priority: Number(row.priority ?? 0),
    title: String(row.title ?? ''),
    detail: String(row.detail ?? ''),
    actionType: typeof row.action_type === 'string' ? row.action_type : null,
    riskLevel: typeof row.risk_level === 'string' ? row.risk_level : null,
    status: String(row.status ?? 'open'),
    createdAt: String(row.created_at ?? ''),
  }))
  const alerts: HermesOperatorAlertViewRow[] = ((alertsResult.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      severity:
        row.severity === 'critical' || row.severity === 'warn' ? row.severity : 'info',
      category: String(row.category ?? ''),
      headline: String(row.headline ?? ''),
      detail: String(row.detail ?? ''),
      status: String(row.status ?? 'open'),
      channel: String(row.channel ?? 'studio'),
      createdAt: String(row.created_at ?? ''),
    })
  )

  return buildHermesOperatorView({
    settings,
    runs,
    recommendations,
    alerts,
  })
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const view = await loadOperatorView({
    supabase: supabase as unknown as HermesOperatorRouteSupabase,
    userId: user!.id,
    now: new Date(),
  })

  return NextResponse.json({ ok: true, view })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = operatorPatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload operator invalide' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()

  if ('type' in parsed.data) {
    const result = await (supabase as unknown as HermesOperatorRouteSupabase)
      .from('hermes_operator_recommendations')
      .update?.({
        status: 'dismissed',
        updated_at: nowIso,
      })
      .eq('user_id', user!.id)
      .eq('id', parsed.data.recommendationId)

    if (result?.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
  } else {
    const result = await (supabase as unknown as HermesOperatorRouteSupabase)
      .from('user_operator_settings')
      .upsert?.(
        {
          user_id: user!.id,
          operator_mode: parsed.data.mode,
          notify_in_studio: true,
          notify_email: false,
          notify_webhook: false,
          notification_webhook_url: '',
          quiet_hours: {},
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      )

    if (result?.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
  }

  const view = await loadOperatorView({
    supabase: supabase as unknown as HermesOperatorRouteSupabase,
    userId: user!.id,
    now: new Date(),
  })

  return NextResponse.json({ ok: true, view })
}
