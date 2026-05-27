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
  impactLabel: string
  blockedLabel: string
  href: string
  tone: 'amber' | 'accent' | 'emerald' | 'rose'
  badge: string
  intent: CashActionIntent | null
}

type ScoredCashAction = CashAction & { priority: number }

function formatEuro(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function bandBonus(band: ProspectCashRow['band']) {
  if (band === 'hot') return 18
  if (band === 'warm') return 10
  return 2
}

function scoreBonus(score: number) {
  return Math.round(score * 0.25)
}

function overdueHours(nextFollowupAt: string | null | undefined, nowIso: string) {
  if (!nextFollowupAt) return 0
  const dueMs = new Date(nextFollowupAt).getTime()
  const nowMs = new Date(nowIso).getTime()
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs) || dueMs >= nowMs) return 0
  return Math.min(24, Math.round((nowMs - dueMs) / 3_600_000))
}

function formatBlockedLabel(hours: number) {
  if (hours <= 0) return 'now'
  if (hours < 24) return `${hours}h blocked`
  return '24h+ blocked'
}

export function buildCashActions(input: {
  prospects: ProspectCashRow[]
  revenueSnapshot: RevenueLoopSnapshotPayload | null
  nowIso?: string
}): CashAction[] {
  const actions: ScoredCashAction[] = []
  const nowIso = input.nowIso ?? new Date().toISOString()
  const hotApproval = input.prospects
    .filter(
      (prospect) =>
        prospect.approval_status === 'awaiting_approval' &&
        typeof prospect.outreach_approval_id === 'string'
    )
    .sort((left, right) => {
      const leftScore = 120 + bandBonus(left.band) + scoreBonus(left.score)
      const rightScore = 120 + bandBonus(right.band) + scoreBonus(right.score)
      return rightScore - leftScore
    })[0]
  if (hotApproval && hotApproval.outreach_approval_id) {
    actions.push({
      id: `approval:${hotApproval.id}`,
      kind: 'approval',
      label: `Approuver ${hotApproval.company_name}`,
      detail: 'Draft prêt à valider pour débloquer l’envoi.',
      impactLabel: `${hotApproval.score}/100 lead`,
      blockedLabel: 'approval pending',
      href: '/studio/prospects?status=awaiting_approval',
      tone: 'amber',
      badge: 'approval',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/autonomy/jobs',
        body: { approvalId: hotApproval.outreach_approval_id, decision: 'approved' },
        successMessage: 'Draft approved',
      },
      priority: 120 + bandBonus(hotApproval.band) + scoreBonus(hotApproval.score),
    })
  }

  const followUpDue = input.prospects
    .filter((prospect) => prospect.pipeline_status === 'follow_up_due')
    .sort((left, right) => {
      const leftScore =
        112 +
        bandBonus(left.band) +
        scoreBonus(left.score) +
        overdueHours(left.next_followup_at, nowIso)
      const rightScore =
        112 +
        bandBonus(right.band) +
        scoreBonus(right.score) +
        overdueHours(right.next_followup_at, nowIso)
      return rightScore - leftScore
    })[0]
  if (followUpDue) {
    const blockedHours = overdueHours(followUpDue.next_followup_at, nowIso)
    actions.push({
      id: `followup:${followUpDue.id}`,
      kind: 'follow_up',
      label: `Relancer ${followUpDue.company_name}`,
      detail: 'Suivi dû: traite la relance avant d’ouvrir une nouvelle boucle.',
      impactLabel: `${followUpDue.score}/100 lead`,
      blockedLabel: formatBlockedLabel(blockedHours),
      href: '/studio/prospects?status=follow_up_due',
      tone: 'accent',
      badge: 'follow-up',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: followUpDue.id, action: 'mark_follow_up_sent' },
        successMessage: 'Follow-up marked sent',
      },
      priority: 112 + bandBonus(followUpDue.band) + scoreBonus(followUpDue.score) + blockedHours,
    })
  }

  const draftCreated = input.prospects
    .filter((prospect) => prospect.pipeline_status === 'draft_created')
    .sort((left, right) => {
      const leftScore = 98 + bandBonus(left.band) + scoreBonus(left.score)
      const rightScore = 98 + bandBonus(right.band) + scoreBonus(right.score)
      return rightScore - leftScore
    })[0]
  if (draftCreated) {
    actions.push({
      id: `draft:${draftCreated.id}`,
      kind: 'send',
      label: `Envoyer ${draftCreated.company_name}`,
      detail: 'Draft validé en attente d’envoi opérateur.',
      impactLabel: `${draftCreated.score}/100 lead`,
      blockedLabel: 'ready to send',
      href: '/studio/prospects?status=draft_created',
      tone: 'emerald',
      badge: 'send',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: draftCreated.id, status: 'sent' },
        successMessage: 'Prospect marked sent',
      },
      priority: 98 + bandBonus(draftCreated.band) + scoreBonus(draftCreated.score),
    })
  }

  const revenueAction = input.revenueSnapshot?.summary.recommendedAction
  if (revenueAction) {
    actions.push({
      id: `revenue:${revenueAction.type}:${revenueAction.ventureName}`,
      kind: 'revenue',
      label: revenueAction.ventureName,
      detail: `${revenueAction.reason} · potentiel ${formatEuro(revenueAction.blockedRevenueEur)}`,
      impactLabel: formatEuro(revenueAction.blockedRevenueEur),
      blockedLabel: `${revenueAction.priorityScore} priority`,
      href: '/studio/revenue',
      tone: 'accent',
      badge: 'revenue',
      intent: null,
      priority:
        88 +
        Math.round(revenueAction.priorityScore * 0.2) +
        Math.round(revenueAction.blockedRevenueEur / 250),
    })
  }

  const hotLead = input.prospects
    .filter(
      (prospect) =>
        prospect.band === 'hot' &&
        (prospect.pipeline_status === 'new' || prospect.pipeline_status === 'ready_to_contact')
    )
    .sort((left, right) => {
      const leftScore = 84 + scoreBonus(left.score)
      const rightScore = 84 + scoreBonus(right.score)
      return rightScore - leftScore
    })[0]
  if (hotLead) {
    actions.push({
      id: `lead:${hotLead.id}`,
      kind: 'lead',
      label: `Travailler ${hotLead.company_name}`,
      detail: 'Lead chaud encore non traité. Priorité avant les leads froids.',
      impactLabel: `${hotLead.score}/100 lead`,
      blockedLabel: 'new lead',
      href: '/studio/prospects',
      tone: 'rose',
      badge: 'lead',
      intent: null,
      priority: 84 + scoreBonus(hotLead.score),
    })
  }

  return actions
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4)
    .map(({ priority: _priority, ...action }) => action)
}
