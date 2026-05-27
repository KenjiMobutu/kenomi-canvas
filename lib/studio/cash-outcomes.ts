export type CashOutcomeWindow = {
  replies: number
  deals: number
  cashEur: number
}

export type CashOutcomeSnapshot = {
  last7d: CashOutcomeWindow
  previous7d: CashOutcomeWindow
  last30d: CashOutcomeWindow
  previous30d: CashOutcomeWindow
  delta7d: CashOutcomeWindow
  delta30d: CashOutcomeWindow
  rates: {
    replyRate7d: number
    winRate7d: number
    replyRate30d: number
    winRate30d: number
  }
  sourceBreakdown: Array<{
    source: string
    active: number
    replied: number
    won: number
  }>
  blockers: Array<{
    key: 'awaiting_approval' | 'draft_created' | 'follow_up_due'
    label: string
    count: number
  }>
  blockerActions: Array<{
    key: 'awaiting_approval' | 'draft_created' | 'follow_up_due'
    label: string
    count: number
    source: string
    ctaLabel: string
    href: string
  }>
}

type ProspectActivityRow = {
  type?: string | null
  created_at?: string | null
}

type PaymentRow = {
  status?: string | null
  created_at?: string | null
  amount_eur?: number | string | null
  collected_amount_eur?: number | string | null
}

type ProspectRow = {
  source?: string | null
  pipeline_status?: string | null
  approval_status?: string | null
}

type BlockerKey = 'awaiting_approval' | 'draft_created' | 'follow_up_due'

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function paymentValue(payment: PaymentRow) {
  if (payment.collected_amount_eur !== null && payment.collected_amount_eur !== undefined) {
    return Math.max(0, toNumber(payment.collected_amount_eur))
  }
  return Math.max(0, toNumber(payment.amount_eur))
}

function zeroWindow(): CashOutcomeWindow {
  return { replies: 0, deals: 0, cashEur: 0 }
}

function ratio(part: number, total: number) {
  if (total <= 0) return 0
  return Number(((part / total) * 100).toFixed(1))
}

function diffWindow(current: CashOutcomeWindow, previous: CashOutcomeWindow): CashOutcomeWindow {
  return {
    replies: current.replies - previous.replies,
    deals: current.deals - previous.deals,
    cashEur: Number((current.cashEur - previous.cashEur).toFixed(2)),
  }
}

function titleCaseSource(source: string) {
  if (!source) return 'Prospect'
  if (source === 'linkedin') return 'LinkedIn'
  if (source === 'upwork') return 'Upwork'
  if (source === 'reddit') return 'Reddit'
  return source.charAt(0).toUpperCase() + source.slice(1)
}

function buildBlockerAction(input: {
  key: BlockerKey
  label: string
  count: number
  prospects: ProspectRow[]
}) {
  const sourceCounts = new Map<string, number>()
  for (const prospect of input.prospects) {
    const source = prospect.source?.trim() || 'other'
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
  }

  const source =
    Array.from(sourceCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    'other'

  const href = `/studio/prospects?status=${input.key}&source=${source}`
  const sourceLabel = titleCaseSource(source)
  const ctaLabel =
    input.key === 'awaiting_approval'
      ? `Review ${sourceLabel} approval`
      : input.key === 'draft_created'
        ? `Send ${sourceLabel} draft`
        : `Run ${sourceLabel} follow-up`

  return {
    key: input.key,
    label: input.label,
    count: input.count,
    source,
    ctaLabel,
    href,
  }
}

export function buildCashOutcomeSnapshot(input: {
  activities: ProspectActivityRow[]
  payments: PaymentRow[]
  prospects?: ProspectRow[]
  nowIso?: string
}): CashOutcomeSnapshot {
  const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const last7dStart = nowMs - 7 * dayMs
  const previous7dStart = nowMs - 14 * dayMs
  const last30dStart = nowMs - 30 * dayMs
  const previous30dStart = nowMs - 60 * dayMs

  const last7d = zeroWindow()
  const previous7d = zeroWindow()
  const last30d = zeroWindow()
  const previous30d = zeroWindow()
  let last7dSent = 0
  let last30dSent = 0

  for (const activity of input.activities) {
    const createdAtMs = activity.created_at ? new Date(activity.created_at).getTime() : Number.NaN
    if (!Number.isFinite(createdAtMs)) continue

    const isReply = activity.type === 'marked_replied'
    const isDeal = activity.type === 'marked_won'
    const isSent = activity.type === 'marked_sent' || activity.type === 'follow_up_marked_sent'
    if (!isReply && !isDeal && !isSent) continue

    if (createdAtMs >= last7dStart && createdAtMs <= nowMs) {
      if (isReply) last7d.replies += 1
      if (isDeal) last7d.deals += 1
      if (isSent) last7dSent += 1
    } else if (createdAtMs >= previous7dStart && createdAtMs < last7dStart) {
      if (isReply) previous7d.replies += 1
      if (isDeal) previous7d.deals += 1
    }

    if (createdAtMs >= last30dStart && createdAtMs <= nowMs) {
      if (isReply) last30d.replies += 1
      if (isDeal) last30d.deals += 1
      if (isSent) last30dSent += 1
    } else if (createdAtMs >= previous30dStart && createdAtMs < last30dStart) {
      if (isReply) previous30d.replies += 1
      if (isDeal) previous30d.deals += 1
    }
  }

  for (const payment of input.payments) {
    if (payment.status !== 'completed') continue
    const createdAtMs = payment.created_at ? new Date(payment.created_at).getTime() : Number.NaN
    if (!Number.isFinite(createdAtMs)) continue
    const value = paymentValue(payment)

    if (createdAtMs >= last7dStart && createdAtMs <= nowMs) {
      last7d.cashEur = Number((last7d.cashEur + value).toFixed(2))
    } else if (createdAtMs >= previous7dStart && createdAtMs < last7dStart) {
      previous7d.cashEur = Number((previous7d.cashEur + value).toFixed(2))
    }

    if (createdAtMs >= last30dStart && createdAtMs <= nowMs) {
      last30d.cashEur = Number((last30d.cashEur + value).toFixed(2))
    } else if (createdAtMs >= previous30dStart && createdAtMs < last30dStart) {
      previous30d.cashEur = Number((previous30d.cashEur + value).toFixed(2))
    }
  }

  const sourceMap = new Map<string, { source: string; active: number; replied: number; won: number }>()
  let awaitingApproval = 0
  let draftCreated = 0
  let followUpDue = 0
  const awaitingApprovalProspects: ProspectRow[] = []
  const draftCreatedProspects: ProspectRow[] = []
  const followUpDueProspects: ProspectRow[] = []

  for (const prospect of input.prospects ?? []) {
    const source = prospect.source?.trim() || 'other'
    const entry = sourceMap.get(source) ?? { source, active: 0, replied: 0, won: 0 }
    const pipeline = prospect.pipeline_status ?? ''
    const approvalStatus = prospect.approval_status ?? ''
    if (
      pipeline === 'new' ||
      pipeline === 'ready_to_contact' ||
      pipeline === 'sent' ||
      pipeline === 'follow_up_due' ||
      pipeline === 'awaiting_approval' ||
      pipeline === 'draft_created' ||
      pipeline === 'approved_to_send'
    ) {
      entry.active += 1
    }
    if (pipeline === 'replied') entry.replied += 1
    if (pipeline === 'won') entry.won += 1
    sourceMap.set(source, entry)

    if (approvalStatus === 'awaiting_approval' || pipeline === 'awaiting_approval') {
      awaitingApproval += 1
      awaitingApprovalProspects.push(prospect)
    }
    if (pipeline === 'draft_created') {
      draftCreated += 1
      draftCreatedProspects.push(prospect)
    }
    if (pipeline === 'follow_up_due') {
      followUpDue += 1
      followUpDueProspects.push(prospect)
    }
  }

  const blockers = [
    { key: 'awaiting_approval' as const, label: 'Awaiting approval', count: awaitingApproval },
    { key: 'draft_created' as const, label: 'Drafts to send', count: draftCreated },
    { key: 'follow_up_due' as const, label: 'Follow-ups due', count: followUpDue },
  ]

  return {
    last7d,
    previous7d,
    last30d,
    previous30d,
    delta7d: diffWindow(last7d, previous7d),
    delta30d: diffWindow(last30d, previous30d),
    rates: {
      replyRate7d: ratio(last7d.replies, last7dSent),
      winRate7d: ratio(last7d.deals, last7d.replies),
      replyRate30d: ratio(last30d.replies, last30dSent),
      winRate30d: ratio(last30d.deals, last30d.replies),
    },
    sourceBreakdown: Array.from(sourceMap.values())
      .sort((left, right) => right.won - left.won || right.replied - left.replied || right.active - left.active)
      .slice(0, 4),
    blockers,
    blockerActions: [
      buildBlockerAction({
        key: 'awaiting_approval',
        label: 'Awaiting approval',
        count: awaitingApproval,
        prospects: awaitingApprovalProspects,
      }),
      buildBlockerAction({
        key: 'draft_created',
        label: 'Drafts to send',
        count: draftCreated,
        prospects: draftCreatedProspects,
      }),
      buildBlockerAction({
        key: 'follow_up_due',
        label: 'Follow-ups due',
        count: followUpDue,
        prospects: followUpDueProspects,
      }),
    ],
  }
}
