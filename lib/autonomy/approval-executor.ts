import { createCoolifyClient, type CoolifyClient } from '@/lib/coolify/client'
import { randomUUID } from 'crypto'
import { getAutonomyConfig, type AutonomyConfig } from './config'
import { checkBudgetPolicy } from './policy'
import {
  buildCheckoutSessionParams,
  parsePaymentOutputPayload,
  type PaymentOutput,
} from '@/lib/stripe/checkout-action'
import { createStripeClientFromSecretKey, getOptionalStripeSecretKey } from '@/lib/stripe/server'
import {
  executePublishCampaign,
  type ExecutePublishResult,
  type PublishActionSupabase,
} from '@/lib/marketing/publish-action'
import { getMarketingPublisher, type MarketingPublisher } from '@/lib/marketing/adapters'
import { buildGmailDraftPayload } from '@/lib/prospect/gmail-draft'
import { appendProspectActivity } from '@/lib/prospect/activity'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import { getFollowUpRank, scheduleNextFollowUpAt } from '@/lib/prospect/follow-up'
import {
  resolveEmailDeliveryStatus,
  sendProspectEmail,
  type ProspectEmailSendResult,
} from '@/lib/prospect/email-delivery'
import type { ProspectOutreachKind } from '@/lib/prospect/types'
import { writeProspectMemory } from '@/lib/memory/prospect-memory'

type QueryResponse = { data: unknown; error: { message: string } | null }

interface QueryResult extends PromiseLike<QueryResponse> {}

interface QueryFilterBuilder extends QueryResult {
  select(columns?: string): QueryFilterBuilder
  eq(field: string, value: unknown): QueryFilterBuilder
  single(): PromiseLike<QueryResponse>
  maybeSingle(): PromiseLike<QueryResponse>
}

interface TableQueryBuilder {
  select(columns?: string): QueryFilterBuilder
  update(row: Record<string, unknown>): QueryFilterBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryFilterBuilder
}

export interface ApprovalExecutorSupabase {
  from(table: string): TableQueryBuilder
}

type ApprovalResolution = 'approved' | 'rejected'
type StripeClientFactory = (secretKey: string) => CheckoutStripeClient

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

interface ProspectRow {
  id: string
  user_id: string
  company_name?: string | null
  source?: string | null
  band?: string | null
  contact_email?: string | null
  status?: string | null
  pipeline_status?: string | null
  follow_up_count?: number | null
  last_outreach_kind?: string | null
  follow_up_version?: number | null
  metadata?: Record<string, unknown> | null
}

interface ProspectApprovalActionRow {
  id: string
  user_id: string
  action_type: string
  status: string
  input?: Record<string, unknown> | null
}

interface VentureSpendRow {
  venture_id?: string | null
  amount_eur?: number | null
}

interface CheckoutStripeClient {
  checkout: {
    sessions: {
      create(params: ReturnType<typeof buildCheckoutSessionParams>): Promise<{
        id: string
        url: string | null
        mode: string | null
        payment_intent?: string | { id?: string | null } | null
        customer_details?: { email?: string | null } | null
      }>
    }
  }
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
  stripeClient?: CheckoutStripeClient
  stripeClientFactory?: StripeClientFactory
  marketingPublisher?: MarketingPublisher
  prospectEmailSender?: (input: {
    from: string
    to: string
    subject: string
    text: string
  }) => Promise<ProspectEmailSendResult>
  writeProspectMemory?: typeof writeProspectMemory
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
  constructor(
    message: string,
    readonly status = 500
  ) {
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

async function maybeSingleRow<T>(query: QueryFilterBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new ApprovalExecutionError(error.message, 500)
  return data as T | null
}

async function rejectSupersededProspectApprovals(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  prospectId: string
  currentActionId: string
  nowIso: string
}) {
  const { data, error } = await input.supabase
    .from('autonomy_actions')
    .select('id, user_id, action_type, status, input')
    .eq('user_id', input.userId)
    .eq('action_type', 'send_outreach')

  if (error) throw new ApprovalExecutionError(error.message, 500)

  const siblingActions = ((data ?? []) as ProspectApprovalActionRow[]).filter((row) => {
    const rowProspectId =
      row.input && typeof row.input.prospect_id === 'string' ? row.input.prospect_id : null
    return (
      row.id !== input.currentActionId &&
      row.status === 'blocked' &&
      rowProspectId === input.prospectId
    )
  })

  for (const siblingAction of siblingActions) {
    await update(
      input.supabase
        .from('autonomy_actions')
        .update({
          status: 'cancelled',
          output: {
            approved: false,
            superseded_by_action_id: input.currentActionId,
            reason: 'superseded_by_sent_outreach',
          },
          updated_at: input.nowIso,
        })
        .eq('id', siblingAction.id)
        .eq('user_id', input.userId)
        .eq('status', 'blocked')
    )

    await update(
      input.supabase
        .from('human_approvals')
        .update({
          status: 'rejected',
          approved_by: input.userId,
          approved_at: input.nowIso,
          updated_at: input.nowIso,
        })
        .eq('action_id', siblingAction.id)
        .eq('user_id', input.userId)
        .eq('status', 'pending')
    )
  }
}

async function claimPendingApproval(input: {
  supabase: ApprovalExecutorSupabase
  approvalId: string
  userId: string
  decision: ApprovalResolution
  nowIso: string
}): Promise<void> {
  const claimed = await maybeSingleRow<HumanApprovalRow>(
    input.supabase
      .from('human_approvals')
      .update({
        status: input.decision,
        approved_by: input.userId,
        approved_at: input.nowIso,
        updated_at: input.nowIso,
      })
      .eq('id', input.approvalId)
      .eq('user_id', input.userId)
      .eq('status', 'pending')
      .select('id')
  )

  if (!claimed) {
    throw new ApprovalExecutionError('Approval déjà traitée', 409)
  }
}

async function executeStopVenture(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  ventureId: string
  nowIso: string
}) {
  await update(
    input.supabase
      .from('ventures')
      .update({
        statut: 'stopped',
        lifecycle_status: 'stopped',
        current_decision: 'stop',
        last_decision_at: input.nowIso,
        stage: 'Stopped',
        next_action: 'Venture arrêtée après approbation humaine',
        decision_at: input.nowIso,
      })
      .eq('id', input.ventureId)
      .eq('user_id', input.userId)
  )

  await update(
    input.supabase
      .from('landing_pages')
      .update({ statut: 'stopped', health_status: 'stopped' })
      .eq('venture_id', input.ventureId)
  )

  await update(
    input.supabase
      .from('budget_requests')
      .update({ status: 'rejected' })
      .eq('venture_id', input.ventureId)
      .eq('status', 'pending')
  )

  await update(
    input.supabase
      .from('campaigns')
      .update({ status: 'rejected' })
      .eq('venture_id', input.ventureId)
  )

  await update(
    input.supabase
      .from('payments')
      .update({ status: 'disabled', provider_status: 'disabled' })
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

function isProspectApprovalAction(actionType: string) {
  return actionType === 'send_outreach' || actionType === 'send_follow_up'
}

function asOutreachKind(value: unknown): ProspectOutreachKind {
  switch (value) {
    case 'follow_up_1':
    case 'follow_up_2':
    case 'follow_up_3':
      return value
    default:
      return 'initial'
  }
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

function readCheckoutInput(action: AutonomyActionRow): {
  payment: PaymentOutput
  successUrl: string
  cancelUrl: string
} {
  const paymentPayload = action.input?.payment ?? action.input?.payment_output
  const successUrl = action.input?.successUrl
  const cancelUrl = action.input?.cancelUrl

  if (typeof successUrl !== 'string' || successUrl.length === 0) {
    throw new ApprovalExecutionError('successUrl manquant pour create_checkout', 422)
  }

  if (typeof cancelUrl !== 'string' || cancelUrl.length === 0) {
    throw new ApprovalExecutionError('cancelUrl manquant pour create_checkout', 422)
  }

  if (typeof paymentPayload === 'string') {
    return { payment: parsePaymentOutputPayload(JSON.parse(paymentPayload)), successUrl, cancelUrl }
  }

  return { payment: parsePaymentOutputPayload(paymentPayload), successUrl, cancelUrl }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

async function executeScaleBudget(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  action: AutonomyActionRow
  nowIso: string
}) {
  if (!input.action.venture_id) {
    throw new ApprovalExecutionError('Venture manquante pour scale_budget', 422)
  }

  const budgetEur = readPositiveNumber(
    input.action.input?.recommended_budget_eur,
    readPositiveNumber(input.action.estimated_cost_eur, 25)
  )
  const channel = readString(input.action.input?.channel, 'email').toLowerCase()
  const rationale = readString(input.action.input?.rationale, 'ROI positif')
  const nextStep = readString(
    input.action.input?.next_step,
    `Scaler ${channel} avec ${budgetEur} EUR`
  )
  const content = readString(
    input.action.input?.content,
    [
      nextStep,
      '',
      'Test budget scale piloté par Kenomi. Objectif: convertir vite, mesurer ROI, couper si le signal faiblit.',
    ].join('\n')
  )

  await update(
    input.supabase.from('budget_requests').insert({
      venture_id: input.action.venture_id,
      campaign_name: `Scale ${channel}`,
      amount_eur: budgetEur,
      reason: rationale,
      status: 'approved',
      approved_at: input.nowIso,
      created_at: input.nowIso,
    })
  )

  const draftId = randomUUID()
  await update(
    input.supabase.from('campaign_drafts').insert({
      id: draftId,
      user_id: input.userId,
      venture_id: input.action.venture_id,
      channel,
      content,
      status: 'blocked',
      metadata: {
        budget_eur: budgetEur,
        source: 'scale_budget',
        autonomy_action_id: input.action.id,
        rationale,
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
  )

  const publishActionId = randomUUID()
  await update(
    input.supabase.from('autonomy_actions').insert({
      id: publishActionId,
      user_id: input.userId,
      venture_id: input.action.venture_id,
      action_type: 'publish_campaign',
      risk_level: 'high',
      status: 'blocked',
      estimated_cost_eur: budgetEur,
      budget_cap_eur: Math.max(budgetEur, Number(input.action.budget_cap_eur ?? budgetEur)),
      input: {
        draft_id: draftId,
        channel,
        source: 'scale_budget',
        parent_action_id: input.action.id,
      },
      output: {},
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
  )

  await update(
    input.supabase.from('human_approvals').insert({
      user_id: input.userId,
      action_id: publishActionId,
      status: 'pending',
      reason: `Publier scale ${channel} avec ${budgetEur} EUR`,
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
  )

  return {
    budgetEur,
    channel,
    draftId,
    publishActionId,
  }
}

async function executeCreateCheckout(input: {
  supabase: ApprovalExecutorSupabase
  stripeClient: CheckoutStripeClient
  action: AutonomyActionRow
  nowIso: string
}) {
  if (!input.action.venture_id) {
    throw new ApprovalExecutionError('Venture manquante pour create_checkout', 422)
  }

  const checkoutInput = readCheckoutInput(input.action)
  const session = await input.stripeClient.checkout.sessions.create(
    buildCheckoutSessionParams({
      payment: checkoutInput.payment,
      ventureId: input.action.venture_id,
      successUrl: checkoutInput.successUrl,
      cancelUrl: checkoutInput.cancelUrl,
    })
  )

  await update(
    input.supabase.from('payments').insert({
      venture_id: input.action.venture_id,
      stripe_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amount_eur: checkoutInput.payment.price_amount / 100,
      expected_amount_eur: checkoutInput.payment.price_amount / 100,
      collected_amount_eur: 0,
      trial_days: checkoutInput.payment.trial_days,
      currency: checkoutInput.payment.price_currency.toLowerCase(),
      status: 'pending',
      provider_status: 'ready',
      provider_session_id: session.id,
      customer_email: session.customer_details?.email ?? null,
      checkout_url: session.url,
      checkout_mode: session.mode,
      autonomy_action_id: input.action.id,
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
  )

  return {
    stripeSessionId: session.id,
    checkoutUrl: session.url,
  }
}

async function getUserStripeSecretKey(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
}): Promise<string | null> {
  const { data, error } = await input.supabase
    .from('user_settings')
    .select('stripe_secret_key')
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new ApprovalExecutionError(error.message, 500)

  const key = (data as { stripe_secret_key?: unknown } | null)?.stripe_secret_key
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : null
}

async function getUserProspectOutreachEmail(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
}): Promise<string | null> {
  const { data, error } = await input.supabase
    .from('user_settings')
    .select('prospect_outreach_email')
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new ApprovalExecutionError(error.message, 500)

  const value = (data as { prospect_outreach_email?: unknown } | null)?.prospect_outreach_email
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

async function resolveCheckoutStripeClient(input: {
  supabase: ApprovalExecutorSupabase
  userId: string
  stripeClient?: CheckoutStripeClient
  stripeClientFactory?: StripeClientFactory
}): Promise<CheckoutStripeClient> {
  if (input.stripeClient) return input.stripeClient

  const secretKey = getOptionalStripeSecretKey() ?? (await getUserStripeSecretKey(input))
  if (!secretKey) throw new ApprovalExecutionError('STRIPE_SECRET_KEY missing', 500)

  return (input.stripeClientFactory ?? createStripeClientFromSecretKey)(secretKey)
}

export async function resolveHumanApproval(
  input: ResolveHumanApprovalInput
): Promise<ResolveHumanApprovalResult> {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const config = input.config ?? getAutonomyConfig()
  const approval = await single<HumanApprovalRow>(
    input.supabase
      .from('human_approvals')
      .select('id, user_id, action_id, status')
      .eq('id', input.approvalId)
      .eq('user_id', input.userId),
    'Approval introuvable'
  )

  if (approval.status !== 'pending') {
    throw new ApprovalExecutionError('Approval déjà traitée', 409)
  }

  const action = await single<AutonomyActionRow>(
    input.supabase
      .from('autonomy_actions')
      .select(
        'id, user_id, venture_id, action_type, status, input, estimated_cost_eur, budget_cap_eur'
      )
      .eq('id', approval.action_id)
      .eq('user_id', input.userId),
    'Action autonome introuvable'
  )

  await claimPendingApproval({
    supabase: input.supabase,
    approvalId: approval.id,
    userId: input.userId,
    decision: input.decision,
    nowIso,
  })

  if (input.decision === 'rejected') {
    if (isProspectApprovalAction(action.action_type)) {
      const prospectId =
        typeof action.input?.prospect_id === 'string' ? action.input.prospect_id : null
      if (prospectId) {
        const prospect = await maybeSingleRow<ProspectRow>(
          input.supabase
            .from('prospects')
            .select(
              'id, user_id, contact_email, metadata, pipeline_status, follow_up_count, last_outreach_kind'
            )
            .eq('id', prospectId)
            .eq('user_id', input.userId)
        )
        if (prospect?.id) {
          const lastOutreachKind = asOutreachKind(
            action.input?.outreach_kind ?? prospect.last_outreach_kind
          )
          const followUpRejected = action.action_type === 'send_follow_up'
          const nextFollowUpAt = followUpRejected
            ? scheduleNextFollowUpAt(new Date(nowIso), lastOutreachKind)
            : undefined
          const followUpRank = getFollowUpRank(lastOutreachKind)
          await update(
            input.supabase
              .from('prospects')
              .update({
                metadata: appendProspectActivity(prospect.metadata, {
                  type: followUpRejected ? 'follow_up_rejected' : 'approval_rejected',
                  actor: 'operator',
                  at: nowIso,
                  detail: followUpRejected ? 'First follow-up rejected' : 'Outreach rejected',
                }),
                status: followUpRejected ? 'follow_up' : prospect.status,
                pipeline_status: followUpRejected ? 'sent' : prospect.pipeline_status,
                next_followup_at: nextFollowUpAt,
                follow_up_count: followUpRejected ? followUpRank : prospect.follow_up_count,
                last_activity_at: nowIso,
                updated_at: nowIso,
              })
              .eq('id', prospectId)
              .eq('user_id', input.userId)
          )
          await update(
            input.supabase.from('prospect_activities').insert(
              buildProspectActivityInsert({
                prospectId,
                userId: input.userId,
                type: followUpRejected ? 'follow_up_rejected' : 'approval_rejected',
                detail: followUpRejected ? 'First follow-up rejected' : 'Outreach rejected',
                metadata: { outreach_kind: lastOutreachKind },
                nowIso,
              })
            )
          )
        }
      }
    }

    await update(
      input.supabase
        .from('autonomy_actions')
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

  if (config.dryRun && isExternalAction(action.action_type)) {
    await update(
      input.supabase
        .from('autonomy_actions')
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
        input.supabase
          .from('autonomy_actions')
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
    if (!action.venture_id)
      throw new ApprovalExecutionError('Venture manquante pour stop_venture', 422)
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
      const deployment = await (input.coolifyClient ?? createCoolifyClient()).triggerDeploy(
        deployInput
      )
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

  if (action.action_type === 'create_checkout') {
    try {
      const checkout = await executeCreateCheckout({
        supabase: input.supabase,
        stripeClient: await resolveCheckoutStripeClient({
          supabase: input.supabase,
          userId: input.userId,
          stripeClient: input.stripeClient,
          stripeClientFactory: input.stripeClientFactory,
        }),
        action,
        nowIso,
      })
      executed = true
      actionStatus = 'completed'
      output = {
        executed: true,
        handler: 'create_checkout',
        stripe_session_id: checkout.stripeSessionId,
        checkout_url: checkout.checkoutUrl,
      }
    } catch (error) {
      actionStatus = 'failed'
      output = {
        executed: false,
        handler: 'create_checkout',
        error: error instanceof Error ? error.message : 'Stripe checkout failed',
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

  if (action.action_type === 'send_outreach' || action.action_type === 'send_follow_up') {
    const prospectId =
      typeof action.input?.prospect_id === 'string' ? action.input.prospect_id : null
    const companyName =
      typeof action.input?.company_name === 'string' ? action.input.company_name : 'Unknown company'
    const contactName =
      typeof action.input?.contact_name === 'string' ? action.input.contact_name : null
    const subject =
      typeof action.input?.outreach_subject === 'string'
        ? action.input.outreach_subject
        : 'Outbound draft'
    const body = typeof action.input?.outreach_body === 'string' ? action.input.outreach_body : ''
    const outreachKind = asOutreachKind(action.input?.outreach_kind)
    const followUpCount =
      typeof action.input?.follow_up_count === 'number' ? action.input.follow_up_count : 0
    const followUpVersion =
      typeof action.input?.follow_up_version === 'number' ? action.input.follow_up_version : 0

    if (!prospectId) {
      throw new ApprovalExecutionError(`prospect_id manquant pour ${action.action_type}`, 422)
    }

    const prospect = await maybeSingleRow<ProspectRow>(
      input.supabase
        .from('prospects')
        .select(
          'id, user_id, company_name, source, band, contact_email, metadata, follow_up_count, follow_up_version, pipeline_status'
        )
        .eq('id', prospectId)
        .eq('user_id', input.userId)
    )

    if (!prospect?.id) {
      throw new ApprovalExecutionError(`prospect introuvable pour ${action.action_type}`, 404)
    }

    const draftId = randomUUID()
    const draft = buildGmailDraftPayload({
      prospectId,
      companyName,
      contactName,
      to: prospect.contact_email ?? null,
      subject,
      body,
      outreachKind,
      followUpCount,
      followUpVersion,
    })

    const providerStatus = resolveEmailDeliveryStatus()
    const fromAddress =
      providerStatus.fromAddress ??
      (await getUserProspectOutreachEmail({
        supabase: input.supabase,
        userId: input.userId,
      }))
    const canSendLive =
      (providerStatus.configured || Boolean(input.prospectEmailSender)) &&
      typeof prospect.contact_email === 'string' &&
      prospect.contact_email.trim().length > 0 &&
      typeof fromAddress === 'string' &&
      fromAddress.trim().length > 0

    let liveDelivery: ProspectEmailSendResult | null = null
    let liveDeliveryError: string | null = null

    if (canSendLive) {
      try {
        liveDelivery = await (
          input.prospectEmailSender ?? ((message) => sendProspectEmail(message))
        )({
          from: fromAddress!,
          to: prospect.contact_email!.trim(),
          subject,
          text: body,
        })
      } catch (error) {
        liveDeliveryError =
          error instanceof Error ? error.message : 'Prospect email delivery failed'
      }
    }

    await update(
      input.supabase.from('campaign_drafts').insert({
        id: draftId,
        user_id: input.userId,
        venture_id: null,
        channel: draft.channel,
        content: draft.content,
        status: liveDelivery ? 'published' : draft.status,
        metadata: {
          ...draft.metadata,
          provider: liveDelivery?.provider ?? draft.provider,
          autonomy_action_id: action.id,
          from: fromAddress ?? '',
          delivery_status: liveDelivery ? 'sent' : 'draft',
          provider_message_id: liveDelivery?.messageId ?? null,
          delivery_error: liveDeliveryError,
        },
        created_at: nowIso,
        updated_at: nowIso,
      })
    )

    const sentActivityType =
      action.action_type === 'send_follow_up' ? 'follow_up_marked_sent' : 'marked_sent'
    const sentActivityDetail =
      action.action_type === 'send_follow_up'
        ? `${outreachKind} sent via ${liveDelivery?.provider ?? 'draft'}`
        : `Outbound sent via ${liveDelivery?.provider ?? 'draft'}`
    const followUpPatch =
      action.action_type === 'send_follow_up'
        ? {
            last_outreach_kind: outreachKind,
            follow_up_count: getFollowUpRank(outreachKind),
            follow_up_version: followUpVersion,
            next_followup_at: scheduleNextFollowUpAt(new Date(nowIso), outreachKind),
            last_contacted_at: nowIso,
            last_activity_at: nowIso,
          }
        : {
            last_contacted_at: nowIso,
            last_activity_at: nowIso,
          }

    await update(
      input.supabase
        .from('prospects')
        .update({
          status: liveDelivery
            ? action.action_type === 'send_follow_up'
              ? 'follow_up'
              : 'sent'
            : action.action_type === 'send_follow_up'
              ? 'follow_up'
              : 'approved_to_send',
          pipeline_status: liveDelivery ? 'sent' : 'draft_created',
          draft_provider: liveDelivery?.provider ?? 'gmail',
          draft_external_id: liveDelivery?.messageId ?? draftId,
          draft_created_at: nowIso,
          ...followUpPatch,
          metadata: appendProspectActivity(
            appendProspectActivity(prospect.metadata, {
              type:
                action.action_type === 'send_follow_up'
                  ? 'follow_up_approved'
                  : 'approval_approved',
              actor: 'operator',
              at: nowIso,
              detail:
                action.action_type === 'send_follow_up'
                  ? 'First follow-up approved'
                  : 'Outreach approved',
            }),
            {
              type: liveDelivery ? sentActivityType : 'gmail_draft_created',
              actor: liveDelivery ? 'operator' : 'system',
              at: nowIso,
              detail: liveDelivery ? sentActivityDetail : `Gmail draft ${draftId} created`,
            }
          ),
          updated_at: nowIso,
        })
        .eq('id', prospectId)
        .eq('user_id', input.userId)
    )
    await update(
      input.supabase.from('prospect_activities').insert([
        buildProspectActivityInsert({
          prospectId,
          userId: input.userId,
          type:
            action.action_type === 'send_follow_up' ? 'follow_up_approved' : 'approval_approved',
          detail:
            action.action_type === 'send_follow_up'
              ? 'First follow-up approved'
              : 'Outreach approved',
          metadata: { outreach_kind: outreachKind, follow_up_version: followUpVersion },
          nowIso,
        }),
        buildProspectActivityInsert({
          prospectId,
          userId: input.userId,
          type: liveDelivery ? sentActivityType : 'gmail_draft_created',
          detail: liveDelivery ? sentActivityDetail : `Gmail draft ${draftId} created`,
          metadata: {
            outreach_kind: outreachKind,
            follow_up_version: followUpVersion,
            provider: liveDelivery?.provider ?? 'gmail',
            message_id: liveDelivery?.messageId ?? null,
            delivery_error: liveDeliveryError,
          },
          nowIso,
        }),
      ])
    )

    if (action.action_type === 'send_outreach') {
      try {
        const metadata =
          prospect.metadata && typeof prospect.metadata === 'object'
            ? (prospect.metadata as Record<string, unknown>)
            : {}
        await (input.writeProspectMemory ?? writeProspectMemory)({
          userId: input.userId,
          prospectId,
          companyName: prospect.company_name ?? companyName,
          memoryKind: 'outreach_draft_created',
          pipelineStatus: 'draft_created',
          band: typeof prospect.band === 'string' ? prospect.band : 'warm',
          source: typeof prospect.source === 'string' ? prospect.source : 'other',
          createdAt: nowIso,
          summary: typeof metadata.summary === 'string' ? metadata.summary : null,
          painPoints: Array.isArray(metadata.pain_points)
            ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
            : [],
          outreachKind,
        })
      } catch (error) {
        console.error('prospect memory write failed', error)
      }

      await rejectSupersededProspectApprovals({
        supabase: input.supabase,
        userId: input.userId,
        prospectId,
        currentActionId: action.id,
        nowIso,
      })
    }

    executed = Boolean(liveDelivery)
    actionStatus = 'completed'
    output = {
      executed: Boolean(liveDelivery),
      handler: action.action_type,
      draft_id: draftId,
      provider: liveDelivery?.provider ?? 'gmail',
      message_id: liveDelivery?.messageId ?? null,
      delivery_error: liveDeliveryError,
    }
  }

  if (action.action_type === 'scale_budget') {
    try {
      const scale = await executeScaleBudget({
        supabase: input.supabase,
        userId: input.userId,
        action,
        nowIso,
      })
      executed = true
      actionStatus = 'completed'
      output = {
        executed: true,
        handler: 'scale_budget',
        budget_eur: scale.budgetEur,
        channel: scale.channel,
        draft_id: scale.draftId,
        publish_action_id: scale.publishActionId,
      }
    } catch (error) {
      actionStatus = 'failed'
      output = {
        executed: false,
        handler: 'scale_budget',
        error: error instanceof Error ? error.message : 'Scale budget failed',
      }
    }
  }

  await update(
    input.supabase
      .from('autonomy_actions')
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
