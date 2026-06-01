import { averageDaysFromMs, averageHoursFromMs, percentage } from '@/lib/revenue/funnel-metrics'
import { buildMessageTruthSnapshot, type MessageTruthRow } from '@/lib/revenue/message-truth'

type OfferRow = {
  id: string
  name?: string | null
}

type ProspectRow = {
  id: string
  source?: string | null
  band?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  pipeline_status?: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
}

type ProspectActivityRow = {
  prospect_id?: string | null
  type?: string | null
  created_at?: string | null
}

type ConversationEventRow = {
  prospect_id?: string | null
  event_type?: string | null
  created_at?: string | null
}

type PaymentAttributionRow = {
  prospect_id?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  source?: string | null
  band?: string | null
  amount_eur?: number | string | null
  payment_status?: string | null
  attributed_at?: string | null
  created_at?: string | null
}

type ReasonSummary = {
  type: string
  count: number
}

type StageRollup = {
  contacted: number
  replied: number
  qualifiedReplies: number
  meetingsBooked: number
  checkoutsCreated: number
  wonCount: number
  paidCount: number
  paidCashEur: number
}

type BreakdownBase = StageRollup & {
  replyRate: number
  qualifiedRate: number
  closeRate: number
  wonToPaidRate: number
  replyToPaidRate: number
}

export type ConversionTruthSnapshot = {
  overview: BreakdownBase & {
    leadToReplyHours: number
    replyToCloseDays: number
  }
  offerBreakdown: Array<
    BreakdownBase & {
      offerId: string | null
      offerName: string
      offerVariant: string | null
    }
  >
  angleBreakdown: Array<
    BreakdownBase & {
      key: string
      offerId: string | null
      offerName: string
      angle: string
    }
  >
  segmentOfferBreakdown: Array<
    BreakdownBase & {
      key: string
      source: string
      band: string
      offerId: string | null
      offerName: string
    }
  >
  modelBreakdown: Array<
    BreakdownBase & {
      model: string
      modelFamily: string
    }
  >
  bestOffer:
    | (BreakdownBase & {
        offerId: string | null
        offerName: string
        offerVariant: string | null
      })
    | null
  bestOfferToWin:
    | (BreakdownBase & {
        offerId: string | null
        offerName: string
        offerVariant: string | null
      })
    | null
  bestOfferToCollectCash:
    | (BreakdownBase & {
        offerId: string | null
        offerName: string
        offerVariant: string | null
      })
    | null
  bestAngle:
    | (BreakdownBase & {
        key: string
        offerId: string | null
        offerName: string
        angle: string
      })
    | null
  bestSegmentToReply:
    | (BreakdownBase & {
        key: string
        source: string
        band: string
        offerId: string | null
        offerName: string
      })
    | null
  bestSegmentToPay:
    | (BreakdownBase & {
        key: string
        source: string
        band: string
        offerId: string | null
        offerName: string
      })
    | null
  segmentRepliesNoPay:
    | (BreakdownBase & {
        key: string
        source: string
        band: string
        offerId: string | null
        offerName: string
      })
    | null
  segmentWinsNoCash:
    | (BreakdownBase & {
        key: string
        source: string
        band: string
        offerId: string | null
        offerName: string
      })
    | null
  sourceClosesFastest:
    | (BreakdownBase & {
        source: string
        leadToReplyHours: number
        replyToCloseDays: number
      })
    | null
  sourceCollectsFastest:
    | (BreakdownBase & {
        source: string
        leadToReplyHours: number
        replyToCloseDays: number
      })
    | null
  bestModel:
    | (BreakdownBase & {
        model: string
        modelFamily: string
      })
    | null
  messageFamilyBreakdown: MessageTruthRow[]
  bestMessageFamily: MessageTruthRow | null
  messageFamilyRepliesNoCash: MessageTruthRow | null
  messageFamilyWinsNoCash: MessageTruthRow | null
  messageFamilyTopObjection: MessageTruthRow | null
  commonObjections: ReasonSummary[]
  lostReasons: ReasonSummary[]
  repeatNext: {
    title: string
    detail: string
  } | null
  stopNext: {
    title: string
    detail: string
  } | null
}

function normalize(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function hasQualifiedReply(eventType: string) {
  return (
    eventType === 'positive_reply' ||
    eventType === 'soft_interest' ||
    eventType === 'referral' ||
    eventType === 'meeting_booked' ||
    eventType === 'closed_won'
  )
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN
  return new Date(value).getTime()
}

function addRates<T extends StageRollup>(entry: T): T & BreakdownBase {
  return {
    ...entry,
    replyRate: percentage(entry.replied, entry.contacted),
    qualifiedRate: percentage(entry.qualifiedReplies, entry.contacted),
    closeRate: percentage(entry.paidCount, entry.contacted),
    wonToPaidRate: percentage(entry.paidCount, entry.wonCount),
    replyToPaidRate: percentage(entry.paidCount, entry.replied),
  }
}

function sortByBusinessValue<T extends BreakdownBase>(left: T, right: T) {
  return (
    right.paidCashEur - left.paidCashEur ||
    right.paidCount - left.paidCount ||
    right.wonCount - left.wonCount ||
    right.meetingsBooked - left.meetingsBooked ||
    right.qualifiedReplies - left.qualifiedReplies ||
    right.replyRate - left.replyRate ||
    right.contacted - left.contacted
  )
}

function sortByWinValue<T extends BreakdownBase>(left: T, right: T) {
  return (
    right.wonCount - left.wonCount ||
    right.replyRate - left.replyRate ||
    right.contacted - left.contacted
  )
}

function sortByReplyValue<T extends BreakdownBase>(left: T, right: T) {
  return (
    right.replyRate - left.replyRate ||
    right.replied - left.replied ||
    right.qualifiedReplies - left.qualifiedReplies ||
    right.contacted - left.contacted
  )
}

function isPaidStatus(status: string | null | undefined) {
  return ['paid', 'completed', 'succeeded', 'success'].includes(String(status ?? '').toLowerCase())
}

function toCurrency(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100) / 100
}

export function buildConversionTruthSnapshot(input: {
  offers: OfferRow[]
  prospects: ProspectRow[]
  activities: ProspectActivityRow[]
  conversationEvents: ConversationEventRow[]
  paymentAttributions?: PaymentAttributionRow[]
}): ConversionTruthSnapshot {
  const offerNames = new Map(
    input.offers.map((offer) => [offer.id, normalize(offer.name, 'Unassigned offer')])
  )

  const firstSentAt = new Map<string, number>()
  const firstReplyAt = new Map<string, number>()
  const firstWonAt = new Map<string, number>()
  const firstPaidAt = new Map<string, number>()
  const paidCountByProspect = new Map<string, number>()
  const paidCashByProspect = new Map<string, number>()
  const attributionCountByProspect = new Map<string, number>()

  for (const activity of input.activities) {
    const prospectId = activity.prospect_id?.trim()
    const createdAt = toTimestamp(activity.created_at)
    if (!prospectId || !Number.isFinite(createdAt)) continue

    if (activity.type === 'marked_sent' || activity.type === 'follow_up_marked_sent') {
      firstSentAt.set(
        prospectId,
        Math.min(createdAt, firstSentAt.get(prospectId) ?? Number.POSITIVE_INFINITY)
      )
    }
    if (activity.type === 'marked_replied') {
      firstReplyAt.set(
        prospectId,
        Math.min(createdAt, firstReplyAt.get(prospectId) ?? Number.POSITIVE_INFINITY)
      )
    }
    if (activity.type === 'marked_won') {
      firstWonAt.set(
        prospectId,
        Math.min(createdAt, firstWonAt.get(prospectId) ?? Number.POSITIVE_INFINITY)
      )
    }
  }

  const latestConversationType = new Map<string, string>()
  const objectionCounts = new Map<string, number>()
  const lostReasonCounts = new Map<string, number>()
  for (const event of input.conversationEvents) {
    const prospectId = event.prospect_id?.trim()
    const eventType = event.event_type?.trim()
    const createdAt = toTimestamp(event.created_at)
    if (!prospectId || !eventType || !Number.isFinite(createdAt)) continue

    if (hasQualifiedReply(eventType) && !firstReplyAt.has(prospectId)) {
      firstReplyAt.set(prospectId, createdAt)
    }
    if (eventType === 'closed_won' && !firstWonAt.has(prospectId)) {
      firstWonAt.set(prospectId, createdAt)
    }
    if (['budget_block', 'timing_block', 'wrong_person', 'hard_no'].includes(eventType)) {
      objectionCounts.set(eventType, (objectionCounts.get(eventType) ?? 0) + 1)
    }
    if (['closed_lost', 'budget_block', 'timing_block', 'wrong_person', 'hard_no'].includes(eventType)) {
      lostReasonCounts.set(eventType, (lostReasonCounts.get(eventType) ?? 0) + 1)
    }
    const currentType = latestConversationType.get(prospectId)
    if (!currentType || (createdAt >= toTimestamp(input.conversationEvents.find((row) => row.prospect_id === prospectId && row.event_type === currentType)?.created_at))) {
      latestConversationType.set(prospectId, eventType)
    }
  }

  for (const row of input.paymentAttributions ?? []) {
    const prospectId = row.prospect_id?.trim()
    const createdAt = toTimestamp(row.attributed_at ?? row.created_at)
    if (!prospectId) continue

    attributionCountByProspect.set(prospectId, (attributionCountByProspect.get(prospectId) ?? 0) + 1)
    if (!isPaidStatus(row.payment_status)) continue

    paidCountByProspect.set(prospectId, (paidCountByProspect.get(prospectId) ?? 0) + 1)
    paidCashByProspect.set(
      prospectId,
      toCurrency((paidCashByProspect.get(prospectId) ?? 0) + toCurrency(row.amount_eur))
    )
    if (Number.isFinite(createdAt)) {
      firstPaidAt.set(
        prospectId,
        Math.min(createdAt, firstPaidAt.get(prospectId) ?? Number.POSITIVE_INFINITY)
      )
    }
  }

  const offerMap = new Map<
    string,
    StageRollup & { offerId: string | null; offerName: string; offerVariant: string | null }
  >()
  const angleMap = new Map<
    string,
    StageRollup & { key: string; offerId: string | null; offerName: string; angle: string }
  >()
  const segmentOfferMap = new Map<
    string,
    StageRollup & { key: string; source: string; band: string; offerId: string | null; offerName: string }
  >()
  const modelMap = new Map<
    string,
    StageRollup & { model: string; modelFamily: string }
  >()
  const sourceVelocityMap = new Map<
    string,
    StageRollup & { source: string; leadToReplyMs: number[]; replyToCloseMs: number[] }
  >()

  const overview: StageRollup = {
    contacted: 0,
    replied: 0,
    qualifiedReplies: 0,
    meetingsBooked: 0,
    checkoutsCreated: 0,
    wonCount: 0,
    paidCount: 0,
    paidCashEur: 0,
  }
  const leadToReplyMs: number[] = []
  const replyToCloseMs: number[] = []

  for (const prospect of input.prospects) {
    const prospectId = prospect.id
    const offerId = prospect.offer_id?.trim() || null
    const offerName = offerId ? (offerNames.get(offerId) ?? 'Assigned offer') : 'Unassigned offer'
    const source = normalize(prospect.source, 'other')
    const band = normalize(prospect.band, 'warm')
    const angle = normalize(prospect.outreach_angle, 'unassigned')
    const variant = prospect.offer_variant?.trim() || null
    const model = normalize(prospect.metadata?.model, 'unknown')
    const modelFamily = normalize(prospect.metadata?.model_family, 'other')
    const pipelineStatus = normalize(prospect.pipeline_status, 'new')
    const sentAt = firstSentAt.get(prospectId)
    const repliedAt = firstReplyAt.get(prospectId)
    const wonAt = firstWonAt.get(prospectId)
    const paidAt = firstPaidAt.get(prospectId)
    const conversationType = latestConversationType.get(prospectId)
    const paidCount = paidCountByProspect.get(prospectId) ?? 0
    const paidCashEur = paidCashByProspect.get(prospectId) ?? 0

    const contacted = Number.isFinite(sentAt)
    const replied =
      Number.isFinite(repliedAt) ||
      pipelineStatus === 'replied' ||
      pipelineStatus === 'won' ||
      pipelineStatus === 'lost'
    const qualifiedReplies =
      replied &&
      (conversationType ? hasQualifiedReply(conversationType) : pipelineStatus === 'won')
    const meetingsBooked =
      conversationType === 'meeting_booked' ||
      conversationType === 'closed_won' ||
      pipelineStatus === 'won'
    const won = conversationType === 'closed_won' || pipelineStatus === 'won'
    const checkoutsCreated = (attributionCountByProspect.get(prospectId) ?? 0) > 0 || won

    if (contacted) overview.contacted += 1
    if (replied) overview.replied += 1
    if (qualifiedReplies) overview.qualifiedReplies += 1
    if (meetingsBooked) overview.meetingsBooked += 1
    if (checkoutsCreated) overview.checkoutsCreated += 1
    if (won) overview.wonCount += 1
    overview.paidCount += paidCount
    overview.paidCashEur = toCurrency(overview.paidCashEur + paidCashEur)

    if (Number.isFinite(repliedAt) && Number.isFinite(sentAt)) {
      leadToReplyMs.push(repliedAt! - sentAt!)
    }
    if (Number.isFinite(repliedAt) && Number.isFinite((paidAt ?? wonAt) as number)) {
      replyToCloseMs.push((paidAt ?? wonAt)! - repliedAt!)
    }

    const offerKey = offerId ?? 'unassigned'
    const angleKey = `${offerKey}:${angle}`
    const segmentKey = `${source}:${band}:${offerKey}`
    const modelKey = `${modelFamily}:${model}`

    if (!offerMap.has(offerKey)) {
      offerMap.set(offerKey, {
        offerId,
        offerName,
        offerVariant: variant,
        contacted: 0,
        replied: 0,
        qualifiedReplies: 0,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
      })
    }
    if (!angleMap.has(angleKey)) {
      angleMap.set(angleKey, {
        key: angleKey,
        offerId,
        offerName,
        angle,
        contacted: 0,
        replied: 0,
        qualifiedReplies: 0,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
      })
    }
    if (!segmentOfferMap.has(segmentKey)) {
      segmentOfferMap.set(segmentKey, {
        key: segmentKey,
        source,
        band,
        offerId,
        offerName,
        contacted: 0,
        replied: 0,
        qualifiedReplies: 0,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
      })
    }
    if (!modelMap.has(modelKey)) {
      modelMap.set(modelKey, {
        model,
        modelFamily,
        contacted: 0,
        replied: 0,
        qualifiedReplies: 0,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
      })
    }
    if (!sourceVelocityMap.has(source)) {
      sourceVelocityMap.set(source, {
        source,
        contacted: 0,
        replied: 0,
        qualifiedReplies: 0,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
        leadToReplyMs: [],
        replyToCloseMs: [],
      })
    }

    const buckets = [
      offerMap.get(offerKey)!,
      angleMap.get(angleKey)!,
      segmentOfferMap.get(segmentKey)!,
      modelMap.get(modelKey)!,
      sourceVelocityMap.get(source)!,
    ]

    for (const bucket of buckets) {
      if (contacted) bucket.contacted += 1
      if (replied) bucket.replied += 1
      if (qualifiedReplies) bucket.qualifiedReplies += 1
      if (meetingsBooked) bucket.meetingsBooked += 1
      if (checkoutsCreated) bucket.checkoutsCreated += 1
      if (won) bucket.wonCount += 1
      bucket.paidCount += paidCount
      bucket.paidCashEur = toCurrency(bucket.paidCashEur + paidCashEur)
    }

    const sourceBucket = sourceVelocityMap.get(source)!
    if (Number.isFinite(repliedAt) && Number.isFinite(sentAt)) {
      sourceBucket.leadToReplyMs.push(repliedAt! - sentAt!)
    }
    if (Number.isFinite(repliedAt) && Number.isFinite((paidAt ?? wonAt) as number)) {
      sourceBucket.replyToCloseMs.push((paidAt ?? wonAt)! - repliedAt!)
    }
  }

  const offerBreakdown = Array.from(offerMap.values()).map(addRates).sort(sortByBusinessValue)
  const angleBreakdown = Array.from(angleMap.values()).map(addRates).sort(sortByBusinessValue)
  const segmentOfferBreakdown = Array.from(segmentOfferMap.values())
    .map(addRates)
    .sort(sortByBusinessValue)
  const modelBreakdown = Array.from(modelMap.values()).map(addRates).sort(sortByBusinessValue)

  const sourceClosesFastest = Array.from(sourceVelocityMap.values())
    .map((entry) => ({
      ...addRates(entry),
      leadToReplyHours: averageHoursFromMs(entry.leadToReplyMs),
      replyToCloseDays: averageDaysFromMs(entry.replyToCloseMs),
    }))
    .filter((entry) => entry.wonCount > 0)
    .sort(
      (left, right) =>
        left.replyToCloseDays - right.replyToCloseDays ||
        right.wonCount - left.wonCount ||
        right.replyRate - left.replyRate
    )[0] ?? null

  const sourceCollectsFastest = Array.from(sourceVelocityMap.values())
    .map((entry) => ({
      ...addRates(entry),
      leadToReplyHours: averageHoursFromMs(entry.leadToReplyMs),
      replyToCloseDays: averageDaysFromMs(entry.replyToCloseMs),
    }))
    .filter((entry) => entry.paidCount > 0)
    .sort(
      (left, right) =>
        left.replyToCloseDays - right.replyToCloseDays ||
        right.paidCashEur - left.paidCashEur ||
        right.paidCount - left.paidCount
    )[0] ?? null

  const commonObjections = Array.from(objectionCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
    .slice(0, 4)

  const lostReasons = Array.from(lostReasonCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
    .slice(0, 4)

  const repeatNext = angleBreakdown[0]
    ? {
        title: `${angleBreakdown[0].offerName} · ${angleBreakdown[0].angle}`,
        detail: `${angleBreakdown[0].paidCount} paid · ${angleBreakdown[0].closeRate}% paid conversion. Repeat this positioning next.`,
      }
    : null

  const stopCandidate =
    segmentOfferBreakdown
      .filter(
        (entry) =>
          entry.paidCount === 0 &&
          (entry.replied > 0 || entry.qualifiedReplies > 0 || entry.contacted > 0)
      )
      .sort(
        (left, right) =>
          right.replied - left.replied ||
          right.qualifiedReplies - left.qualifiedReplies ||
          right.contacted - left.contacted
      )[0] ?? null

  const stopNext = stopCandidate
    ? {
        title: `${stopCandidate.source}/${stopCandidate.band} · ${stopCandidate.offerName}`,
        detail: `${stopCandidate.replied} replies with ${stopCandidate.paidCount} paid. Change offer, angle, or sequence before adding more volume.`,
      }
    : null

  const messageTruth = buildMessageTruthSnapshot({
    prospects: input.prospects.map((prospect) => ({
      id: prospect.id,
      source: prospect.source,
      outreach_angle: prospect.outreach_angle,
      last_outreach_kind: (prospect.metadata?.last_outreach_kind as string | undefined) ?? null,
      metadata: prospect.metadata as Record<string, unknown> | null | undefined,
    })),
    conversationEvents: input.conversationEvents,
    paymentAttributions: input.paymentAttributions ?? [],
  })

  const bestOffer = [...offerBreakdown].sort(sortByBusinessValue)[0] ?? null
  const bestOfferToWin = [...offerBreakdown].sort(sortByWinValue)[0] ?? null
  const bestOfferToCollectCash = [...offerBreakdown].sort(sortByBusinessValue)[0] ?? null
  const bestSegmentToReply = [...segmentOfferBreakdown].sort(sortByReplyValue)[0] ?? null
  const bestSegmentToPay = [...segmentOfferBreakdown].sort(sortByBusinessValue)[0] ?? null
  const segmentWinsNoCash =
    [...segmentOfferBreakdown]
      .filter((entry) => entry.wonCount > 0 && entry.paidCount === 0)
      .sort((left, right) => right.wonCount - left.wonCount || right.replied - left.replied)[0] ??
    null

  return {
    overview: {
      ...addRates(overview),
      leadToReplyHours: averageHoursFromMs(leadToReplyMs),
      replyToCloseDays: averageDaysFromMs(replyToCloseMs),
    },
    offerBreakdown,
    angleBreakdown,
    segmentOfferBreakdown,
    modelBreakdown,
    bestOffer,
    bestOfferToWin,
    bestOfferToCollectCash,
    bestAngle: angleBreakdown[0] ?? null,
    bestSegmentToReply,
    bestSegmentToPay,
    segmentRepliesNoPay:
      segmentOfferBreakdown
        .filter((entry) => entry.replied > 0 && entry.paidCount === 0)
        .sort((left, right) => right.replied - left.replied || right.qualifiedReplies - left.qualifiedReplies)[0] ??
      segmentOfferBreakdown[0] ??
      null,
    segmentWinsNoCash,
    sourceClosesFastest,
    sourceCollectsFastest,
    bestModel: modelBreakdown[0] ?? null,
    messageFamilyBreakdown: messageTruth.breakdown,
    bestMessageFamily: messageTruth.bestFamily,
    messageFamilyRepliesNoCash: messageTruth.familyRepliesNoCash,
    messageFamilyWinsNoCash: messageTruth.familyWinsNoCash,
    messageFamilyTopObjection: messageTruth.topObjectionFamily,
    commonObjections,
    lostReasons,
    repeatNext,
    stopNext,
  }
}
