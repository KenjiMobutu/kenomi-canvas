import type { AcquisitionRoiSnapshot } from './metrics/acquisition-roi'

export type RevenueProofStageStatus = 'done' | 'blocked' | 'waiting'
export type RevenueProofDecision = 'scale' | 'cut' | 'hold'
export type RevenueProofVentureDecision = 'scale' | 'stop' | 'continue'

export interface RevenueProofPaymentRow {
  status?: string | null
  provider_status?: string | null
  checkout_url?: string | null
}

export interface RevenueProofCampaignDraftRow {
  status?: string | null
  published_at?: string | null
}

export interface RevenueProofEventRow {
  event_type: string
  value?: number | string | null
}

export interface RevenueProofActionRow {
  action_type?: string | null
  status?: string | null
}

export interface RevenueProofApprovalRow {
  status?: string | null
}

export interface RevenueProofDecisionRow {
  decision?: string | null
}

export interface RevenueRoiDecision {
  decision: RevenueProofDecision
  ventureDecision: RevenueProofVentureDecision
  reason: string
}

export interface RevenueProofStage {
  key:
    | 'checkout_created'
    | 'approval_resolved'
    | 'payment_succeeded'
    | 'campaign_published'
    | 'tracking_collected'
    | 'roi_calculated'
    | 'decision_recorded'
    | 'execution_audited'
  label: string
  status: RevenueProofStageStatus
  detail: string
  source: string
}

export interface RevenueProofAudit {
  generatedAt: string
  roiDecision: RevenueRoiDecision
  facts: {
    payments: number
    completedPayments: number
    checkouts: number
    publishedCampaigns: number
    trackingEvents: number
    pendingApprovals: number
    completedActions: number
  }
  stages: RevenueProofStage[]
}

function statusIs(value: string | null | undefined, accepted: string[]) {
  const normalized = String(value ?? '').toLowerCase()
  return accepted.includes(normalized)
}

function hasEvent(events: RevenueProofEventRow[], eventType: string) {
  return events.some((event) => event.event_type === eventType)
}

function hasCompletedAction(actions: RevenueProofActionRow[], actionType: string) {
  return actions.some(
    (action) =>
      action.action_type === actionType && statusIs(action.status, ['completed', 'done', 'success'])
  )
}

export function deriveRevenueRoiDecision(input: {
  revenueCents: number
  spendCents: number
  roi: number
  recommendedBudgetEur: number
}): RevenueRoiDecision {
  if (input.revenueCents > 0 && input.roi >= 0.5) {
    return {
      decision: 'scale',
      ventureDecision: 'scale',
      reason: `ROI ${input.roi.toFixed(2)} positif, budget recommandé ${input.recommendedBudgetEur.toFixed(0)} EUR.`,
    }
  }

  if (input.spendCents > 0 && input.revenueCents === 0) {
    return {
      decision: 'cut',
      ventureDecision: 'stop',
      reason: 'Spend engagé sans revenu attribué.',
    }
  }

  return {
    decision: 'hold',
    ventureDecision: 'continue',
    reason: 'Signal insuffisant pour scaler ou couper.',
  }
}

export function buildRevenueProofAudit(input: {
  payments: RevenueProofPaymentRow[]
  campaignDrafts: RevenueProofCampaignDraftRow[]
  events: RevenueProofEventRow[]
  actions: RevenueProofActionRow[]
  approvals: RevenueProofApprovalRow[]
  acquisition: AcquisitionRoiSnapshot
  latestDecision?: RevenueProofDecisionRow | null
  now?: Date
}): RevenueProofAudit {
  const completedPayments = input.payments.filter((payment) =>
    [payment.status, payment.provider_status].some((status) =>
      statusIs(status, ['completed', 'paid', 'succeeded', 'success'])
    )
  ).length
  const checkouts = input.payments.filter((payment) => Boolean(payment.checkout_url)).length
  const publishedCampaigns = input.campaignDrafts.filter(
    (draft) => Boolean(draft.published_at) || statusIs(draft.status, ['published'])
  ).length
  const trackingEvents = input.events.filter((event) =>
    ['page_view', 'waitlist_signup', 'campaign_spend'].includes(event.event_type)
  ).length
  const pendingApprovals = input.approvals.filter((approval) =>
    statusIs(approval.status, ['pending'])
  ).length
  const completedActions = input.actions.filter((action) =>
    statusIs(action.status, ['completed', 'done', 'success'])
  ).length
  const roiDecision = deriveRevenueRoiDecision(input.acquisition.summary)
  const hasRoiSignal =
    input.acquisition.summary.revenueCents > 0 || input.acquisition.summary.spendCents > 0
  const decisionRecorded =
    Boolean(input.latestDecision?.decision) ||
    hasCompletedAction(input.actions, 'scale_budget') ||
    hasCompletedAction(input.actions, 'stop_venture')

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    roiDecision,
    facts: {
      payments: input.payments.length,
      completedPayments,
      checkouts,
      publishedCampaigns,
      trackingEvents,
      pendingApprovals,
      completedActions,
    },
    stages: [
      {
        key: 'checkout_created',
        label: 'Checkout Stripe réel',
        status:
          checkouts > 0 || hasCompletedAction(input.actions, 'create_checkout')
            ? 'done'
            : 'waiting',
        detail:
          checkouts > 0
            ? `${checkouts} checkout${checkouts > 1 ? 's' : ''} disponible${checkouts > 1 ? 's' : ''}.`
            : 'Aucun checkout Stripe prêt.',
        source: 'payments · autonomy_actions',
      },
      {
        key: 'approval_resolved',
        label: 'Approval risque',
        status: pendingApprovals > 0 ? 'blocked' : 'done',
        detail:
          pendingApprovals > 0
            ? `${pendingApprovals} approval${pendingApprovals > 1 ? 's' : ''} en attente.`
            : 'Aucune approval bloquante.',
        source: 'human_approvals',
      },
      {
        key: 'payment_succeeded',
        label: 'Paiement test Stripe',
        status:
          completedPayments > 0 || hasEvent(input.events, 'payment_succeeded') ? 'done' : 'waiting',
        detail:
          completedPayments > 0
            ? `${completedPayments} paiement${completedPayments > 1 ? 's' : ''} complété${completedPayments > 1 ? 's' : ''}.`
            : 'Webhook payment_succeeded attendu.',
        source: 'payments · venture_events',
      },
      {
        key: 'campaign_published',
        label: 'Campagne publiée',
        status:
          publishedCampaigns > 0 ||
          hasEvent(input.events, 'campaign_published') ||
          hasCompletedAction(input.actions, 'publish_campaign')
            ? 'done'
            : 'waiting',
        detail:
          publishedCampaigns > 0
            ? `${publishedCampaigns} campagne${publishedCampaigns > 1 ? 's' : ''} publiée${publishedCampaigns > 1 ? 's' : ''}.`
            : 'Aucune campagne publiée.',
        source: 'campaign_drafts · venture_events',
      },
      {
        key: 'tracking_collected',
        label: 'Tracking collecté',
        status: trackingEvents > 0 ? 'done' : 'waiting',
        detail: `${trackingEvents} event${trackingEvents > 1 ? 's' : ''} page/waitlist/spend.`,
        source: 'venture_events',
      },
      {
        key: 'roi_calculated',
        label: 'ROI calculé',
        status: hasRoiSignal ? 'done' : 'waiting',
        detail: hasRoiSignal
          ? `ROI ${input.acquisition.summary.roi.toFixed(2)}, profit ${(input.acquisition.summary.profitCents / 100).toFixed(2)} EUR.`
          : 'ROI sans signal revenu/spend.',
        source: 'acquisition_roi',
      },
      {
        key: 'decision_recorded',
        label: 'Décision scale/cut/hold',
        status: decisionRecorded || hasRoiSignal ? 'done' : 'waiting',
        detail: `${roiDecision.decision}: ${roiDecision.reason}`,
        source: 'decisions · acquisition_roi',
      },
      {
        key: 'execution_audited',
        label: 'Exécution auditée',
        status: completedActions > 0 ? 'done' : pendingApprovals > 0 ? 'blocked' : 'waiting',
        detail: `${completedActions} action${completedActions > 1 ? 's' : ''} terminée${completedActions > 1 ? 's' : ''}.`,
        source: 'autonomy_actions',
      },
    ],
  }
}
