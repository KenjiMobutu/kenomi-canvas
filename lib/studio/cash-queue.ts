type RevenueRecommendedAction = {
  type: string
  ventureName: string
  reason: string
  priorityScore: number
  blockedRevenueEur: number
}

type RevenueLoopSnapshotPayload = {
  summary: {
    activeLoops: number
    readyCheckouts: number
    pendingApprovals: number
    revenueEur: number
    blockedRevenueEur: number
    recommendedAction: RevenueRecommendedAction | null
  }
}

export type ProspectCashRow = {
  id: string
  company_name: string
  band: 'hot' | 'warm' | 'cold'
  score: number
  pipeline_status: string
  approval_status: string
  outreach_approval_id?: string | null
  next_action?: string | null
  next_followup_at?: string | null
  last_outreach_kind?: string | null
}

export type CashActionIntent = {
  method: 'PATCH'
  endpoint: string
  body: Record<string, unknown>
  successMessage: string
}

export type CashAction = {
  id: string
  kind: 'approval' | 'follow_up' | 'send' | 'revenue' | 'lead'
  label: string
  detail: string
  href: string
  tone: 'amber' | 'accent' | 'emerald' | 'rose'
  badge: string
  intent: CashActionIntent | null
}

function formatEuro(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buildCashActions(input: {
  prospects: ProspectCashRow[]
  revenueSnapshot: RevenueLoopSnapshotPayload | null
}): CashAction[] {
  const actions: CashAction[] = []
  const hotApproval = input.prospects.find(
    (prospect) =>
      prospect.approval_status === 'awaiting_approval' &&
      typeof prospect.outreach_approval_id === 'string'
  )
  if (hotApproval && hotApproval.outreach_approval_id) {
    actions.push({
      id: `approval:${hotApproval.id}`,
      kind: 'approval',
      label: `Approuver ${hotApproval.company_name}`,
      detail: 'Draft prêt à valider pour débloquer l’envoi.',
      href: '/studio/prospects?status=awaiting_approval',
      tone: 'amber',
      badge: 'approval',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/autonomy/jobs',
        body: { approvalId: hotApproval.outreach_approval_id, decision: 'approved' },
        successMessage: 'Draft approved',
      },
    })
  }

  const followUpDue = input.prospects.find(
    (prospect) => prospect.pipeline_status === 'follow_up_due'
  )
  if (followUpDue) {
    actions.push({
      id: `followup:${followUpDue.id}`,
      kind: 'follow_up',
      label: `Relancer ${followUpDue.company_name}`,
      detail: 'Suivi dû: traite la relance avant d’ouvrir une nouvelle boucle.',
      href: '/studio/prospects?status=follow_up_due',
      tone: 'accent',
      badge: 'follow-up',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: followUpDue.id, action: 'mark_follow_up_sent' },
        successMessage: 'Follow-up marked sent',
      },
    })
  }

  const draftCreated = input.prospects.find(
    (prospect) => prospect.pipeline_status === 'draft_created'
  )
  if (draftCreated) {
    actions.push({
      id: `draft:${draftCreated.id}`,
      kind: 'send',
      label: `Envoyer ${draftCreated.company_name}`,
      detail: 'Draft validé en attente d’envoi opérateur.',
      href: '/studio/prospects?status=draft_created',
      tone: 'emerald',
      badge: 'send',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: draftCreated.id, status: 'sent' },
        successMessage: 'Prospect marked sent',
      },
    })
  }

  const revenueAction = input.revenueSnapshot?.summary.recommendedAction
  if (revenueAction) {
    actions.push({
      id: `revenue:${revenueAction.type}:${revenueAction.ventureName}`,
      kind: 'revenue',
      label: revenueAction.ventureName,
      detail: `${revenueAction.reason} · potentiel ${formatEuro(revenueAction.blockedRevenueEur)}`,
      href: '/studio/revenue',
      tone: 'accent',
      badge: 'revenue',
      intent: null,
    })
  }

  const hotLead = input.prospects.find(
    (prospect) =>
      prospect.band === 'hot' &&
      (prospect.pipeline_status === 'new' || prospect.pipeline_status === 'ready_to_contact')
  )
  if (hotLead) {
    actions.push({
      id: `lead:${hotLead.id}`,
      kind: 'lead',
      label: `Travailler ${hotLead.company_name}`,
      detail: 'Lead chaud encore non traité. Priorité avant les leads froids.',
      href: '/studio/prospects',
      tone: 'rose',
      badge: 'lead',
      intent: null,
    })
  }

  return actions.slice(0, 4)
}
