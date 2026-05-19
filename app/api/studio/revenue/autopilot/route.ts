import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildRevenueAutopilotPlan,
  filterDuplicateDailyAutopilotSteps,
  type RevenueAutopilotStep,
} from '@/lib/revenue-autopilot'
import {
  buildRevenueLoopSnapshot,
  type RevenueApprovalRow,
  type RevenueAutonomyActionRow,
  type RevenueCampaignDraftRow,
  type RevenueDecisionRow,
  type RevenueLoopSnapshot,
  type RevenuePaymentRow,
  type RevenuePipelineRow,
  type RevenueVentureRow,
} from '@/lib/revenue-loop'
import { getAutonomyConfig } from '@/lib/autonomy/config'
import { resolveCronUserId } from '@/lib/autonomy/cron-user'
import { runAgentStep, type RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { insertAuditEvent } from '@/lib/audit-log'
import { getCheckoutEnvironment, parsePaymentOutput } from '@/lib/stripe/checkout-action'
import { buildAcquisitionRoi, type AcquisitionEventRow } from '@/lib/metrics/acquisition-roi'
import { buildRevenueDailyCycleAudit } from '@/lib/revenue-daily-cycle'
import { deriveRevenueRoiDecision } from '@/lib/revenue-proof'

function normalizeCycleActions(actions: RevenueAutonomyActionRow[]) {
  return actions.map((action) => ({
    id: action.id,
    action_type: action.action_type ?? 'unknown',
    risk_level: action.risk_level ?? null,
    status: action.status ?? 'unknown',
  }))
}

function normalizeCycleApprovals(approvals: RevenueApprovalRow[]) {
  return approvals.map((approval) => ({
    id: approval.id,
    action_id: approval.action_id ?? null,
    status: approval.status ?? 'unknown',
  }))
}

function normalizeCycleDecisions(decisions: RevenueDecisionRow[]) {
  return decisions.map((decision) => ({
    decision: decision.decision ?? null,
    created_at: decision.created_at ?? null,
  }))
}

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
type RevenueRouteSupabase = Awaited<ReturnType<typeof requireAllowedUser>>['supabase']

async function readTable<T>(query: QueryResult<T>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

async function loadRevenueContext(input: { supabase: RevenueRouteSupabase; userId: string }): Promise<{
  snapshot: RevenueLoopSnapshot
  autonomyActions: RevenueAutonomyActionRow[]
  approvals: RevenueApprovalRow[]
  decisions: RevenueDecisionRow[]
  ventureEvents: AcquisitionEventRow[]
}> {
  const userId = input.userId
  const [
    pipelines,
    ventures,
    payments,
    campaignDrafts,
    autonomyActions,
    approvals,
    decisions,
    ventureEvents,
  ] = await Promise.all([
    readTable<RevenuePipelineRow>(
      input.supabase
        .from('venture_pipeline')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50)
    ),
    readTable<RevenueVentureRow>(
      input.supabase
        .from('ventures')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    readTable<RevenuePaymentRow>(
      input.supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    readTable<RevenueCampaignDraftRow>(
      input.supabase
        .from('campaign_drafts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    readTable<RevenueAutonomyActionRow>(
      input.supabase
        .from('autonomy_actions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    readTable<RevenueApprovalRow>(
      input.supabase
        .from('human_approvals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    readTable<RevenueDecisionRow>(
      input.supabase
        .from('decisions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    readTable<AcquisitionEventRow>(
      input.supabase
        .from('venture_events')
        .select('venture_id, event_type, value, metadata, occurred_at')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(500)
    ),
  ])

  return {
    snapshot: buildRevenueLoopSnapshot({
      pipelines,
      ventures,
      payments,
      campaignDrafts,
      autonomyActions,
      approvals,
      decisions,
    }),
    autonomyActions,
    approvals,
    decisions,
    ventureEvents,
  }
}

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_ORCHESTRATOR_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function getContext(req: NextRequest) {
  if (isCronAuthorized(req)) {
    try {
      const userId = await resolveCronUserId({
        explicitUserId: process.env.AGENT_ORCHESTRATOR_USER_ID,
        allowedEmail: process.env.ALLOWED_EMAIL,
        listUsers: async () => {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 100,
          })
          if (error) throw new Error(error.message)
          return data.users.map((user) => ({ id: user.id, email: user.email }))
        },
      })
      return {
        user: { id: userId },
        supabase: supabaseAdmin,
        response: null,
        cronAuthorized: true,
      }
    } catch (error) {
      return {
        user: null,
        supabase: supabaseAdmin,
        response: NextResponse.json(
          { error: error instanceof Error ? error.message : 'Utilisateur autopilot introuvable' },
          { status: 500 }
        ),
        cronAuthorized: true,
      }
    }
  }

  const context = await requireAllowedUser(await cookies())
  return { ...context, cronAuthorized: false }
}

async function createAutopilotApproval(input: {
  supabase: RevenueRouteSupabase
  userId: string
  step: RevenueAutopilotStep
  nowIso: string
}) {
  const actionType =
    input.step.kind === 'create_checkout'
      ? 'create_checkout'
      : input.step.kind === 'scale_budget'
        ? 'scale_budget'
        : input.step.kind === 'stop_venture'
          ? 'stop_venture'
          : input.step.kind

  const scaleBudgetEur =
    actionType === 'scale_budget' ? Math.max(1, input.step.recommendedBudgetEur ?? 25) : 0

  let actionInput: Record<string, unknown> = {
    source: 'revenue_autopilot',
    reason: input.step.reason,
    pipeline_id: input.step.pipelineId ?? null,
    recommended_budget_eur: actionType === 'scale_budget' ? scaleBudgetEur : null,
  }

  if (input.step.kind === 'create_checkout') {
    if (!input.step.pipelineId || !input.step.ventureId) {
      throw new Error('pipeline_id ou venture_id manquant pour checkout autopilot')
    }
    const { data: pipeline, error } = await input.supabase
      .from('venture_pipeline')
      .select('id, venture_id, payment_output')
      .eq('id', input.step.pipelineId)
      .eq('user_id', input.userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!pipeline?.payment_output) throw new Error('payment_output manquant pour checkout')

    actionInput = {
      ...actionInput,
      payment: parsePaymentOutput(pipeline.payment_output),
      environment: getCheckoutEnvironment(),
      successUrl: `${process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'}/studio/revenue?checkout=success`,
      cancelUrl: `${process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'}/studio/revenue?checkout=cancelled`,
    }
  }

  const { data: action, error: actionError } = await input.supabase
    .from('autonomy_actions')
    .insert({
      user_id: input.userId,
      venture_id: input.step.ventureId ?? null,
      action_type: actionType,
      risk_level: input.step.risk,
      status: 'blocked',
      estimated_cost_eur: actionType === 'scale_budget' ? scaleBudgetEur : 0,
      budget_cap_eur:
        actionType === 'scale_budget' ? Math.max(50, Math.ceil(scaleBudgetEur * 1.25)) : null,
      input: actionInput,
      output: {},
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
    .select('id')
    .single()

  if (actionError || !action?.id) {
    throw new Error(actionError?.message ?? "Impossible de créer l'action autopilot")
  }

  const { error: approvalError } = await input.supabase.from('human_approvals').insert({
    user_id: input.userId,
    action_id: action.id,
    status: 'pending',
    reason: input.step.reason,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })
  if (approvalError) throw new Error(approvalError.message)

  return { status: 'approval_created', actionId: action.id, actionType }
}

async function executeAutopilotStep(input: {
  supabase: RevenueRouteSupabase
  userId: string
  step: RevenueAutopilotStep
  nowIso: string
}) {
  if (input.step.execution === 'approval') {
    return createAutopilotApproval(input)
  }

  if (input.step.kind === 'run_agent' && input.step.agentId) {
    try {
      const result = await runAgentStep({
        supabase: input.supabase as unknown as RunAgentStepSupabase,
        userId: input.userId,
        agentId: input.step.agentId,
        ventureId: input.step.ventureId ?? undefined,
        prompt: [
          `Revenue-first autopilot. Objectif: ${input.step.label}.`,
          `Raison: ${input.step.reason}.`,
          'Avance uniquement la boucle qui rapproche le plus vite du revenu encaissé.',
        ].join('\n'),
      })

      await input.supabase.from('autonomy_actions').insert({
        user_id: input.userId,
        venture_id: input.step.ventureId ?? null,
        action_type: 'run_agent',
        risk_level: 'low',
        status: 'completed',
        input: {
          source: 'revenue_autopilot',
          agent_id: input.step.agentId,
          reason: input.step.reason,
        },
        output: { agent_run_id: result.agentRunId, model: result.model },
        created_at: input.nowIso,
        updated_at: input.nowIso,
      })

      return {
        status: 'executed',
        actionType: 'run_agent',
        agentId: input.step.agentId,
        agentRunId: result.agentRunId,
      }
    } catch (error) {
      await input.supabase.from('autonomy_actions').insert({
        user_id: input.userId,
        venture_id: input.step.ventureId ?? null,
        action_type: 'run_agent',
        risk_level: 'low',
        status: 'failed',
        input: {
          source: 'revenue_autopilot',
          agent_id: input.step.agentId,
          reason: input.step.reason,
        },
        output: { error: error instanceof Error ? error.message : String(error) },
        created_at: input.nowIso,
        updated_at: input.nowIso,
      })
      throw error
    }
  }

  return { status: 'held', actionType: input.step.kind, reason: input.step.reason }
}

async function recordRoiDecision(input: {
  supabase: RevenueRouteSupabase
  userId: string
  snapshot: RevenueLoopSnapshot
  acquisition: ReturnType<typeof buildAcquisitionRoi>
  events: AcquisitionEventRow[]
  nowIso: string
}): Promise<RevenueDecisionRow | null> {
  const ventureId =
    input.events.find((event) => event.venture_id)?.venture_id ??
    input.snapshot.loops.find((loop) => loop.ventureId)?.ventureId ??
    null

  if (!ventureId) return null

  const roiDecision = deriveRevenueRoiDecision(input.acquisition.summary)
  const actionStatus = roiDecision.decision === 'hold' ? 'executed' : 'proposed'
  const metricsSnapshot = {
    source: 'revenue_autopilot',
    decision: roiDecision.decision,
    reason: roiDecision.reason,
    revenue_cents: input.acquisition.summary.revenueCents,
    spend_cents: input.acquisition.summary.spendCents,
    profit_cents: input.acquisition.summary.profitCents,
    roi: input.acquisition.summary.roi,
    recommended_budget_eur: input.acquisition.summary.recommendedBudgetEur,
  }

  const { data: latestDecision, error: latestError } = await input.supabase
    .from('decisions')
    .select('decision, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) throw new Error(latestError.message)

  const latestAt = Date.parse(latestDecision?.created_at ?? '')
  const alreadyCurrent =
    latestDecision?.decision === roiDecision.decision &&
    Number.isFinite(latestAt) &&
    input.nowIso.slice(0, 10) === new Date(latestAt).toISOString().slice(0, 10)

  if (!alreadyCurrent) {
    const { error: decisionError } = await input.supabase.from('decisions').insert({
      venture_id: ventureId,
      decision: roiDecision.decision,
      reason: roiDecision.reason,
      metrics_snapshot: metricsSnapshot,
      action_status: actionStatus,
      created_at: input.nowIso,
      executed_at: roiDecision.decision === 'hold' ? input.nowIso : null,
    })
    if (decisionError) throw new Error(decisionError.message)
  }

  await input.supabase
    .from('ventures')
    .update({
      current_decision: roiDecision.ventureDecision,
      last_decision_at: input.nowIso,
      next_action:
        roiDecision.decision === 'scale'
          ? 'Valider ou exécuter le scale budget proposé.'
          : roiDecision.decision === 'cut'
            ? 'Valider le cut avant arrêt ou pivot.'
            : 'Hold: attendre un signal revenu/spend plus dur.',
      updated_at: input.nowIso,
    })
    .eq('id', ventureId)
    .eq('user_id', input.userId)

  return {
    id: `roi-${input.nowIso}`,
    venture_id: ventureId,
    decision: roiDecision.decision,
    reason: roiDecision.reason,
    created_at: input.nowIso,
  }
}

async function buildPlanForRequest(req: NextRequest) {
  const { user, supabase, response, cronAuthorized } = await getContext(req)
  if (response) return { response }
  if (!user?.id) return { response: apiError('Utilisateur autopilot manquant', 500) }

  const context = await loadRevenueContext({ supabase, userId: user.id })
  const rawPlan = buildRevenueAutopilotPlan({
    snapshot: context.snapshot,
    environment: getCheckoutEnvironment(),
  })
  const plan = filterDuplicateDailyAutopilotSteps({
    plan: rawPlan,
    actions: context.autonomyActions.map((action) => ({
      action_type: action.action_type,
      venture_id: action.venture_id,
      status: action.status,
      input: action.input,
      created_at: action.created_at,
    })),
  })
  const acquisition = buildAcquisitionRoi(context.ventureEvents)
  const cycle = buildRevenueDailyCycleAudit({
    plan,
    acquisition,
    events: context.ventureEvents,
    actions: normalizeCycleActions(context.autonomyActions),
    approvals: normalizeCycleApprovals(context.approvals),
    decisions: normalizeCycleDecisions(context.decisions),
    executed: [],
  })
  return {
    user,
    supabase,
    cronAuthorized,
    context,
    snapshot: context.snapshot,
    plan,
    acquisition,
    cycle,
  }
}

export async function GET(req: NextRequest) {
  try {
    const result = await buildPlanForRequest(req)
    if ('response' in result && result.response) return result.response
    return NextResponse.json({
      ok: true,
      plan: result.plan,
      snapshot: result.snapshot,
      acquisition: result.acquisition,
      cycle: result.cycle,
    })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Autopilot indisponible', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await buildPlanForRequest(req)
    if ('response' in result && result.response) return result.response

    const config = getAutonomyConfig()
    if (!config.enabled) {
      return NextResponse.json({
        ok: true,
        blocked: 'autonomy_disabled',
        config,
        plan: result.plan,
        executed: [],
      })
    }

    const nowIso = new Date().toISOString()
    const executed = []
    for (const step of result.plan.steps.slice(0, 1)) {
      executed.push(
        await executeAutopilotStep({
          supabase: result.supabase,
          userId: result.user.id,
          step,
          nowIso,
        })
      )
    }

    await insertAuditEvent(result.supabase, {
      user_id: result.user.id,
      event_type: 'revenue.autopilot.evaluated',
      metadata: {
        mode: result.plan.mode,
        steps_count: result.plan.steps.length,
        executed_count: executed.length,
        revenue_eur: result.plan.revenueEur,
        blocked_revenue_eur: result.plan.blockedRevenueEur,
        cron_authorized: result.cronAuthorized,
      },
    })

    const postContext = await loadRevenueContext({
      supabase: result.supabase,
      userId: result.user.id,
    })
    const postAcquisition = buildAcquisitionRoi(postContext.ventureEvents)
    const roiDecision = await recordRoiDecision({
      supabase: result.supabase,
      userId: result.user.id,
      snapshot: postContext.snapshot,
      acquisition: postAcquisition,
      events: postContext.ventureEvents,
      nowIso,
    })
    const cycle = buildRevenueDailyCycleAudit({
      plan: result.plan,
      acquisition: postAcquisition,
      events: postContext.ventureEvents,
      actions: normalizeCycleActions(postContext.autonomyActions),
      approvals: normalizeCycleApprovals(postContext.approvals),
      decisions: normalizeCycleDecisions(
        roiDecision ? [roiDecision, ...postContext.decisions] : postContext.decisions
      ),
      executed,
      now: new Date(nowIso),
    })

    await insertAuditEvent(result.supabase, {
      user_id: result.user.id,
      event_type: 'revenue.daily_cycle.completed',
      severity: cycle.mode === 'attention' ? 'warn' : 'info',
      metadata: {
        mode: cycle.mode,
        summary: cycle.summary,
        stages: cycle.stages.map((stage) => ({
          key: stage.key,
          status: stage.status,
          source: stage.source,
          risk: stage.risk ?? null,
        })),
        cron_authorized: result.cronAuthorized,
      },
    })

    return NextResponse.json({
      ok: true,
      plan: result.plan,
      acquisition: postAcquisition,
      roiDecision,
      cycle,
      executed,
    })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Autopilot revenue échoué', 500)
  }
}
