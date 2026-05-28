import { randomUUID } from 'node:crypto'
import { persistOperatorAlerts, type HermesAlertsSupabase } from '@/lib/hermes-operator/alerts'
import { buildHermesOperatorContext, type HermesOperatorContextSupabase } from '@/lib/hermes-operator/context'
import {
  runHermesOperatorEngine,
  type HermesOperatorEngineResult,
} from '@/lib/hermes-operator/engine'
import {
  persistOperatorRecommendations,
  type HermesRecommendationsSupabase,
} from '@/lib/hermes-operator/recommendations'
import {
  normalizeOperatorMode,
  type HermesOperatorContextSnapshot,
  type HermesOperatorMode,
} from '@/lib/hermes-operator/types'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  select(columns?: string): QueryBuilder<T>
  eq(field: string, value: unknown): QueryBuilder<T>
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
  order(field: string, options?: { ascending?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  update(row: Record<string, unknown>): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

export interface HermesOperatorRunnerSupabase
  extends HermesOperatorContextSupabase,
    HermesRecommendationsSupabase,
    HermesAlertsSupabase {
  from(table: string): QueryBuilder<any>
}

type HermesContextBuilder = (input: {
  supabase: HermesOperatorContextSupabase
  userId: string
  now?: Date
}) => Promise<HermesOperatorContextSnapshot>

type HermesEngineRunner = (input: {
  context: HermesOperatorContextSnapshot
  mode: HermesOperatorMode
}) => Promise<HermesOperatorEngineResult>

export interface HermesOperatorTickResult {
  runId: string
  mode: HermesOperatorMode
  status: 'completed' | 'failed'
  summary: string
  model: string
  recommendationsCount: number
  alertsCount: number
  fallbackTriggered: boolean
}

function readMode(value: unknown): HermesOperatorMode {
  return normalizeOperatorMode(typeof value === 'string' ? value : null)
}

async function insertRun(
  supabase: HermesOperatorRunnerSupabase,
  row: Record<string, unknown>
): Promise<void> {
  const result = await supabase.from('hermes_operator_runs').insert(row)
  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)
}

export async function runHermesOperatorTick(input: {
  supabase: HermesOperatorRunnerSupabase
  userId: string
  mode?: HermesOperatorMode
  payload?: Record<string, unknown>
  now?: Date
  buildContext?: HermesContextBuilder
  runEngine?: HermesEngineRunner
}): Promise<HermesOperatorTickResult> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const runId = randomUUID()
  const mode = input.mode ?? readMode(input.payload?.mode)
  const buildContext = input.buildContext ?? buildHermesOperatorContext
  const runEngine = input.runEngine ?? runHermesOperatorEngine
  let contextSnapshot: HermesOperatorContextSnapshot | null = null

  try {
    contextSnapshot = await buildContext({
      supabase: input.supabase,
      userId: input.userId,
      now,
    })

    const engineResult = await runEngine({
      context: contextSnapshot,
      mode,
    })

    await insertRun(input.supabase, {
      id: runId,
      user_id: input.userId,
      mode,
      status: 'completed',
      model: engineResult.model,
      model_family: 'hermes',
      input_snapshot: contextSnapshot,
      output_snapshot: {
        recommendations: engineResult.recommendations,
        alerts: engineResult.alerts,
        provider: engineResult.provider,
        fallbackTriggered: engineResult.fallbackTriggered,
      },
      summary: engineResult.summary,
      executed_actions_count: 0,
      enqueued_jobs_count: 0,
      alerts_count: engineResult.alerts.length,
      last_error: null,
      created_at: nowIso,
    })

    await persistOperatorRecommendations({
      supabase: input.supabase,
      userId: input.userId,
      runId,
      recommendations: engineResult.recommendations,
      now,
    })

    await persistOperatorAlerts({
      supabase: input.supabase,
      userId: input.userId,
      runId,
      alerts: engineResult.alerts,
      now,
    })

    return {
      runId,
      mode,
      status: 'completed',
      summary: engineResult.summary,
      model: engineResult.model,
      recommendationsCount: engineResult.recommendations.length,
      alertsCount: engineResult.alerts.length,
      fallbackTriggered: engineResult.fallbackTriggered,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await insertRun(input.supabase, {
      id: runId,
      user_id: input.userId,
      mode,
      status: 'failed',
      model: process.env.HERMES_DEFAULT_MODEL ?? 'hermes3:8b',
      model_family: 'hermes',
      input_snapshot: contextSnapshot ?? {},
      output_snapshot: {},
      summary: 'Hermes Operator run failed.',
      executed_actions_count: 0,
      enqueued_jobs_count: 0,
      alerts_count: 0,
      last_error: message,
      created_at: nowIso,
    })

    throw error
  }
}
