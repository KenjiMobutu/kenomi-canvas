type ProspectLike = {
  id: string
  source?: string | null
  outreach_angle?: string | null
  last_outreach_kind?: string | null
  metadata?: Record<string, unknown> | null
}

type ConversationEventLike = {
  prospect_id?: string | null
  event_type?: string | null
}

type PaymentAttributionLike = {
  prospect_id?: string | null
  amount_eur?: number | string | null
  payment_status?: string | null
}

export type MessageTruthRow = {
  messageFamily: string
  messageKey: string
  contacted: number
  replied: number
  wonCount: number
  paidCount: number
  paidCashEur: number
  replyRate: number
  winRate: number
  paidRate: number
  topObjection: string | null
  objectionCount: number
}

export type MessageTruthSnapshot = {
  breakdown: MessageTruthRow[]
  bestFamily: MessageTruthRow | null
  familyRepliesNoCash: MessageTruthRow | null
  familyWinsNoCash: MessageTruthRow | null
  topObjectionFamily: MessageTruthRow | null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return round1((value / total) * 100)
}

function isPaidStatus(status: string | null | undefined) {
  return ['paid', 'completed', 'succeeded', 'success'].includes(String(status ?? '').toLowerCase())
}

function objectionRank(type: string | null) {
  return type ? type : ''
}

export function deriveMessageMetadata(input: {
  outreach_angle?: string | null
  last_outreach_kind?: string | null
  source?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const metadata = input.metadata ?? {}
  const messageFamily =
    text(metadata.message_family) ??
    text(input.outreach_angle) ??
    text(input.last_outreach_kind) ??
    'general'
  const messageKey =
    text(metadata.message_key) ??
    `${messageFamily}:${text(input.last_outreach_kind) ?? 'initial'}:${text(input.source) ?? 'other'}`

  return { messageFamily, messageKey }
}

export function withMessageMetadata<T extends { metadata?: Record<string, unknown> | null; outreach_angle?: string | null; last_outreach_kind?: string | null; source?: string | null }>(
  row: T
) {
  const derived = deriveMessageMetadata(row)
  return {
    ...row,
    metadata: {
      ...(row.metadata ?? {}),
      message_family: derived.messageFamily,
      message_key: derived.messageKey,
    },
  }
}

export function buildMessageTruthSnapshot(input: {
  prospects: ProspectLike[]
  conversationEvents: ConversationEventLike[]
  paymentAttributions: PaymentAttributionLike[]
}): MessageTruthSnapshot {
  const familyByProspectId = new Map<string, { messageFamily: string; messageKey: string }>()
  const repliedProspects = new Set<string>()
  const wonProspects = new Set<string>()
  const paidCounts = new Map<string, number>()
  const paidCash = new Map<string, number>()
  const objectionsByProspectId = new Map<string, Map<string, number>>()

  for (const prospect of input.prospects) {
    familyByProspectId.set(prospect.id, deriveMessageMetadata(prospect))
  }

  for (const event of input.conversationEvents) {
    const prospectId = text(event.prospect_id)
    const type = text(event.event_type)
    if (!prospectId || !type) continue
    if (['positive_reply', 'soft_interest', 'referral', 'meeting_booked', 'closed_won'].includes(type)) {
      repliedProspects.add(prospectId)
    }
    if (type === 'closed_won') {
      wonProspects.add(prospectId)
    }
    if (['hard_no', 'budget_block', 'timing_block', 'wrong_person', 'closed_lost'].includes(type)) {
      const bucket = objectionsByProspectId.get(prospectId) ?? new Map<string, number>()
      bucket.set(type, (bucket.get(type) ?? 0) + 1)
      objectionsByProspectId.set(prospectId, bucket)
    }
  }

  for (const row of input.paymentAttributions) {
    const prospectId = text(row.prospect_id)
    if (!prospectId || !isPaidStatus(row.payment_status)) continue
    paidCounts.set(prospectId, (paidCounts.get(prospectId) ?? 0) + 1)
    paidCash.set(prospectId, round1((paidCash.get(prospectId) ?? 0) + Number(row.amount_eur ?? 0)))
  }

  const aggregate = new Map<
    string,
    {
      messageFamily: string
      messageKey: string
      contacted: number
      replied: number
      wonCount: number
      paidCount: number
      paidCashEur: number
      objectionCounts: Map<string, number>
    }
  >()

  for (const prospect of input.prospects) {
    const message = familyByProspectId.get(prospect.id) ?? deriveMessageMetadata(prospect)
    const bucket = aggregate.get(message.messageFamily) ?? {
      messageFamily: message.messageFamily,
      messageKey: message.messageKey,
      contacted: 0,
      replied: 0,
      wonCount: 0,
      paidCount: 0,
      paidCashEur: 0,
      objectionCounts: new Map<string, number>(),
    }
    bucket.contacted += 1
    if (repliedProspects.has(prospect.id)) bucket.replied += 1
    if (wonProspects.has(prospect.id)) bucket.wonCount += 1
    bucket.paidCount += paidCounts.get(prospect.id) ?? 0
    bucket.paidCashEur = round1(bucket.paidCashEur + (paidCash.get(prospect.id) ?? 0))

    const objections = objectionsByProspectId.get(prospect.id)
    if (objections) {
      for (const [type, count] of objections.entries()) {
        bucket.objectionCounts.set(type, (bucket.objectionCounts.get(type) ?? 0) + count)
      }
    }
    aggregate.set(message.messageFamily, bucket)
  }

  const breakdown = [...aggregate.values()]
    .map((entry) => {
      const topObjectionEntry =
        [...entry.objectionCounts.entries()].sort(
          (left, right) => right[1] - left[1] || objectionRank(left[0]).localeCompare(objectionRank(right[0]))
        )[0] ?? null
      return {
        messageFamily: entry.messageFamily,
        messageKey: entry.messageKey,
        contacted: entry.contacted,
        replied: entry.replied,
        wonCount: entry.wonCount,
        paidCount: entry.paidCount,
        paidCashEur: entry.paidCashEur,
        replyRate: percentage(entry.replied, entry.contacted),
        winRate: percentage(entry.wonCount, entry.contacted),
        paidRate: percentage(entry.paidCount, entry.contacted),
        topObjection: topObjectionEntry?.[0] ?? null,
        objectionCount: topObjectionEntry?.[1] ?? 0,
      }
    })
    .sort(
      (left, right) =>
        right.paidCashEur - left.paidCashEur ||
        right.paidCount - left.paidCount ||
        right.wonCount - left.wonCount ||
        right.replyRate - left.replyRate
    )

  return {
    breakdown,
    bestFamily: breakdown[0] ?? null,
    familyRepliesNoCash:
      breakdown
        .filter((row) => row.replied > 0 && row.paidCount === 0)
        .sort((left, right) => right.replied - left.replied || right.replyRate - left.replyRate)[0] ??
      null,
    familyWinsNoCash:
      breakdown
        .filter((row) => row.wonCount > 0 && row.paidCount === 0)
        .sort((left, right) => right.wonCount - left.wonCount || right.replyRate - left.replyRate)[0] ??
      null,
    topObjectionFamily:
      breakdown
        .filter((row) => row.objectionCount > 0)
        .sort((left, right) => right.objectionCount - left.objectionCount || right.replyRate - left.replyRate)[0] ??
      null,
  }
}
