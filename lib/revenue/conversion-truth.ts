import { averageDaysFromMs, averageHoursFromMs, percentage } from '@/lib/revenue/funnel-metrics'

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

type StageRollup = {
  contacted: number
  replied: number
  qualifiedReplies: number
  meetingsBooked: number
  checkoutsCreated: number
  paid: number
}

type BreakdownBase = StageRollup & {
  replyRate: number
  qualifiedRate: number
  closeRate: number
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
  bestOffer:
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
  segmentRepliesNoPay:
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
    closeRate: percentage(entry.paid, entry.contacted),
  }
}

function sortByBusinessValue<T extends BreakdownBase>(left: T, right: T) {
  return (
    right.paid - left.paid ||
    right.meetingsBooked - left.meetingsBooked ||
    right.qualifiedReplies - left.qualifiedReplies ||
    right.replyRate - left.replyRate ||
    right.contacted - left.contacted
  )
}

export function buildConversionTruthSnapshot(input: {
  offers: OfferRow[]
  prospects: ProspectRow[]
  activities: ProspectActivityRow[]
  conversationEvents: ConversationEventRow[]
}): ConversionTruthSnapshot {
  const offerNames = new Map(
    input.offers.map((offer) => [offer.id, normalize(offer.name, 'Unassigned offer')])
  )

  const firstSentAt = new Map<string, number>()
  const firstReplyAt = new Map<string, number>()
  const firstWonAt = new Map<string, number>()

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
    const currentType = latestConversationType.get(prospectId)
    if (!currentType || (createdAt >= toTimestamp(input.conversationEvents.find((row) => row.prospect_id === prospectId && row.event_type === currentType)?.created_at))) {
      latestConversationType.set(prospectId, eventType)
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
    paid: 0,
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
    const pipelineStatus = normalize(prospect.pipeline_status, 'new')
    const sentAt = firstSentAt.get(prospectId)
    const repliedAt = firstReplyAt.get(prospectId)
    const wonAt = firstWonAt.get(prospectId)
    const conversationType = latestConversationType.get(prospectId)

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
    const paid = conversationType === 'closed_won' || pipelineStatus === 'won'
    const checkoutsCreated = paid

    if (contacted) overview.contacted += 1
    if (replied) overview.replied += 1
    if (qualifiedReplies) overview.qualifiedReplies += 1
    if (meetingsBooked) overview.meetingsBooked += 1
    if (checkoutsCreated) overview.checkoutsCreated += 1
    if (paid) overview.paid += 1

    if (Number.isFinite(repliedAt) && Number.isFinite(sentAt)) {
      leadToReplyMs.push(repliedAt! - sentAt!)
    }
    if (Number.isFinite(wonAt) && Number.isFinite(repliedAt)) {
      replyToCloseMs.push(wonAt! - repliedAt!)
    }

    const offerKey = offerId ?? 'unassigned'
    const angleKey = `${offerKey}:${angle}`
    const segmentKey = `${source}:${band}:${offerKey}`

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
        paid: 0,
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
        paid: 0,
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
        paid: 0,
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
        paid: 0,
        leadToReplyMs: [],
        replyToCloseMs: [],
      })
    }

    const buckets = [
      offerMap.get(offerKey)!,
      angleMap.get(angleKey)!,
      segmentOfferMap.get(segmentKey)!,
      sourceVelocityMap.get(source)!,
    ]

    for (const bucket of buckets) {
      if (contacted) bucket.contacted += 1
      if (replied) bucket.replied += 1
      if (qualifiedReplies) bucket.qualifiedReplies += 1
      if (meetingsBooked) bucket.meetingsBooked += 1
      if (checkoutsCreated) bucket.checkoutsCreated += 1
      if (paid) bucket.paid += 1
    }

    const sourceBucket = sourceVelocityMap.get(source)!
    if (Number.isFinite(repliedAt) && Number.isFinite(sentAt)) {
      sourceBucket.leadToReplyMs.push(repliedAt! - sentAt!)
    }
    if (Number.isFinite(wonAt) && Number.isFinite(repliedAt)) {
      sourceBucket.replyToCloseMs.push(wonAt! - repliedAt!)
    }
  }

  const offerBreakdown = Array.from(offerMap.values()).map(addRates).sort(sortByBusinessValue)
  const angleBreakdown = Array.from(angleMap.values()).map(addRates).sort(sortByBusinessValue)
  const segmentOfferBreakdown = Array.from(segmentOfferMap.values())
    .map(addRates)
    .sort(sortByBusinessValue)

  const sourceClosesFastest = Array.from(sourceVelocityMap.values())
    .map((entry) => ({
      ...addRates(entry),
      leadToReplyHours: averageHoursFromMs(entry.leadToReplyMs),
      replyToCloseDays: averageDaysFromMs(entry.replyToCloseMs),
    }))
    .filter((entry) => entry.paid > 0)
    .sort(
      (left, right) =>
        left.replyToCloseDays - right.replyToCloseDays ||
        right.paid - left.paid ||
        right.replyRate - left.replyRate
    )[0] ?? null

  return {
    overview: {
      ...addRates(overview),
      leadToReplyHours: averageHoursFromMs(leadToReplyMs),
      replyToCloseDays: averageDaysFromMs(replyToCloseMs),
    },
    offerBreakdown,
    angleBreakdown,
    segmentOfferBreakdown,
    bestOffer: offerBreakdown[0] ?? null,
    bestAngle: angleBreakdown[0] ?? null,
    segmentRepliesNoPay:
      segmentOfferBreakdown
        .filter((entry) => entry.replied > 0 && entry.paid === 0)
        .sort((left, right) => right.replied - left.replied || right.qualifiedReplies - left.qualifiedReplies)[0] ??
      segmentOfferBreakdown[0] ??
      null,
    sourceClosesFastest,
  }
}
