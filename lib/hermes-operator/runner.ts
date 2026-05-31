import { randomUUID } from 'node:crypto'
import {
  dispatchOperatorNotifications,
  type HermesNotificationSupabase,
} from '@/lib/hermes-operator/notifications'
import { persistOperatorAlerts, type HermesAlertsSupabase } from '@/lib/hermes-operator/alerts'
import { buildHermesOperatorContext, type HermesOperatorContextSupabase } from '@/lib/hermes-operator/context'
import {
  runHermesOperatorEngine,
  type HermesOperatorEngineResult,
} from '@/lib/hermes-operator/engine'
import {
  persistOperatorRecommendations,
  type PersistedOperatorRecommendation,
  type HermesRecommendationsSupabase,
} from '@/lib/hermes-operator/recommendations'
import { canHermesAutoExecute } from '@/lib/autonomy/policy'
import {
  normalizeOperatorMode,
  type HermesOperatorContextSnapshot,
  type HermesOperatorMode,
} from '@/lib/hermes-operator/types'
import type { AutonomyActionType, AutonomyRiskLevel } from '@/lib/autonomy/types'

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
    HermesAlertsSupabase,
    HermesNotificationSupabase {
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isAutonomyActionType(value: string): value is AutonomyActionType {
  return [
    'run_agent',
    'create_landing',
    'create_checkout',
    'deploy',
    'publish_campaign',
    'scale_budget',
    'stop_venture',
  ].includes(value)
}

function isAutonomyRiskLevel(value: string): value is AutonomyRiskLevel {
  return ['low', 'medium', 'high', 'critical'].includes(value)
}

async function insertRun(
  supabase: HermesOperatorRunnerSupabase,
  row: Record<string, unknown>
): Promise<void> {
  const result = await supabase.from('hermes_operator_runs').insert(row)
  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)
}

async function patchRun(
  supabase: HermesOperatorRunnerSupabase,
  runId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const result = await supabase.from('hermes_operator_runs').update(patch).eq('id', runId)
  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)
}

function buildJobFromRecommendation(input: {
  recommendation: PersistedOperatorRecommendation
  userId: string
  nowIso: string
}): Record<string, unknown> | null {
  const payload = input.recommendation.payload
  const agentId = readString(payload.agentId)
  if (!agentId) return null

  const prompt =
    readString(payload.prompt) ??
    [
      input.recommendation.title,
      input.recommendation.detail,
      'Execute this as a low-risk Hermes operator recommendation.',
    ].join('\n')

  return {
    user_id: input.userId,
    venture_id: readString(payload.ventureId),
    kind: 'run_agent',
    status: 'queued',
    attempt_count: 0,
    next_run_at: input.nowIso,
    payload: {
      agentId,
      prompt,
      input: {
        ...(readRecord(payload.input) ?? {}),
        trigger: 'hermes_operator',
        recommendationId: input.recommendation.id,
        recommendationKind: input.recommendation.kind,
        source: input.recommendation.source,
      },
    },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  }
}

async function autoEnqueueRecommendations(input: {
  supabase: HermesOperatorRunnerSupabase
  userId: string
  mode: HermesOperatorMode
  recommendations: PersistedOperatorRecommendation[]
  nowIso: string
}): Promise<{ enqueuedJobsCount: number; executedRecommendationIds: string[] }> {
  if (input.mode === 'observe') {
    return { enqueuedJobsCount: 0, executedRecommendationIds: [] }
  }

  let enqueuedJobsCount = 0
  const executedRecommendationIds: string[] = []

  for (const recommendation of input.recommendations) {
    if (
      !recommendation.actionType ||
      !recommendation.riskLevel ||
      !isAutonomyActionType(recommendation.actionType) ||
      !isAutonomyRiskLevel(recommendation.riskLevel)
    ) {
      continue
    }

    if (
      !canHermesAutoExecute({
        mode: input.mode,
        actionType: recommendation.actionType,
        riskLevel: recommendation.riskLevel,
      })
    ) {
      continue
    }

    const row = buildJobFromRecommendation({
      recommendation,
      userId: input.userId,
      nowIso: input.nowIso,
    })
    if (!row) continue

    const insertResult = await input.supabase.from('autonomy_jobs').insert(row)
    const resolved = await insertResult
    if (resolved.error) throw new Error(resolved.error.message)

    const updateResult = await input.supabase
      .from('hermes_operator_recommendations')
      .update({
        status: 'accepted',
        updated_at: input.nowIso,
      })
      .eq('id', recommendation.id)
    const updated = await updateResult
    if (updated.error) throw new Error(updated.error.message)

    enqueuedJobsCount += 1
    executedRecommendationIds.push(recommendation.id)
  }

  return { enqueuedJobsCount, executedRecommendationIds }
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

    const recommendations = await persistOperatorRecommendations({
      supabase: input.supabase,
      userId: input.userId,
      runId,
      recommendations: engineResult.recommendations,
      now,
    })

    const enqueueResult = await autoEnqueueRecommendations({
      supabase: input.supabase,
      userId: input.userId,
      mode,
      recommendations,
      nowIso,
    })

    await patchRun(input.supabase, runId, {
      enqueued_jobs_count: enqueueResult.enqueuedJobsCount,
      executed_actions_count: enqueueResult.executedRecommendationIds.length,
    })

    await persistOperatorAlerts({
      supabase: input.supabase,
      userId: input.userId,
      runId,
      alerts: engineResult.alerts,
      now,
    })

    await dispatchOperatorNotifications({
      supabase: input.supabase,
      userId: input.userId,
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
