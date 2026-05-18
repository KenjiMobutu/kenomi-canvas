import { createCoolifyClient, type CoolifyClient } from '@/lib/coolify/client'
import { getAutonomyConfig, type AutonomyConfig } from './config'
import { checkBudgetPolicy } from './policy'
import {
  executePublishCampaign,
  type ExecutePublishResult,
  type PublishActionSupabase,
} from '@/lib/marketing/publish-action'
import {
  getMarketingPublisher,
  type MarketingPublisher,
} from '@/lib/marketing/adapters'

type QueryResponse = { data: unknown; error: { message: string } | null }

interface QueryResult extends PromiseLike<QueryResponse> {}

interface QueryFilterBuilder extends QueryResult {
  eq(field: string, value: unknown): QueryFilterBuilder
  single(): PromiseLike<QueryResponse>
}

interface TableQueryBuilder {
  select(columns?: string): QueryFilterBuilder
  update(row: Record<string, unknown>): QueryFilterBuilder
}

export interface ApprovalExecutorSupabase {
  from(table: string): TableQueryBuilder
}

type ApprovalResolution = 'approved' | 'rejected'

interface HumanApprovalRow {
  id: string
  user_id: string
  action_id: string
  status: string
}

interface AutonomyActionRow {
  id: string
  user_id: string
  venture_id?: string | null
  action_type: string
  status: string
  input?: Record<string, unknown> | null
  estimated_cost_eur?: number | null
  budget_cap_eur?: number | null
}

interface VentureSpendRow {
  venture_id?: string | null
  amount_eur?: number | null
}

const BUDGET_RELEVANT_ACTIONS = new Set(['publish_campaign', 'scale_budget'])

async function sumVentureSpend(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  ventureId?: string | null
}): Promise<{ ventureSpentEur: number; globalSpentEur: number }> {
  const { data, error } = await input.supabase
    .from('venture_events')
    .select('venture_id, amount_eur, event_type')
    .eq('user_id', input.userId)
    .eq('event_type', 'campaign_spend')

  if (error) throw new ApprovalExecutionError(error.message, 500)

  const rows = (data ?? []) as VentureSpendRow[]

  function safeAmount(value: unknown): number {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return n > 0 ? n : 0
  }

  const globalSpentEur = rows.reduce((sum, r) => sum + safeAmount(r.amount_eur), 0)
  const ventureSpentEur = input.ventureId
    ? rows
        .filter((r) => r.venture_id === input.ventureId)
        .reduce((sum, r) => sum + safeAmount(r.amount_eur), 0)
    : 0

  return { ventureSpentEur, globalSpentEur }
}

export interface ResolveHumanApprovalInput {
  supabase: ApprovalExecutorSupabase
  userId: string
  approvalId: string
  decision: ApprovalResolution
  coolifyClient?: CoolifyClient
  marketingPublisher?: MarketingPublisher
  now?: () => Date
  config?: AutonomyConfig
}

export interface ResolveHumanApprovalResult {
  approvalId: string
  actionId: string
  actionType: string
  status: ApprovalResolution
  executed: boolean
}

export class ApprovalExecutionError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
  }
}

async function single<T>(query: QueryFilterBuilder, notFoundMessage: string): Promise<T> {
  const { data, error } = await query.single()
  if (error) throw new ApprovalExecutionError(error.message, 500)
  if (!data) throw new ApprovalExecutionError(notFoundMessage, 404)
  return data as T
}

async function update(query: QueryResult): Promise<void> {
  const { error } = await query
  if (error) throw new ApprovalExecutionError(error.message, 500)
}

async function executeStopVenture(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  ventureId: string
  nowIso: string
}) {
  await update(
    input.supabase.from('ventures')
      .update({
        statut: 'stopped',
        stage: 'Stopped',
        next_action: 'Venture arrêtée après approbation humaine',
        decision_at: input.nowIso,
      })
      .eq('id', input.ventureId)
      .eq('user_id', input.userId)
  )

  await update(
    input.supabase.from('landing_pages')
      .update({ statut: 'stopped' })
      .eq('venture_id', input.ventureId)
  )

  await update(
    input.supabase.from('budget_requests')
      .update({ status: 'rejected' })
      .eq('venture_id', input.ventureId)
      .eq('status', 'pending')
  )

  await update(
    input.supabase.from('campaigns')
      .update({ status: 'rejected' })
      .eq('venture_id', input.ventureId)
  )
}

function isExternalAction(actionType: string): boolean {
  return (
    actionType === 'deploy' ||
    actionType === 'create_checkout' ||
    actionType === 'publish_campaign' ||
    actionType === 'scale_budget'
  )
}

function readDeployInput(action: AutonomyActionRow): {
  projectId: string
  serviceId: string
} {
  const projectId = action.input?.projectId
  const serviceId = action.input?.serviceId

  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new ApprovalExecutionError('projectId manquant pour deploy', 422)
  }

  if (typeof serviceId !== 'string' || serviceId.length === 0) {
    throw new ApprovalExecutionError('serviceId manquant pour deploy', 422)
  }

  return { projectId, serviceId }
}

export async function resolveHumanApproval(input: ResolveHumanApprovalInput): Promise<ResolveHumanApprovalResult> {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const config = input.config ?? getAutonomyConfig()
  const approval = await single<HumanApprovalRow>(
    input.supabase.from('human_approvals')
      .select('id, user_id, action_id, status')
      .eq('id', input.approvalId)
      .eq('user_id', input.userId),
    'Approval introuvable'
  )

  if (approval.status !== 'pending') {
    throw new ApprovalExecutionError('Approval déjà traitée', 409)
  }

  const action = await single<AutonomyActionRow>(
    input.supabase.from('autonomy_actions')
      .select('id, user_id, venture_id, action_type, status, input, estimated_cost_eur, budget_cap_eur')
      .eq('id', approval.action_id)
      .eq('user_id', input.userId),
    'Action autonome introuvable'
  )

  if (input.decision === 'rejected') {
    await update(
      input.supabase.from('human_approvals')
        .update({
          status: 'rejected',
          approved_by: input.userId,
          approved_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', approval.id)
        .eq('user_id', input.userId)
    )

    await update(
      input.supabase.from('autonomy_actions')
        .update({
          status: 'cancelled',
          output: { approved: false },
          updated_at: nowIso,
        })
        .eq('id', action.id)
        .eq('user_id', input.userId)
    )

    return {
      approvalId: approval.id,
      actionId: action.id,
      actionType: action.action_type,
      status: input.decision,
      executed: false,
    }
  }

  await update(
    input.supabase.from('human_approvals')
      .update({
        status: 'approved',
        approved_by: input.userId,
        approved_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', approval.id)
      .eq('user_id', input.userId)
  )

  if (config.dryRun && isExternalAction(action.action_type)) {
    await update(
      input.supabase.from('autonomy_actions')
        .update({
          status: 'completed',
          output: { dry_run: true, action_type: action.action_type, approved: true },
          updated_at: nowIso,
        })
        .eq('id', action.id)
        .eq('user_id', input.userId)
    )
    return {
      approvalId: approval.id,
      actionId: action.id,
      actionType: action.action_type,
      status: input.decision,
      executed: false,
    }
  }

  if (BUDGET_RELEVANT_ACTIONS.has(action.action_type)) {
    const { ventureSpentEur, globalSpentEur } = await sumVentureSpend({
      supabase: input.supabase,
      userId: input.userId,
      ventureId: action.venture_id ?? null,
    })

    // venture-cap not stored yet — only action and global caps active
    const budgetCheck = checkBudgetPolicy({
      estimatedCostEur: Number(action.estimated_cost_eur ?? 0),
      actionCapEur: action.budget_cap_eur ?? undefined,
      ventureSpentEur,
      ventureSpendCapEur: Number.POSITIVE_INFINITY,
      globalSpentEur,
      globalCapEur: config.globalBudgetCapEur,
    })

    if (!budgetCheck.ok) {
      await update(
        input.supabase.from('autonomy_actions')
          .update({
            status: 'blocked',
            output: {
              approved: true,
              budget_breach: budgetCheck.reason,
              detail: budgetCheck.detail,
              action_type: action.action_type,
            },
            updated_at: nowIso,
          })
          .eq('id', action.id)
          .eq('user_id', input.userId)
      )
      return {
        approvalId: approval.id,
        actionId: action.id,
        actionType: action.action_type,
        status: input.decision,
        executed: false,
      }
    }
  }

  let executed = false
  let actionStatus = 'planned'
  let output: Record<string, unknown> = { approved: true }

  if (action.action_type === 'stop_venture') {
    if (!action.venture_id) throw new ApprovalExecutionError('Venture manquante pour stop_venture', 422)
    await executeStopVenture({
      supabase: input.supabase,
      userId: input.userId,
      ventureId: action.venture_id,
      nowIso,
    })
    executed = true
    actionStatus = 'completed'
    output = { executed: true, handler: 'stop_venture' }
  }

  if (action.action_type === 'deploy') {
    const deployInput = readDeployInput(action)
    try {
      const deployment = await (input.coolifyClient ?? createCoolifyClient())
        .triggerDeploy(deployInput)
      executed = true
      actionStatus = 'completed'
      output = {
        executed: true,
        handler: 'deploy',
        deploymentId: deployment.deploymentId,
      }
    } catch (error) {
      actionStatus = 'failed'
      output = {
        executed: false,
        handler: 'deploy',
        error: error instanceof Error ? error.message : 'Coolify deploy failed',
      }
    }
  }

  if (action.action_type === 'publish_campaign') {
    const draftId = action.input?.draft_id
    if (typeof draftId !== 'string' || draftId.length === 0) {
      throw new ApprovalExecutionError('draft_id manquant pour publish_campaign', 422)
    }
    const channel = typeof action.input?.channel === 'string' ? action.input.channel : ''
    const publisher = input.marketingPublisher ?? getMarketingPublisher(channel)
    const publishResult: ExecutePublishResult = await executePublishCampaign({
      supabase: input.supabase as unknown as PublishActionSupabase,
      publisher,
      draftId,
      userId: input.userId,
      now: input.now,
    })
    if (publishResult.success) {
      executed = true
      actionStatus = 'completed'
      output = {
        executed: true,
        handler: 'publish_campaign',
        draft_id: draftId,
        external_id: publishResult.externalId,
        url: publishResult.url ?? null,
        spend_eur: publishResult.spendEur,
      }
    } else {
      actionStatus = 'failed'
      output = {
        executed: false,
        handler: 'publish_campaign',
        draft_id: draftId,
        error: publishResult.error,
      }
    }
  }

  await update(
    input.supabase.from('autonomy_actions')
      .update({
        status: actionStatus,
        output,
        updated_at: nowIso,
      })
      .eq('id', action.id)
      .eq('user_id', input.userId)
  )

  return {
    approvalId: approval.id,
    actionId: action.id,
    actionType: action.action_type,
    status: input.decision,
    executed,
  }
}
