import type { AcquisitionEventRow, AcquisitionRoiSnapshot } from './metrics/acquisition-roi'
import type { RevenueAutopilotPlan } from './revenue-autopilot'

export type RevenueDailyCycleMode = 'calm' | 'attention'
export type RevenueDailyCycleStageStatus = 'done' | 'blocked' | 'waiting'

export type RevenueDailyCycleStageKey =
  | 'autopilot_daily'
  | 'campaign_published'
  | 'tracking_events'
  | 'stripe_payment'
  | 'roi_calculated'
  | 'decision_scale_cut'
  | 'approval_risk'
  | 'execution'

export interface RevenueDailyCycleStage {
  key: RevenueDailyCycleStageKey
  label: string
  status: RevenueDailyCycleStageStatus
  detail: string
  source: string
  risk?: string | null
}

export interface RevenueDailyCycleActionRow {
  id?: string
  action_type: string
  risk_level?: string | null
  status: string
}

export interface RevenueDailyCycleApprovalRow {
  id?: string
  action_id?: string | null
  status: string
}

export interface RevenueDailyCycleDecisionRow {
  decision?: string | null
  created_at?: string | null
}

export interface RevenueDailyCycleAudit {
  mode: RevenueDailyCycleMode
  generatedAt: string
  summary: {
    revenueEur: number
    spendEur: number
    profitEur: number
    roi: number
    recommendedBudgetEur: number
    pendingApprovalCount: number
  }
  stages: RevenueDailyCycleStage[]
}

export interface BuildRevenueDailyCycleAuditInput {
  plan: RevenueAutopilotPlan
  acquisition: AcquisitionRoiSnapshot
  events: AcquisitionEventRow[]
  actions: RevenueDailyCycleActionRow[]
  approvals: RevenueDailyCycleApprovalRow[]
  decisions: RevenueDailyCycleDecisionRow[]
  executed: Array<Record<string, unknown>>
  now?: Date
}

function eurFromCents(value: number): number {
  return Number((value / 100).toFixed(2))
}

function hasEvent(events: AcquisitionEventRow[], eventType: string): boolean {
  return events.some((event) => event.event_type === eventType)
}

function completed(actions: RevenueDailyCycleActionRow[], actionType: string): boolean {
  return actions.some(
    (action) => action.action_type === actionType && action.status === 'completed'
  )
}

function pendingRiskApprovals(input: BuildRevenueDailyCycleAuditInput) {
  const actionsById = new Map(input.actions.map((action) => [action.id, action]))
  return input.approvals.filter((approval) => {
    if (approval.status !== 'pending') return false
    const action = approval.action_id ? actionsById.get(approval.action_id) : null
    if (action?.action_type === 'create_checkout') return false
    return !action || action.risk_level === 'high' || action.status === 'blocked'
  })
}

export function buildRevenueDailyCycleAudit(
  input: BuildRevenueDailyCycleAuditInput
): RevenueDailyCycleAudit {
  const now = input.now ?? new Date()
  const pendingApprovals = pendingRiskApprovals(input)
  const hasCampaign =
    hasEvent(input.events, 'campaign_published') || completed(input.actions, 'publish_campaign')
  const hasTracking = input.events.some((event) =>
    [
      'page_view',
      'waitlist_signup',
      'campaign_published',
      'campaign_spend',
      'payment_succeeded',
    ].includes(event.event_type)
  )
  const hasRevenue =
    input.acquisition.summary.revenueCents > 0 || hasEvent(input.events, 'payment_succeeded')
  const hasRoiSignal =
    input.acquisition.summary.revenueCents > 0 || input.acquisition.summary.spendCents > 0
  const hasDecision =
    input.decisions.length > 0 ||
    input.actions.some((action) => ['scale_budget', 'stop_venture'].includes(action.action_type))
  const hasExecuted =
    input.executed.length > 0 || input.actions.some((action) => action.status === 'completed')

  const stages: RevenueDailyCycleStage[] = [
    {
      key: 'autopilot_daily',
      label: 'Autopilot quotidien',
      status:
        input.plan.mode === 'approval_required'
          ? 'blocked'
          : input.plan.mode === 'execute' || input.executed.length > 0
            ? 'done'
            : 'waiting',
      detail:
        input.plan.steps[0]?.label ??
        (input.plan.mode === 'hold' ? 'Aucune action revenue prioritaire.' : 'Cycle évalué.'),
      source: 'revenue_autopilot',
      risk: input.plan.steps[0]?.risk ?? null,
    },
    {
      key: 'campaign_published',
      label: 'Campagne publiée',
      status: hasCampaign ? 'done' : pendingApprovals.length > 0 ? 'blocked' : 'waiting',
      detail: hasCampaign
        ? 'Au moins une campagne publiée est reliée aux événements.'
        : 'La publication attend une action marketing ou une approval.',
      source: 'campaign_drafts · venture_events',
    },
    {
      key: 'tracking_events',
      label: 'Tracking events',
      status: hasTracking ? 'done' : 'waiting',
      detail: `${input.events.length} événement${input.events.length > 1 ? 's' : ''} visible${input.events.length > 1 ? 's' : ''}.`,
      source: 'venture_events',
    },
    {
      key: 'stripe_payment',
      label: 'Paiement Stripe',
      status: hasRevenue ? 'done' : 'waiting',
      detail: hasRevenue
        ? `${eurFromCents(input.acquisition.summary.revenueCents)} EUR de revenu attribué.`
        : 'Aucun payment_succeeded attribuable.',
      source: 'stripe_webhook · venture_events',
    },
    {
      key: 'roi_calculated',
      label: 'ROI calculé',
      status: hasRoiSignal ? 'done' : 'waiting',
      detail: hasRoiSignal
        ? `ROI ${input.acquisition.summary.roi.toFixed(2)}, profit ${eurFromCents(input.acquisition.summary.profitCents)} EUR.`
        : 'ROI en attente de spend ou revenu.',
      source: 'acquisition_roi',
    },
    {
      key: 'decision_scale_cut',
      label: 'Décision scale/cut',
      status: hasDecision ? 'done' : hasRoiSignal ? 'waiting' : 'waiting',
      detail: hasDecision
        ? 'Une décision ou action scale/cut existe.'
        : 'Decision attend un signal ROI suffisant.',
      source: 'decisions · autonomy_actions',
    },
    {
      key: 'approval_risk',
      label: 'Approval si risque',
      status: pendingApprovals.length > 0 ? 'blocked' : 'done',
      detail:
        pendingApprovals.length > 0
          ? `${pendingApprovals.length} approval${pendingApprovals.length > 1 ? 's' : ''} à valider.`
          : 'Aucun risque bloquant en attente.',
      source: 'human_approvals',
      risk: pendingApprovals.length > 0 ? 'high' : null,
    },
    {
      key: 'execution',
      label: 'Exécution',
      status: hasExecuted ? 'done' : pendingApprovals.length > 0 ? 'blocked' : 'waiting',
      detail: hasExecuted
        ? `${input.executed.length || 1} action${(input.executed.length || 1) > 1 ? 's' : ''} exécutée${(input.executed.length || 1) > 1 ? 's' : ''}.`
        : 'Aucune exécution automatique sur cette passe.',
      source: 'autonomy_actions',
    },
  ]

  return {
    mode: stages.some((stage) => stage.status === 'blocked') ? 'attention' : 'calm',
    generatedAt: now.toISOString(),
    summary: {
      revenueEur: eurFromCents(input.acquisition.summary.revenueCents),
      spendEur: eurFromCents(input.acquisition.summary.spendCents),
      profitEur: eurFromCents(input.acquisition.summary.profitCents),
      roi: input.acquisition.summary.roi,
      recommendedBudgetEur: input.acquisition.summary.recommendedBudgetEur,
      pendingApprovalCount: pendingApprovals.length,
    },
    stages,
  }
}
