import type { ConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'

export type WeeklyReviewInsight = {
  title: string
  detail: string
  source?: string
  band?: string
}

export type WeeklyRevenueReview = {
  window: {
    weekStart: string
    weekEnd: string
    label: string
  }
  bestSource: WeeklyReviewInsight
  bestSegment: WeeklyReviewInsight
  bestOffer: WeeklyReviewInsight
  bestAngle: WeeklyReviewInsight
  topObjection: WeeklyReviewInsight
  mainLeak: WeeklyReviewInsight & {
    stageKey: 'contact_to_reply' | 'reply_to_qualified' | 'qualified_to_meeting' | 'meeting_to_close'
  }
  nextExperiment: WeeklyReviewInsight & {
    focus: 'source' | 'segment' | 'offer' | 'angle'
  }
}

function startOfWeek(date: Date) {
  const clone = new Date(date)
  const day = clone.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  clone.setUTCDate(clone.getUTCDate() + diff)
  clone.setUTCHours(0, 0, 0, 0)
  return clone
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatReason(type: string | undefined) {
  if (!type) return 'unknown'
  return type.replaceAll('_', ' ')
}

export function buildWeeklyRevenueReview(input: {
  conversions: ConversionTruthSnapshot
  nowIso?: string
}): WeeklyRevenueReview {
  const now = input.nowIso ? new Date(input.nowIso) : new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)

  const bestSource =
    input.conversions.sourceCollectsFastest
      ? {
          title: input.conversions.sourceCollectsFastest.source,
          detail: `${input.conversions.sourceCollectsFastest.paidCount} paid · ${input.conversions.sourceCollectsFastest.replyToCloseDays}d reply→cash`,
          source: input.conversions.sourceCollectsFastest.source,
        }
      : {
          title: 'No source truth yet',
          detail: 'Record paid revenue to identify the best cash source.',
        }

  const bestSegment =
    input.conversions.segmentRepliesNoPay
      ? {
          title: `${input.conversions.segmentRepliesNoPay.source}/${input.conversions.segmentRepliesNoPay.band} · ${input.conversions.segmentRepliesNoPay.offerName}`,
          detail: `${input.conversions.segmentRepliesNoPay.replied} replies · ${input.conversions.segmentRepliesNoPay.paidCount} paid`,
          source: input.conversions.segmentRepliesNoPay.source,
          band: input.conversions.segmentRepliesNoPay.band,
        }
      : {
          title: 'No segment truth yet',
          detail: 'Add more segmented prospect activity to compare source and band quality.',
        }

  const bestOffer =
    input.conversions.bestOfferToCollectCash
      ? {
          title: input.conversions.bestOfferToCollectCash.offerName,
          detail: `${input.conversions.bestOfferToCollectCash.paidCount} paid · ${input.conversions.bestOfferToCollectCash.paidCashEur}€ collected`,
        }
      : {
          title: 'No offer truth yet',
          detail: 'Assign offers to prospects and record outcomes to compare offers.',
        }

  const bestAngle =
    input.conversions.bestAngle
      ? {
          title: `${input.conversions.bestAngle.offerName} · ${input.conversions.bestAngle.angle}`,
          detail: `${input.conversions.bestAngle.paidCount} paid · ${input.conversions.bestAngle.replyRate}% reply`,
        }
      : {
          title: 'No angle truth yet',
          detail: 'Tag outreach angles to learn which message converts best.',
        }

  const topObjection =
    input.conversions.commonObjections[0]
      ? {
          title: formatReason(input.conversions.commonObjections[0].type),
          detail: `${input.conversions.commonObjections[0].count} occurrences this week`,
        }
      : {
          title: 'No objection truth yet',
          detail: 'Classify replies to surface the main buying objection.',
        }

  const stageLeakCandidates = [
    {
      stageKey: 'contact_to_reply' as const,
      title: 'Contact → reply',
      lost:
        input.conversions.overview.contacted - input.conversions.overview.replied,
      detail: `${input.conversions.overview.contacted} contacted · ${input.conversions.overview.replied} replied`,
    },
    {
      stageKey: 'reply_to_qualified' as const,
      title: 'Reply → qualified',
      lost:
        input.conversions.overview.replied - input.conversions.overview.qualifiedReplies,
      detail: `${input.conversions.overview.replied} replied · ${input.conversions.overview.qualifiedReplies} qualified`,
    },
    {
      stageKey: 'qualified_to_meeting' as const,
      title: 'Qualified → meeting',
      lost:
        input.conversions.overview.qualifiedReplies - input.conversions.overview.meetingsBooked,
      detail: `${input.conversions.overview.qualifiedReplies} qualified · ${input.conversions.overview.meetingsBooked} meetings`,
    },
    {
      stageKey: 'meeting_to_close' as const,
      title: 'Meeting → close',
      lost:
        input.conversions.overview.meetingsBooked - input.conversions.overview.paidCount,
      detail: `${input.conversions.overview.meetingsBooked} meetings · ${input.conversions.overview.paidCount} paid`,
    },
  ]
  const mainLeakCandidate =
    [...stageLeakCandidates].sort((left, right) => right.lost - left.lost)[0] ??
    stageLeakCandidates[0]

  const mainLeak: WeeklyRevenueReview['mainLeak'] = {
    stageKey: mainLeakCandidate.stageKey,
    title: mainLeakCandidate.title,
    detail:
      mainLeakCandidate.lost > 0
        ? `${mainLeakCandidate.lost} prospects lost here · ${mainLeakCandidate.detail}`
        : `No visible leak this week · ${mainLeakCandidate.detail}`,
  }

  let nextExperiment: WeeklyRevenueReview['nextExperiment']
  if (input.conversions.segmentRepliesNoPay && input.conversions.segmentRepliesNoPay.replied > 0) {
    nextExperiment = {
      focus: 'segment',
      title: `Fix close friction on ${input.conversions.segmentRepliesNoPay.source}/${input.conversions.segmentRepliesNoPay.band}`,
      detail: `Keep volume steady and test a tighter close for ${input.conversions.segmentRepliesNoPay.offerName}.`,
      source: input.conversions.segmentRepliesNoPay.source,
      band: input.conversions.segmentRepliesNoPay.band,
    }
  } else if (input.conversions.bestAngle) {
    nextExperiment = {
      focus: 'angle',
      title: `Reuse angle ${input.conversions.bestAngle.angle}`,
      detail: `Push the ${input.conversions.bestAngle.angle} angle into more outreach for ${input.conversions.bestAngle.offerName}.`,
    }
  } else if (input.conversions.bestOffer) {
    nextExperiment = {
      focus: 'offer',
      title: `Double down on ${input.conversions.bestOfferToCollectCash?.offerName ?? 'best offer'}`,
      detail: 'Use the best-closing offer as the default until another offer beats it.',
    }
  } else {
    nextExperiment = {
      focus: 'source',
      title: 'Increase signal quality',
      detail: 'Generate more segmented prospect volume before changing the offer.',
    }
  }

  return {
    window: {
      weekStart: toDateKey(weekStart),
      weekEnd: toDateKey(weekEnd),
      label: `${toDateKey(weekStart)} → ${toDateKey(weekEnd)}`,
    },
    bestSource,
    bestSegment,
    bestOffer,
    bestAngle,
    topObjection,
    mainLeak,
    nextExperiment,
  }
}
