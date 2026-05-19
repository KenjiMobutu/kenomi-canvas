export type RevenueLoopStageKey =
  | 'idea'
  | 'validation'
  | 'landing'
  | 'payment'
  | 'checkout'
  | 'marketing'
  | 'revenue'
  | 'decision'

export type RevenueLoopStageStatus = 'idle' | 'ready' | 'blocked' | 'running' | 'done'

export interface RevenuePipelineRow {
  id: string
  user_id?: string | null
  venture_id?: string | null
  idea_title?: string | null
  status?: string | null
  validation_output?: string | null
  builder_output?: string | null
  payment_output?: string | null
  marketing_output?: string | null
  decision_output?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface RevenueVentureRow {
  id: string
  name?: string | null
  stage?: string | null
  mrr?: string | number | null
  score?: number | null
  next_action?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface RevenuePaymentRow {
  id: string
  venture_id?: string | null
  status?: string | null
  provider_status?: string | null
  amount_eur?: number | string | null
  checkout_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface RevenueCampaignDraftRow {
  id: string
  venture_id?: string | null
  status?: string | null
  channel?: string | null
  created_at?: string | null
  published_at?: string | null
}

export interface RevenueAutonomyActionRow {
  id: string
  venture_id?: string | null
  action_type?: string | null
  risk_level?: string | null
  status?: string | null
  input?: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface RevenueApprovalRow {
  id: string
  action_id?: string | null
  status?: string | null
  reason?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface RevenueDecisionRow {
  id: string
  venture_id?: string | null
  decision?: string | null
  reason?: string | null
  created_at?: string | null
}

export interface RevenueLoopInput {
  pipelines: RevenuePipelineRow[]
  ventures: RevenueVentureRow[]
  payments: RevenuePaymentRow[]
  campaignDrafts: RevenueCampaignDraftRow[]
  autonomyActions: RevenueAutonomyActionRow[]
  approvals: RevenueApprovalRow[]
  decisions: RevenueDecisionRow[]
}

export interface RevenueLoopStage {
  key: RevenueLoopStageKey
  label: string
  status: RevenueLoopStageStatus
}

export type RevenueLoopNextAction =
  | {
      type: 'run_agent'
      label: string
      agentId: 'scout' | 'validation' | 'builder' | 'payment' | 'marketing' | 'decision'
      ventureId?: string | null
    }
  | { type: 'create_checkout'; label: string; ventureId: string; pipelineId: string }
  | {
      type: 'resolve_approval'
      label: string
      approvalId: string
      actionId: string
      actionType: string
      ventureId?: string | null
      reason?: string | null
    }
  | {
      type: 'configure_stripe'
      label: string
      pipelineId?: string | null
      ventureId?: string | null
      reason: string
    }
  | { type: 'review_pipeline'; label: string; pipelineId: string; ventureId?: string | null }
  | { type: 'monitor'; label: string; ventureId?: string | null }

export interface RevenueLoopItem {
  id: string
  pipelineId?: string | null
  ventureId?: string | null
  ventureName: string
  status: string
  revenueEur: number
  paidPayments: number
  checkoutUrl?: string | null
  pendingApproval?: RevenueApprovalRow | null
  blockedAction?: RevenueAutonomyActionRow | null
  stages: RevenueLoopStage[]
  nextAction: RevenueLoopNextAction
  priorityScore: number
  priorityReason: string
  blockedRevenueEur: number
  updatedAt?: string | null
}

export type RevenueLoopRecommendedAction = RevenueLoopNextAction & {
  loopId: string
  ventureName: string
  priorityScore: number
  blockedRevenueEur: number
  reason: string
}

export interface RevenueLoopSnapshot {
  summary: {
    activeLoops: number
    readyCheckouts: number
    pendingApprovals: number
    blockedLoops: number
    revenueEur: number
    paidPayments: number
    blockedRevenueEur: number
    recommendedAction: RevenueLoopRecommendedAction | null
  }
  loops: RevenueLoopItem[]
  agentRevenueAttribution: Array<{
    ventureId: string
    ventureName: string
    revenueEur: number
    paidPayments: number
  }>
}

const STAGE_LABELS: Record<RevenueLoopStageKey, string> = {
  idea: 'Idea',
  validation: 'Validation',
  landing: 'Landing',
  payment: 'Payment',
  checkout: 'Checkout',
  marketing: 'Marketing',
  revenue: 'Revenue',
  decision: 'Decision',
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isPaid(payment: RevenuePaymentRow) {
  const statuses = [payment.status, payment.provider_status].map((status) =>
    String(status ?? '').toLowerCase()
  )
  return statuses.some((status) => ['paid', 'completed', 'succeeded', 'success'].includes(status))
}

function hasCheckout(payment: RevenuePaymentRow) {
  return Boolean(payment.checkout_url)
}

function byDateDesc<T extends { created_at?: string | null; updated_at?: string | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const bd = Date.parse(b.updated_at ?? b.created_at ?? '') || 0
    const ad = Date.parse(a.updated_at ?? a.created_at ?? '') || 0
    return bd - ad
  })
}

function stage(key: RevenueLoopStageKey, status: RevenueLoopStageStatus): RevenueLoopStage {
  return { key, label: STAGE_LABELS[key], status }
}

function parsePaymentOutputAmount(raw: string | null | undefined): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { price_amount?: unknown }
    const cents = Number(parsed.price_amount)
    if (!Number.isFinite(cents) || cents <= 0) return 0
    return cents / 100
  } catch {
    return 0
  }
}

function estimateBlockedRevenueEur(input: {
  pipeline?: RevenuePipelineRow
  payments: RevenuePaymentRow[]
  revenueEur: number
}): number {
  if (input.revenueEur > 0) return 0
  const pendingPayment = byDateDesc(input.payments).find(
    (payment) => toNumber(payment.amount_eur) > 0
  )
  if (pendingPayment) return toNumber(pendingPayment.amount_eur)
  return parsePaymentOutputAmount(input.pipeline?.payment_output)
}

function priorityFor(input: { nextAction: RevenueLoopNextAction; blockedRevenueEur: number }): {
  priorityScore: number
  priorityReason: string
} {
  const { nextAction, blockedRevenueEur } = input
  if (nextAction.type === 'resolve_approval') {
    return {
      priorityScore: 100,
      priorityReason:
        nextAction.actionType === 'create_checkout'
          ? 'Approval checkout bloque le revenu'
          : 'Approval humaine bloque la boucle',
    }
  }
  if (nextAction.type === 'create_checkout') {
    return { priorityScore: 90, priorityReason: 'Checkout Stripe manquant' }
  }
  if (nextAction.type === 'configure_stripe') {
    return { priorityScore: 95, priorityReason: nextAction.reason }
  }
  if (nextAction.type === 'run_agent' && nextAction.agentId === 'payment') {
    return { priorityScore: 80, priorityReason: 'Offre tarifée manquante' }
  }
  if (nextAction.type === 'run_agent' && nextAction.agentId === 'marketing') {
    return {
      priorityScore: blockedRevenueEur > 0 ? 75 : 65,
      priorityReason: 'Distribution manquante',
    }
  }
  if (nextAction.type === 'run_agent' && nextAction.agentId === 'decision') {
    return { priorityScore: 70, priorityReason: 'Décision post-revenu manquante' }
  }
  if (nextAction.type === 'review_pipeline') {
    return { priorityScore: 60, priorityReason: 'Idée à valider avant monétisation' }
  }
  if (nextAction.type === 'run_agent') {
    return { priorityScore: 50, priorityReason: 'Agent requis pour avancer vers le revenu' }
  }
  return { priorityScore: 10, priorityReason: 'Boucle à surveiller' }
}

function hasMissingStripeSecret(action: RevenueAutonomyActionRow): boolean {
  if (action.action_type !== 'create_checkout' || action.status !== 'failed') return false
  const error = action.output?.error
  return typeof error === 'string' && error.includes('STRIPE_SECRET_KEY missing')
}

export function buildRevenueLoopSnapshot(input: RevenueLoopInput): RevenueLoopSnapshot {
  const venturesById = new Map(input.ventures.map((venture) => [venture.id, venture]))
  const actionsById = new Map(input.autonomyActions.map((action) => [action.id, action]))
  const pendingApprovals = input.approvals.filter((approval) => approval.status === 'pending')
  const pendingApprovalByActionId = new Map(
    pendingApprovals.flatMap((approval) =>
      approval.action_id ? [[approval.action_id, approval] as const] : []
    )
  )

  const paymentsByVenture = new Map<string, RevenuePaymentRow[]>()
  for (const payment of input.payments) {
    if (!payment.venture_id) continue
    paymentsByVenture.set(payment.venture_id, [
      ...(paymentsByVenture.get(payment.venture_id) ?? []),
      payment,
    ])
  }

  const actionsByVenture = new Map<string, RevenueAutonomyActionRow[]>()
  for (const action of input.autonomyActions) {
    if (!action.venture_id) continue
    actionsByVenture.set(action.venture_id, [
      ...(actionsByVenture.get(action.venture_id) ?? []),
      action,
    ])
  }

  const draftsByVenture = new Map<string, RevenueCampaignDraftRow[]>()
  for (const draft of input.campaignDrafts) {
    if (!draft.venture_id) continue
    draftsByVenture.set(draft.venture_id, [...(draftsByVenture.get(draft.venture_id) ?? []), draft])
  }

  const decisionsByVenture = new Map<string, RevenueDecisionRow[]>()
  for (const decision of input.decisions) {
    if (!decision.venture_id) continue
    decisionsByVenture.set(decision.venture_id, [
      ...(decisionsByVenture.get(decision.venture_id) ?? []),
      decision,
    ])
  }

  const pipelineLoops = byDateDesc(input.pipelines).map((pipeline) => {
    const venture = pipeline.venture_id ? venturesById.get(pipeline.venture_id) : undefined
    const ventureName = venture?.name ?? pipeline.idea_title ?? 'Venture sans nom'
    const venturePayments = pipeline.venture_id
      ? (paymentsByVenture.get(pipeline.venture_id) ?? [])
      : []
    const paidPayments = venturePayments.filter(isPaid)
    const revenueEur = paidPayments.reduce((sum, payment) => sum + toNumber(payment.amount_eur), 0)
    const checkoutPayment = byDateDesc(venturePayments).find(hasCheckout)
    const ventureActions = pipeline.venture_id
      ? byDateDesc(actionsByVenture.get(pipeline.venture_id) ?? [])
      : []
    const blockedAction = ventureActions.find((action) => {
      if (action.status !== 'blocked') return false
      return Boolean(pendingApprovalByActionId.get(action.id))
    })
    const missingStripeAction = ventureActions.find(hasMissingStripeSecret)
    const pendingApproval = blockedAction ? pendingApprovalByActionId.get(blockedAction.id) : null
    const ventureDrafts = pipeline.venture_id
      ? (draftsByVenture.get(pipeline.venture_id) ?? [])
      : []
    const publishedDraft = ventureDrafts.find((draft) => draft.status === 'published')
    const hasDecision = Boolean(
      pipeline.decision_output ||
      (pipeline.venture_id && decisionsByVenture.get(pipeline.venture_id)?.length)
    )

    const checkoutStatus: RevenueLoopStageStatus = pendingApproval
      ? 'blocked'
      : missingStripeAction
        ? 'blocked'
      : checkoutPayment
        ? 'done'
        : pipeline.payment_output
          ? 'ready'
          : 'idle'

    const marketingBlocked = ventureDrafts.some((draft) =>
      ['pending', 'pending_approval', 'blocked', 'ready'].includes(String(draft.status ?? ''))
    )

    const stages: RevenueLoopStage[] = [
      stage('idea', 'done'),
      stage(
        'validation',
        pipeline.validation_output ? 'done' : pipeline.status === 'approved' ? 'ready' : 'idle'
      ),
      stage(
        'landing',
        pipeline.builder_output ? 'done' : pipeline.validation_output ? 'ready' : 'idle'
      ),
      stage(
        'payment',
        pipeline.payment_output ? 'done' : pipeline.builder_output ? 'ready' : 'idle'
      ),
      stage('checkout', checkoutStatus),
      stage(
        'marketing',
        pipeline.marketing_output || publishedDraft
          ? 'done'
          : marketingBlocked
            ? 'blocked'
            : checkoutPayment
              ? 'ready'
              : 'idle'
      ),
      stage('revenue', revenueEur > 0 ? 'done' : checkoutPayment ? 'ready' : 'idle'),
      stage('decision', hasDecision ? 'done' : revenueEur > 0 ? 'ready' : 'idle'),
    ]

    let nextAction: RevenueLoopNextAction
    if (pendingApproval && blockedAction) {
      nextAction = {
        type: 'resolve_approval',
        label: `Traiter approval ${blockedAction.action_type}`,
        approvalId: pendingApproval.id,
        actionId: blockedAction.id,
        actionType: blockedAction.action_type ?? 'unknown',
        ventureId: pipeline.venture_id,
        reason: pendingApproval.reason,
      }
    } else if (missingStripeAction) {
      nextAction = {
        type: 'configure_stripe',
        label: 'Configurer Stripe',
        pipelineId: pipeline.id,
        ventureId: pipeline.venture_id,
        reason: 'Clé Stripe manquante',
      }
    } else if (pipeline.status === 'pending_validation') {
      nextAction = {
        type: 'review_pipeline',
        label: 'Valider ou rejeter l’idée',
        pipelineId: pipeline.id,
        ventureId: pipeline.venture_id,
      }
    } else if (!pipeline.validation_output) {
      nextAction = {
        type: 'run_agent',
        label: 'Lancer Validation',
        agentId: 'validation',
        ventureId: pipeline.venture_id,
      }
    } else if (!pipeline.builder_output) {
      nextAction = {
        type: 'run_agent',
        label: 'Lancer Builder',
        agentId: 'builder',
        ventureId: pipeline.venture_id,
      }
    } else if (!pipeline.payment_output) {
      nextAction = {
        type: 'run_agent',
        label: 'Lancer Payment',
        agentId: 'payment',
        ventureId: pipeline.venture_id,
      }
    } else if (!checkoutPayment && pipeline.venture_id) {
      nextAction = {
        type: 'create_checkout',
        label: 'Créer le checkout Stripe',
        ventureId: pipeline.venture_id,
        pipelineId: pipeline.id,
      }
    } else if (!pipeline.marketing_output) {
      nextAction = {
        type: 'run_agent',
        label: 'Lancer Marketing',
        agentId: 'marketing',
        ventureId: pipeline.venture_id,
      }
    } else if (revenueEur > 0 && !hasDecision) {
      nextAction = {
        type: 'run_agent',
        label: 'Lancer Decision',
        agentId: 'decision',
        ventureId: pipeline.venture_id,
      }
    } else {
      nextAction = {
        type: 'monitor',
        label: 'Surveiller la boucle',
        ventureId: pipeline.venture_id,
      }
    }

    const blockedRevenueEur = estimateBlockedRevenueEur({
      pipeline,
      payments: venturePayments,
      revenueEur,
    })
    const priority = priorityFor({ nextAction, blockedRevenueEur })

    return {
      id: pipeline.id,
      pipelineId: pipeline.id,
      ventureId: pipeline.venture_id,
      ventureName,
      status: pipeline.status ?? 'unknown',
      revenueEur,
      paidPayments: paidPayments.length,
      checkoutUrl: checkoutPayment?.checkout_url ?? null,
      pendingApproval,
      blockedAction,
      stages,
      nextAction,
      ...priority,
      blockedRevenueEur,
      updatedAt: pipeline.updated_at ?? pipeline.created_at ?? null,
    }
  })

  const ventureIdsWithPipeline = new Set(
    pipelineLoops.flatMap((loop) => (loop.ventureId ? [loop.ventureId] : []))
  )
  const ventureOnlyLoops: RevenueLoopItem[] = input.ventures
    .filter((venture) => !ventureIdsWithPipeline.has(venture.id))
    .map((venture) => {
      const venturePayments = paymentsByVenture.get(venture.id) ?? []
      const paidPayments = venturePayments.filter(isPaid)
      const revenueEur = paidPayments.reduce(
        (sum, payment) => sum + toNumber(payment.amount_eur),
        0
      )
      const nextAction: RevenueLoopNextAction = {
        type: 'run_agent',
        label: 'Lancer Scout',
        agentId: 'scout',
        ventureId: venture.id,
      }
      const blockedRevenueEur = estimateBlockedRevenueEur({
        payments: venturePayments,
        revenueEur,
      })
      const priority = priorityFor({ nextAction, blockedRevenueEur })
      return {
        id: `venture-${venture.id}`,
        ventureId: venture.id,
        ventureName: venture.name ?? 'Venture sans nom',
        status: venture.stage ?? 'unknown',
        revenueEur,
        paidPayments: paidPayments.length,
        checkoutUrl: byDateDesc(venturePayments).find(hasCheckout)?.checkout_url ?? null,
        pendingApproval: null,
        blockedAction: null,
        stages: [
          stage('idea', 'ready'),
          stage('validation', 'idle'),
          stage('landing', 'idle'),
          stage('payment', 'idle'),
          stage('checkout', 'idle'),
          stage('marketing', 'idle'),
          stage('revenue', revenueEur > 0 ? 'done' : 'idle'),
          stage('decision', 'idle'),
        ],
        nextAction,
        ...priority,
        blockedRevenueEur,
        updatedAt: venture.updated_at ?? venture.created_at ?? null,
      }
    })

  const loops = [...pipelineLoops, ...ventureOnlyLoops].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
    if (b.blockedRevenueEur !== a.blockedRevenueEur)
      return b.blockedRevenueEur - a.blockedRevenueEur
    const bd = Date.parse(b.updatedAt ?? '') || 0
    const ad = Date.parse(a.updatedAt ?? '') || 0
    return bd - ad
  })
  const revenueEur = loops.reduce((sum, loop) => sum + loop.revenueEur, 0)
  const paidPayments = loops.reduce((sum, loop) => sum + loop.paidPayments, 0)
  const blockedRevenueEur = loops.reduce((sum, loop) => sum + loop.blockedRevenueEur, 0)
  const topLoop = loops[0]
  const recommendedAction: RevenueLoopRecommendedAction | null = topLoop
    ? {
        ...topLoop.nextAction,
        loopId: topLoop.id,
        ventureName: topLoop.ventureName,
        priorityScore: topLoop.priorityScore,
        blockedRevenueEur: topLoop.blockedRevenueEur,
        reason: topLoop.priorityReason,
      }
    : null

  const agentRevenueAttribution = loops
    .filter((loop): loop is RevenueLoopItem & { ventureId: string } =>
      Boolean(loop.ventureId && loop.revenueEur > 0)
    )
    .map((loop) => ({
      ventureId: loop.ventureId,
      ventureName: loop.ventureName,
      revenueEur: loop.revenueEur,
      paidPayments: loop.paidPayments,
    }))
    .sort((a, b) => b.revenueEur - a.revenueEur)

  return {
    summary: {
      activeLoops: loops.length,
      readyCheckouts: loops.filter((loop) => loop.nextAction.type === 'create_checkout').length,
      pendingApprovals: pendingApprovals.length,
      blockedLoops: loops.filter((loop) =>
        ['resolve_approval', 'configure_stripe'].includes(loop.nextAction.type)
      ).length,
      revenueEur,
      paidPayments,
      blockedRevenueEur,
      recommendedAction,
    },
    loops,
    agentRevenueAttribution,
  }
}
