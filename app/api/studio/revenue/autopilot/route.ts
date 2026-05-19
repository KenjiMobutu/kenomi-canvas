import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { buildRevenueAutopilotPlan, type RevenueAutopilotStep } from '@/lib/revenue-autopilot'
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
import { runAgentStep, type RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { insertAuditEvent } from '@/lib/audit-log'
import { getCheckoutEnvironment, parsePaymentOutput } from '@/lib/stripe/checkout-action'

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function readTable<T>(query: QueryResult<T>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

async function loadRevenueSnapshot(input: {
  supabase: any
  userId: string
}): Promise<RevenueLoopSnapshot> {
  const userId = input.userId
  const [pipelines, ventures, payments, campaignDrafts, autonomyActions, approvals, decisions] =
    await Promise.all([
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
    ])

  return buildRevenueLoopSnapshot({
    pipelines,
    ventures,
    payments,
    campaignDrafts,
    autonomyActions,
    approvals,
    decisions,
  })
}

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_ORCHESTRATOR_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function getContext(req: NextRequest) {
  if (isCronAuthorized(req)) {
    const userId = process.env.AGENT_ORCHESTRATOR_USER_ID
    return {
      user: userId ? { id: userId } : null,
      supabase: supabaseAdmin,
      response: userId
        ? null
        : NextResponse.json({ error: 'AGENT_ORCHESTRATOR_USER_ID requis' }, { status: 500 }),
      cronAuthorized: true,
    }
  }

  const context = await requireAllowedUser(await cookies())
  return { ...context, cronAuthorized: false }
}

async function createAutopilotApproval(input: {
  supabase: any
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

  let actionInput: Record<string, unknown> = {
    source: 'revenue_autopilot',
    reason: input.step.reason,
    pipeline_id: input.step.pipelineId ?? null,
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
      estimated_cost_eur: actionType === 'scale_budget' ? 25 : 0,
      budget_cap_eur: actionType === 'scale_budget' ? 50 : null,
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
  supabase: any
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

async function buildPlanForRequest(req: NextRequest) {
  const { user, supabase, response, cronAuthorized } = await getContext(req)
  if (response) return { response }
  if (!user?.id) return { response: apiError('Utilisateur autopilot manquant', 500) }

  const snapshot = await loadRevenueSnapshot({ supabase, userId: user.id })
  const plan = buildRevenueAutopilotPlan({
    snapshot,
    environment: getCheckoutEnvironment(),
  })
  return { user, supabase, cronAuthorized, snapshot, plan }
}

export async function GET(req: NextRequest) {
  try {
    const result = await buildPlanForRequest(req)
    if ('response' in result && result.response) return result.response
    return NextResponse.json({ ok: true, plan: result.plan, snapshot: result.snapshot })
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

    return NextResponse.json({ ok: true, plan: result.plan, executed })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Autopilot revenue échoué', 500)
  }
}
