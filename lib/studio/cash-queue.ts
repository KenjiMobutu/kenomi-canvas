import { scoreCashActionCandidate } from '@/lib/revenue/action-engine'

type RevenueRecommendedAction = {
  type: string
  ventureName: string
  reason: string
  priorityScore: number
  blockedRevenueEur: number
}

type ConversionSnapshotPayload = {
  bestOffer: { offerId: string | null; closeRate: number } | null
  bestAngle: { offerId: string | null; angle: string; closeRate: number } | null
  segmentRepliesNoPay: {
    source: string
    band: string
    offerId: string | null
    replied: number
    paid: number
  } | null
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
  source?: string | null
  band: 'hot' | 'warm' | 'cold'
  score: number
  pipeline_status: string
  approval_status: string
  offer_id?: string | null
  outreach_angle?: string | null
  latest_conversation_event_type?: string | null
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
  expectedCashLabel?: string | null
  reasonLabel?: string | null
  blockedLabel: string
  boostLabel?: string | null
  playbookLabel?: string | null
  ctaLabel?: string | null
  href: string
  tone: 'amber' | 'accent' | 'emerald' | 'rose'
  badge: string
  intent: CashActionIntent | null
}

type ScoredCashAction = CashAction & { priority: number }

type SegmentFocus = {
  source: string
  band: string
  qualityScore: number
  playbookHint?: string
} | null

function playbookPriorityBonus(kind: CashAction['kind'], playbookHint: string | undefined) {
  if (!playbookHint) return 0
  if (playbookHint === 'needs volume') {
    if (kind === 'lead') return 34
    if (kind === 'send') return -10
    if (kind === 'follow_up') return -8
  }
  if (playbookHint === 'reply-heavy') {
    if (kind === 'approval') return 8
    if (kind === 'send') return 14
  }
  if (playbookHint === 'win-heavy') {
    if (kind === 'follow_up') return 16
    if (kind === 'send') return 8
  }
  if (playbookHint === 'needs replies') {
    if (kind === 'approval') return 6
    if (kind === 'send') return 10
    if (kind === 'follow_up') return 8
  }
  return 0
}

function playbookActionLabel(playbookHint: string | undefined) {
  if (playbookHint === 'needs volume') return 'volume push'
  if (playbookHint === 'reply-heavy') return 'reply push'
  if (playbookHint === 'win-heavy') return 'win push'
  if (playbookHint === 'needs replies') return 'reply push'
  return null
}

function playbookCtaLabel(kind: CashAction['kind'], playbookHint: string | undefined, hasIntent: boolean) {
  if (!playbookHint) return null
  if (playbookHint === 'needs volume') {
    if (kind === 'lead') return 'Open leads'
    if (kind === 'send' && hasIntent) return 'Send now'
  }
  if (playbookHint === 'reply-heavy' || playbookHint === 'needs replies') {
    if (kind === 'approval' && hasIntent) return 'Approve now'
    if (kind === 'send' && hasIntent) return 'Send now'
  }
  if (playbookHint === 'win-heavy' && kind === 'follow_up' && hasIntent) {
    return 'Follow up now'
  }
  return null
}

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

function segmentAffinity(prospect: ProspectCashRow, segmentFocus: SegmentFocus) {
  if (!segmentFocus) return { bonus: 0, label: null as string | null }
  const matchesSource = prospect.source === segmentFocus.source
  const matchesBand = prospect.band === segmentFocus.band
  if (matchesSource && matchesBand) {
    return {
      bonus: Math.round(segmentFocus.qualityScore * 0.2),
      label: `top segment · ${segmentFocus.source}/${segmentFocus.band}`,
    }
  }
  if (matchesSource) {
    return {
      bonus: Math.round(segmentFocus.qualityScore * 0.08),
      label: `top source · ${segmentFocus.source}`,
    }
  }
  if (matchesBand) {
    return {
      bonus: Math.round(segmentFocus.qualityScore * 0.08),
      label: `top band · ${segmentFocus.band}`,
    }
  }
  return { bonus: 0, label: null as string | null }
}

export function buildCashActions(input: {
  prospects: ProspectCashRow[]
  revenueSnapshot: RevenueLoopSnapshotPayload | null
  conversions?: ConversionSnapshotPayload | null
  segmentFocus?: SegmentFocus
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
      const leftScore =
        120 + bandBonus(left.band) + scoreBonus(left.score) + segmentAffinity(left, input.segmentFocus ?? null).bonus
      const rightScore =
        120 +
        bandBonus(right.band) +
        scoreBonus(right.score) +
        segmentAffinity(right, input.segmentFocus ?? null).bonus
      return rightScore - leftScore
    })[0]
  if (hotApproval && hotApproval.outreach_approval_id) {
    const boost = segmentAffinity(hotApproval, input.segmentFocus ?? null)
    const playbookLabel = playbookActionLabel(input.segmentFocus?.playbookHint)
    const scored = scoreCashActionCandidate({
      kind: 'approval',
      basePriority:
        120 +
        bandBonus(hotApproval.band) +
        scoreBonus(hotApproval.score) +
        boost.bonus +
        playbookPriorityBonus('approval', input.segmentFocus?.playbookHint),
      prospect: hotApproval,
      segmentFocus: input.segmentFocus ?? null,
      conversions: input.conversions ?? null,
    })
    actions.push({
      id: `approval:${hotApproval.id}`,
      kind: 'approval',
      label: `Approuver ${hotApproval.company_name}`,
      detail: 'Draft prêt à valider pour débloquer l’envoi.',
      impactLabel: `${hotApproval.score}/100 lead`,
      expectedCashLabel: scored.expectedCashLabel,
      reasonLabel: scored.reasonLabel,
      blockedLabel: 'approval pending',
      boostLabel: boost.label,
      playbookLabel,
      ctaLabel: playbookCtaLabel('approval', input.segmentFocus?.playbookHint, true),
      href: '/studio/prospects?status=awaiting_approval',
      tone: 'amber',
      badge: 'approval',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/autonomy/jobs',
        body: { approvalId: hotApproval.outreach_approval_id, decision: 'approved' },
        successMessage: 'Draft approved',
      },
      priority: scored.priority,
    })
  }

  const followUpDue = input.prospects
    .filter((prospect) => prospect.pipeline_status === 'follow_up_due')
    .sort((left, right) => {
      const leftBoost = segmentAffinity(left, input.segmentFocus ?? null)
      const rightBoost = segmentAffinity(right, input.segmentFocus ?? null)
      const leftScore =
        112 +
        bandBonus(left.band) +
        scoreBonus(left.score) +
        leftBoost.bonus +
        overdueHours(left.next_followup_at, nowIso)
      const rightScore =
        112 +
        bandBonus(right.band) +
        scoreBonus(right.score) +
        rightBoost.bonus +
        overdueHours(right.next_followup_at, nowIso)
      return rightScore - leftScore
    })[0]
  if (followUpDue) {
    const blockedHours = overdueHours(followUpDue.next_followup_at, nowIso)
    const boost = segmentAffinity(followUpDue, input.segmentFocus ?? null)
    const playbookLabel = playbookActionLabel(input.segmentFocus?.playbookHint)
    const scored = scoreCashActionCandidate({
      kind: 'follow_up',
      basePriority:
        112 +
        bandBonus(followUpDue.band) +
        scoreBonus(followUpDue.score) +
        boost.bonus +
        blockedHours +
        playbookPriorityBonus('follow_up', input.segmentFocus?.playbookHint),
      prospect: followUpDue,
      segmentFocus: input.segmentFocus ?? null,
      conversions: input.conversions ?? null,
    })
    actions.push({
      id: `followup:${followUpDue.id}`,
      kind: 'follow_up',
      label: `Relancer ${followUpDue.company_name}`,
      detail: 'Suivi dû: traite la relance avant d’ouvrir une nouvelle boucle.',
      impactLabel: `${followUpDue.score}/100 lead`,
      expectedCashLabel: scored.expectedCashLabel,
      reasonLabel: scored.reasonLabel,
      blockedLabel: formatBlockedLabel(blockedHours),
      boostLabel: boost.label,
      playbookLabel,
      ctaLabel: playbookCtaLabel('follow_up', input.segmentFocus?.playbookHint, true),
      href: '/studio/prospects?status=follow_up_due',
      tone: 'accent',
      badge: 'follow-up',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: followUpDue.id, action: 'mark_follow_up_sent' },
        successMessage: 'Follow-up marked sent',
      },
      priority: scored.priority,
    })
  }

  const draftCreated = input.prospects
    .filter((prospect) => prospect.pipeline_status === 'draft_created')
    .sort((left, right) => {
      const leftScore =
        98 + bandBonus(left.band) + scoreBonus(left.score) + segmentAffinity(left, input.segmentFocus ?? null).bonus
      const rightScore =
        98 +
        bandBonus(right.band) +
        scoreBonus(right.score) +
        segmentAffinity(right, input.segmentFocus ?? null).bonus
      return rightScore - leftScore
    })[0]
  if (draftCreated) {
    const boost = segmentAffinity(draftCreated, input.segmentFocus ?? null)
    const playbookLabel = playbookActionLabel(input.segmentFocus?.playbookHint)
    const scored = scoreCashActionCandidate({
      kind: 'send',
      basePriority:
        98 +
        bandBonus(draftCreated.band) +
        scoreBonus(draftCreated.score) +
        boost.bonus +
        playbookPriorityBonus('send', input.segmentFocus?.playbookHint),
      prospect: draftCreated,
      segmentFocus: input.segmentFocus ?? null,
      conversions: input.conversions ?? null,
    })
    actions.push({
      id: `draft:${draftCreated.id}`,
      kind: 'send',
      label: `Envoyer ${draftCreated.company_name}`,
      detail: 'Draft validé en attente d’envoi opérateur.',
      impactLabel: `${draftCreated.score}/100 lead`,
      expectedCashLabel: scored.expectedCashLabel,
      reasonLabel: scored.reasonLabel,
      blockedLabel: 'ready to send',
      boostLabel: boost.label,
      playbookLabel,
      ctaLabel: playbookCtaLabel('send', input.segmentFocus?.playbookHint, true),
      href: '/studio/prospects?status=draft_created',
      tone: 'emerald',
      badge: 'send',
      intent: {
        method: 'PATCH',
        endpoint: '/api/studio/prospects',
        body: { id: draftCreated.id, status: 'sent' },
        successMessage: 'Prospect marked sent',
      },
      priority: scored.priority,
    })
  }

  const revenueAction = input.revenueSnapshot?.summary.recommendedAction
  if (revenueAction) {
    const scored = scoreCashActionCandidate({
      kind: 'revenue',
      basePriority:
        88 +
        Math.round(revenueAction.priorityScore * 0.2) +
        Math.round(revenueAction.blockedRevenueEur / 250),
      conversions: input.conversions ?? null,
    })
    actions.push({
      id: `revenue:${revenueAction.type}:${revenueAction.ventureName}`,
      kind: 'revenue',
      label: revenueAction.ventureName,
      detail: `${revenueAction.reason} · potentiel ${formatEuro(revenueAction.blockedRevenueEur)}`,
      impactLabel: formatEuro(revenueAction.blockedRevenueEur),
      expectedCashLabel: `expected cash +${Math.round(revenueAction.blockedRevenueEur)} €`,
      reasonLabel: 'blocked revenue',
      blockedLabel: `${revenueAction.priorityScore} priority`,
      href: '/studio/revenue',
      tone: 'accent',
      badge: 'revenue',
      intent: null,
      priority: scored.priority,
    })
  }

  const hotLead = input.prospects
    .filter(
      (prospect) =>
        prospect.band === 'hot' &&
        (prospect.pipeline_status === 'new' || prospect.pipeline_status === 'ready_to_contact')
    )
    .sort((left, right) => {
      const leftScore = 84 + scoreBonus(left.score) + segmentAffinity(left, input.segmentFocus ?? null).bonus
      const rightScore = 84 + scoreBonus(right.score) + segmentAffinity(right, input.segmentFocus ?? null).bonus
      return rightScore - leftScore
    })[0]
  if (hotLead) {
    const boost = segmentAffinity(hotLead, input.segmentFocus ?? null)
    const playbookLabel = playbookActionLabel(input.segmentFocus?.playbookHint)
    const scored = scoreCashActionCandidate({
      kind: 'lead',
      basePriority:
        84 +
        scoreBonus(hotLead.score) +
        boost.bonus +
        playbookPriorityBonus('lead', input.segmentFocus?.playbookHint),
      prospect: hotLead,
      segmentFocus: input.segmentFocus ?? null,
      conversions: input.conversions ?? null,
    })
    actions.push({
      id: `lead:${hotLead.id}`,
      kind: 'lead',
      label: `Travailler ${hotLead.company_name}`,
      detail: 'Lead chaud encore non traité. Priorité avant les leads froids.',
      impactLabel: `${hotLead.score}/100 lead`,
      expectedCashLabel: scored.expectedCashLabel,
      reasonLabel: scored.reasonLabel,
      blockedLabel: 'new lead',
      boostLabel: boost.label,
      playbookLabel,
      ctaLabel: playbookCtaLabel('lead', input.segmentFocus?.playbookHint, false),
      href:
        input.segmentFocus?.playbookHint === 'needs volume'
          ? `/studio/prospects?source=${encodeURIComponent(input.segmentFocus.source)}&band=${encodeURIComponent(
              input.segmentFocus.band
            )}`
          : '/studio/prospects',
      tone: 'rose',
      badge: 'lead',
      intent: null,
      priority: scored.priority,
    })
  }

  return actions
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4)
    .map(({ priority: _priority, ...action }) => action)
}
