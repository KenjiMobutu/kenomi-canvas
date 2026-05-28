type ActionKind = 'approval' | 'follow_up' | 'send' | 'revenue' | 'lead'

type ProspectLike = {
  id: string
  company_name: string
  source?: string | null
  band?: string | null
  score: number
  pipeline_status: string
  approval_status: string
  offer_id?: string | null
  outreach_angle?: string | null
  latest_conversation_event_type?: string | null
}

type SegmentFocusLike = {
  source: string
  band: string
  qualityScore: number
  playbookHint?: string
} | null

type ConversionFocusLike = {
  bestOffer: { offerId: string | null; closeRate: number } | null
  bestAngle: { offerId: string | null; angle: string; closeRate: number } | null
  segmentRepliesNoPay: {
    source: string
    band: string
    offerId: string | null
    replied: number
    paid: number
  } | null
} | null

export function scoreCashActionCandidate(input: {
  kind: ActionKind
  basePriority: number
  prospect?: ProspectLike | null
  segmentFocus?: SegmentFocusLike
  conversions?: ConversionFocusLike
}) {
  let priority = input.basePriority
  let expectedCashEur = 0
  let reasonLabel = 'pipeline urgency'

  const prospect = input.prospect ?? null
  const conversions = input.conversions ?? null
  const segmentFocus = input.segmentFocus ?? null

  if (prospect) {
    expectedCashEur += Math.round(prospect.score * 4)

    if (
      conversions?.bestOffer?.offerId &&
      prospect.offer_id &&
      conversions.bestOffer.offerId === prospect.offer_id
    ) {
      priority += 14
      expectedCashEur += Math.round(conversions.bestOffer.closeRate * 8)
      reasonLabel = 'best offer'
    }

    if (
      conversions?.bestAngle?.offerId &&
      conversions.bestAngle.angle &&
      prospect.offer_id === conversions.bestAngle.offerId &&
      prospect.outreach_angle === conversions.bestAngle.angle
    ) {
      priority += 18
      expectedCashEur += Math.round(conversions.bestAngle.closeRate * 10)
      reasonLabel = reasonLabel === 'best offer' ? 'best offer + angle' : 'best angle'
    }

    if (
      segmentFocus &&
      prospect.source === segmentFocus.source &&
      prospect.band === segmentFocus.band
    ) {
      priority += Math.round(segmentFocus.qualityScore * 0.18)
      expectedCashEur += Math.round(segmentFocus.qualityScore * 3)
    }

    if (
      conversions?.segmentRepliesNoPay &&
      prospect.source === conversions.segmentRepliesNoPay.source &&
      prospect.band === conversions.segmentRepliesNoPay.band &&
      (conversions.segmentRepliesNoPay.offerId === null ||
        prospect.offer_id === conversions.segmentRepliesNoPay.offerId)
    ) {
      if (input.kind === 'follow_up' || input.kind === 'send' || input.kind === 'approval') {
        priority += 12
        reasonLabel = 'stuck after reply'
      } else if (input.kind === 'lead') {
        priority -= 10
      }
    }

    if (
      prospect.latest_conversation_event_type === 'budget_block' ||
      prospect.latest_conversation_event_type === 'timing_block' ||
      prospect.latest_conversation_event_type === 'wrong_person'
    ) {
      priority += input.kind === 'follow_up' ? 8 : -4
      reasonLabel = 'stuck after reply'
    }
  }

  if (input.kind === 'revenue') {
    expectedCashEur = Math.max(expectedCashEur, 400)
  }

  expectedCashEur = Math.max(0, expectedCashEur)

  return {
    priority,
    expectedCashEur,
    expectedCashLabel: `expected cash +${expectedCashEur} €`,
    reasonLabel,
  }
}
