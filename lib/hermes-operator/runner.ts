import { randomUUID } from 'node:crypto'
import {
  dispatchOperatorNotifications,
  type HermesNotificationSupabase,
} from '@/lib/hermes-operator/notifications'
import { buildHermesBusinessAlerts } from '@/lib/hermes-operator/business-alerts'
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
import { evaluateHermesAutoExecution } from '@/lib/autonomy/policy'
import {
  mapHermesOperatorSettingsRecord,
  type HermesOperatorSettings,
} from '@/lib/hermes-operator/settings'
import {
  normalizeOperatorMode,
  type HermesOperatorContextSnapshot,
  type HermesOperatorMode,
} from '@/lib/hermes-operator/types'
import { buildHermesOperatorBrief, type HermesOperatorRunDelta } from '@/lib/hermes-operator/brief'
import type {
  AutonomyActionType,
  AutonomyRiskLevel,
  HermesPolicyBlockReason,
} from '@/lib/autonomy/types'

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

function buildRunDelta(input: {
  context: HermesOperatorContextSnapshot
  previousRun: Record<string, unknown> | null
}): HermesOperatorRunDelta | null {
  const previousSnapshot =
    input.previousRun?.input_snapshot &&
    typeof input.previousRun.input_snapshot === 'object' &&
    !Array.isArray(input.previousRun.input_snapshot)
      ? (input.previousRun.input_snapshot as Record<string, any>)
      : null
  if (!previousSnapshot) return null

  const currentProspects = input.context.prospects
  const currentAutomation = input.context.automation
  const currentConversions = input.context.revenue.conversions.overview

  return {
    replied: Number(currentConversions.replied ?? 0) - Number(previousSnapshot?.revenue?.conversions?.overview?.replied ?? 0),
    paid: Number(currentConversions.paidCount ?? 0) - Number(previousSnapshot?.revenue?.conversions?.overview?.paidCount ?? previousSnapshot?.revenue?.conversions?.overview?.paid ?? 0),
    followUpsDue: Number(currentProspects.followUpsDue ?? 0) - Number(previousSnapshot?.prospects?.followUpsDue ?? 0),
    pendingApprovals: Number(currentProspects.pendingApprovals ?? 0) - Number(previousSnapshot?.prospects?.pendingApprovals ?? 0),
    queuedJobs: Number(currentAutomation.queuedJobs ?? 0) - Number(previousSnapshot?.automation?.queuedJobs ?? 0),
    failedJobs: Number(currentAutomation.failedJobs ?? 0) - Number(previousSnapshot?.automation?.failedJobs ?? 0),
  }
}

function readSnapshot(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function buildHermesFallbackEngineResult(input: {
  context: HermesOperatorContextSnapshot
  error: string
}): HermesOperatorEngineResult {
  const approvals = input.context.prospects.pendingApprovals
  const followUps = input.context.prospects.followUpsDue
  const paidCash = input.context.revenue.conversions.overview.paidCashEur
  const topOffer =
    input.context.revenue.conversions.bestOfferToCollectCash?.offerName ??
    input.context.revenue.weeklyReview.bestOfferByCash.title
  const nextAction = input.context.revenue.weeklyReview.nextExperiment.title

  return {
    summary: `Hermes fallback mode. ${approvals} approvals pending, ${followUps} follow-ups due, ${paidCash}€ collected. Next move: ${nextAction}.`,
    recommendations: [],
    alerts: [
      {
        severity: 'warn',
        category: 'execution_hermes_fallback',
        dedupeKey: `execution_hermes_fallback:${input.error}`,
        headline: 'Hermes reasoning fallback active',
        detail: `${topOffer ? `Cash signal remains on ${topOffer}. ` : ''}Primary Hermes reasoning was unavailable, so the operator persisted a heuristic brief instead.`,
        channel: 'studio',
        payload: {
          error: input.error,
          paidCashEur: paidCash,
          pendingApprovals: approvals,
          followUpsDue: followUps,
        },
      },
    ],
    provider: 'hermes',
    model: process.env.HERMES_DEFAULT_MODEL ?? 'hermes3:8b',
    fallbackTriggered: true,
  }
}

const SAFE_OPERATOR_AGENT_IDS = new Set(['prospect', 'devops'])

type OperatorUsageSnapshot = {
  totalAutoActionsToday: number
  prospectRunsToday: number
  followUpScansToday: number
  devopsRunsToday: number
}

function recommendationExecutionBucket(input: {
  kind: string
  payload?: Record<string, unknown>
}): 'follow_up_scan' | 'prospect' | 'devops' | null {
  if (input.kind === 'run_follow_up_scan') return 'follow_up_scan'
  if (input.kind === 'run_prospect') return 'prospect'
  if (input.kind === 'run_devops') return 'devops'
  const agentId =
    input.payload && typeof input.payload === 'object' ? readString(input.payload.agentId) : null
  if (agentId === 'prospect') return 'prospect'
  if (agentId === 'devops') return 'devops'
  return null
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

async function loadPreviousRun(
  supabase: HermesOperatorRunnerSupabase,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await supabase
    .from('hermes_operator_runs')
    .select('id, input_snapshot, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return (result.data as Record<string, unknown> | null) ?? null
}

async function insertBrief(
  supabase: HermesOperatorRunnerSupabase,
  row: Record<string, unknown>
): Promise<void> {
  const result = await supabase.from('hermes_operator_briefs').insert(row)
  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)
}

async function loadOperatorSettings(
  supabase: HermesOperatorRunnerSupabase,
  userId: string
): Promise<HermesOperatorSettings> {
  const result = await supabase
    .from('user_operator_settings')
    .select(
      'operator_mode, notify_in_studio, notification_mode, max_auto_actions_per_day, max_auto_prospect_runs_per_day, max_auto_follow_up_scans_per_day, max_auto_devops_runs_per_day'
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return mapHermesOperatorSettingsRecord((result.data as Record<string, unknown> | null) ?? null)
}

async function loadAutoExecutionUsage(
  supabase: HermesOperatorRunnerSupabase,
  userId: string,
  now: Date
): Promise<OperatorUsageSnapshot> {
  const result = await supabase
    .from('hermes_operator_recommendations')
    .select('kind, status, created_at, payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)

  const dayPrefix = now.toISOString().slice(0, 10)
  const acceptedToday = (resolved.data ?? []).filter((row) => {
    const createdAt = String(row.created_at ?? '')
    const status = String(row.status ?? '')
    return createdAt.startsWith(dayPrefix) && (status === 'accepted' || status === 'executed')
  })

  return {
    totalAutoActionsToday: acceptedToday.length,
    prospectRunsToday: acceptedToday.filter(
      (row) =>
        recommendationExecutionBucket({
          kind: String(row.kind ?? ''),
          payload:
            row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : undefined,
        }) === 'prospect'
    ).length,
    followUpScansToday: acceptedToday.filter(
      (row) => recommendationExecutionBucket({ kind: String(row.kind ?? '') }) === 'follow_up_scan'
    ).length,
    devopsRunsToday: acceptedToday.filter(
      (row) =>
        recommendationExecutionBucket({
          kind: String(row.kind ?? ''),
          payload:
            row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : undefined,
        }) === 'devops'
    ).length,
  }
}

function buildJobFromRecommendation(input: {
  recommendation: PersistedOperatorRecommendation
  userId: string
  nowIso: string
}): Record<string, unknown> | null {
  const payload = input.recommendation.payload
  if (input.recommendation.kind === 'run_follow_up_scan') {
    return {
      user_id: input.userId,
      venture_id: null,
      kind: 'follow_up_scan',
      status: 'queued',
      attempt_count: 0,
      next_run_at: input.nowIso,
      payload: {
        scheduleKey: readString(payload.scheduleKey) ?? 'follow_ups',
        trigger: 'hermes_operator',
        recommendationId: input.recommendation.id,
        recommendationKind: input.recommendation.kind,
        source: input.recommendation.source,
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    }
  }

  const mappedAgentId = resolveRecommendationAgentId(input.recommendation)

  if (!mappedAgentId || !SAFE_OPERATOR_AGENT_IDS.has(mappedAgentId)) return null

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
      agentId: mappedAgentId,
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

function resolveRecommendationAgentId(
  recommendation: Pick<PersistedOperatorRecommendation, 'kind' | 'payload'>
): string | null {
  const requestedAgentId = readString(recommendation.payload.agentId)
  if (recommendation.kind === 'run_prospect') return 'prospect'
  if (recommendation.kind === 'run_devops') return 'devops'
  return requestedAgentId
}

async function autoEnqueueRecommendations(input: {
  supabase: HermesOperatorRunnerSupabase
  userId: string
  mode: HermesOperatorMode
  recommendations: PersistedOperatorRecommendation[]
  nowIso: string
  now: Date
  settings: HermesOperatorSettings
}): Promise<{
  enqueuedJobsCount: number
  executedRecommendationIds: string[]
  blockedByPolicyCount: number
  blockedByPolicyReasonCounts: Partial<Record<HermesPolicyBlockReason, number>>
}> {
  if (input.mode === 'observe') {
    return {
      enqueuedJobsCount: 0,
      executedRecommendationIds: [],
      blockedByPolicyCount: 0,
      blockedByPolicyReasonCounts: {},
    }
  }

  let enqueuedJobsCount = 0
  const executedRecommendationIds: string[] = []
  let usage = await loadAutoExecutionUsage(input.supabase, input.userId, input.now)
  let blockedByPolicyCount = 0
  const blockedByPolicyReasonCounts: Partial<Record<HermesPolicyBlockReason, number>> = {}

  for (const recommendation of input.recommendations) {
    if (
      !recommendation.actionType ||
      !recommendation.riskLevel ||
      !isAutonomyActionType(recommendation.actionType) ||
      !isAutonomyRiskLevel(recommendation.riskLevel)
    ) {
      continue
    }

    const evaluation = evaluateHermesAutoExecution({
        mode: input.mode,
        actionType: recommendation.actionType,
        riskLevel: recommendation.riskLevel,
        recommendationKind: recommendation.kind,
        agentId: resolveRecommendationAgentId(recommendation),
        caps: {
          maxAutoActionsPerDay: input.settings.maxAutoActionsPerDay,
          maxAutoProspectRunsPerDay: input.settings.maxAutoProspectRunsPerDay,
          maxAutoFollowUpScansPerDay: input.settings.maxAutoFollowUpScansPerDay,
          maxAutoDevopsRunsPerDay: input.settings.maxAutoDevopsRunsPerDay,
        },
        usage,
      })
    if (!evaluation.ok) {
      const blockedUpdateResult = await input.supabase
        .from('hermes_operator_recommendations')
        .update({
          policy_block_reason: evaluation.reason,
          auto_execution_eligible: true,
          auto_execution_attempted_at: input.nowIso,
          auto_execution_blocked_at: input.nowIso,
          updated_at: input.nowIso,
        })
        .eq('id', recommendation.id)
      const blockedUpdated = await blockedUpdateResult
      if (blockedUpdated.error) throw new Error(blockedUpdated.error.message)
      blockedByPolicyCount += 1
      blockedByPolicyReasonCounts[evaluation.reason] =
        (blockedByPolicyReasonCounts[evaluation.reason] ?? 0) + 1
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
        policy_block_reason: null,
        auto_execution_eligible: true,
        auto_execution_attempted_at: input.nowIso,
        updated_at: input.nowIso,
      })
      .eq('id', recommendation.id)
    const updated = await updateResult
    if (updated.error) throw new Error(updated.error.message)

    enqueuedJobsCount += 1
    executedRecommendationIds.push(recommendation.id)
    const bucket = recommendationExecutionBucket({
      kind: recommendation.kind,
      payload: recommendation.payload,
    })
    if (bucket === 'follow_up_scan') {
      usage = {
        ...usage,
        totalAutoActionsToday: usage.totalAutoActionsToday + 1,
        followUpScansToday: usage.followUpScansToday + 1,
      }
    } else if (bucket === 'devops') {
      usage = {
        ...usage,
        totalAutoActionsToday: usage.totalAutoActionsToday + 1,
        devopsRunsToday: usage.devopsRunsToday + 1,
      }
    } else if (bucket === 'prospect') {
      usage = {
        ...usage,
        totalAutoActionsToday: usage.totalAutoActionsToday + 1,
        prospectRunsToday: usage.prospectRunsToday + 1,
      }
    }
  }

  return {
    enqueuedJobsCount,
    executedRecommendationIds,
    blockedByPolicyCount,
    blockedByPolicyReasonCounts,
  }
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
    const previousRun = await loadPreviousRun(input.supabase, input.userId)
    const operatorSettings = await loadOperatorSettings(input.supabase, input.userId)
    contextSnapshot = await buildContext({
      supabase: input.supabase,
      userId: input.userId,
      now,
    })

    let engineResult: HermesOperatorEngineResult
    try {
      engineResult = await runEngine({
        context: contextSnapshot,
        mode,
      })
    } catch (engineError) {
      const engineMessage =
        engineError instanceof Error ? engineError.message : String(engineError)
      engineResult = buildHermesFallbackEngineResult({
        context: contextSnapshot,
        error: engineMessage,
      })
    }

    const previousSnapshot = readSnapshot(previousRun?.input_snapshot)
    const generatedAlerts = buildHermesBusinessAlerts({
      context: contextSnapshot,
      previousSnapshot,
      now,
    })
    const allAlerts = [...engineResult.alerts, ...generatedAlerts].filter(
      (alert, index, list) => list.findIndex((item) => item.dedupeKey === alert.dedupeKey) === index
    )

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
        alerts: allAlerts,
        provider: engineResult.provider,
        fallbackTriggered: engineResult.fallbackTriggered,
      },
      summary: engineResult.summary,
      executed_actions_count: 0,
      enqueued_jobs_count: 0,
      blocked_by_policy_count: 0,
      blocked_by_policy_reason_counts: {},
      alerts_count: allAlerts.length,
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
      now,
      settings: operatorSettings,
    })

    await patchRun(input.supabase, runId, {
      enqueued_jobs_count: enqueueResult.enqueuedJobsCount,
      executed_actions_count: enqueueResult.executedRecommendationIds.length,
      blocked_by_policy_count: enqueueResult.blockedByPolicyCount,
      blocked_by_policy_reason_counts: enqueueResult.blockedByPolicyReasonCounts,
    })

    await persistOperatorAlerts({
      supabase: input.supabase,
      userId: input.userId,
      runId,
      alerts: allAlerts,
      now,
    })

    await dispatchOperatorNotifications({
      supabase: input.supabase,
      userId: input.userId,
      alerts: allAlerts,
      settings: operatorSettings,
      now,
    })

    const brief = buildHermesOperatorBrief({
      userId: input.userId,
      runId,
      context: contextSnapshot,
      runDelta: buildRunDelta({ context: contextSnapshot, previousRun }),
      now,
    })
    await insertBrief(input.supabase, {
      user_id: brief.userId,
      run_id: brief.runId,
      summary: brief.summary,
      cash_delta_7d: brief.cashDelta7d,
      top_blocker: brief.topBlocker,
      top_opportunity: brief.topOpportunity,
      best_offer: brief.bestOffer,
      best_segment: brief.bestSegment,
      best_source: brief.bestSource,
      main_leak: brief.mainLeak,
      next_best_action: brief.nextBestAction,
      created_at: brief.createdAt,
    })

    return {
      runId,
      mode,
      status: 'completed',
      summary: engineResult.summary,
      model: engineResult.model,
      recommendationsCount: engineResult.recommendations.length,
      alertsCount: allAlerts.length,
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
      blocked_by_policy_count: 0,
      blocked_by_policy_reason_counts: {},
      alerts_count: 0,
      last_error: message,
      created_at: nowIso,
    })

    throw error
  }
}
