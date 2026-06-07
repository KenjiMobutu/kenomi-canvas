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
  bestOfferByCash: WeeklyReviewInsight
  bestAngle: WeeklyReviewInsight
  bestAngleByCash: WeeklyReviewInsight
  bestMessageFamily: WeeklyReviewInsight
  messageFamilyToStop: WeeklyReviewInsight
  topObjection: WeeklyReviewInsight
  highestValueObjection: WeeklyReviewInsight
  cashReality: WeeklyReviewInsight & {
    verdict: 'real_cash' | 'thin_cash' | 'no_cash_truth'
  }
  mainLeak: WeeklyReviewInsight & {
    stageKey: 'contact_to_reply' | 'reply_to_qualified' | 'qualified_to_meeting' | 'meeting_to_close'
  }
  nextExperiment: WeeklyReviewInsight & {
    focus: 'source' | 'segment' | 'offer' | 'angle' | 'message_family'
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

  const bestOfferByCash = input.conversions.bestOfferToCollectCash
    ? {
        title: input.conversions.bestOfferToCollectCash.offerName,
        detail: `${input.conversions.bestOfferToCollectCash.paidCashEur}€ attributed cash · ${input.conversions.bestOfferToCollectCash.paidCount} paid`,
      }
    : {
        title: 'No attributed offer cash yet',
        detail: 'Collect paid rows on offers to compare real cash by offer.',
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

  const bestAngleByCash = input.conversions.bestAngle
    ? {
        title: `${input.conversions.bestAngle.offerName} · ${input.conversions.bestAngle.angle}`,
        detail: `${input.conversions.bestAngle.paidCashEur}€ attributed cash · ${input.conversions.bestAngle.paidCount} paid`,
      }
    : {
        title: 'No attributed angle cash yet',
        detail: 'Tag outreach angles to compare cash collected by angle.',
      }

  const topObjection =
    input.conversions.messageFamilyTopObjection
      ? {
          title: formatReason(input.conversions.messageFamilyTopObjection.topObjection ?? undefined),
          detail: `${input.conversions.messageFamilyTopObjection.messageFamily} · ${input.conversions.messageFamilyTopObjection.objectionCount} occurrences this week`,
        }
      : input.conversions.commonObjections[0]
      ? {
          title: formatReason(input.conversions.commonObjections[0].type),
          detail: `${input.conversions.commonObjections[0].count} occurrences this week`,
        }
      : {
          title: 'No objection truth yet',
          detail: 'Classify replies to surface the main buying objection.',
        }

  const highestValueObjection = input.conversions.messageFamilyTopObjection
    ? {
        title: formatReason(input.conversions.messageFamilyTopObjection.topObjection ?? undefined),
        detail: `${input.conversions.messageFamilyTopObjection.messageFamily} blocks ${input.conversions.messageFamilyTopObjection.paidCashEur}€ cash path`,
      }
      : topObjection

  const paidCount = Number(input.conversions.overview.paidCount ?? 0)
  const paidCashEur = Number(input.conversions.overview.paidCashEur ?? 0)
  const cashReality: WeeklyRevenueReview['cashReality'] =
    paidCount <= 0
      ? {
          verdict: 'no_cash_truth',
          title: 'No paid truth yet',
          detail: 'No paid cash has been attributed this week. Do not overfit offers or message families yet.',
        }
      : paidCount === 1
        ? {
            verdict: 'thin_cash',
            title: 'Thin paid signal',
            detail: `${paidCount} paid row · ${paidCashEur}€ collected. Keep decisions conservative until more paid truth lands.`,
          }
        : {
            verdict: 'real_cash',
            title: 'Paid cash signal is live',
            detail: `${paidCount} paid rows · ${paidCashEur}€ collected. Weekly decisions can lean on paid truth.`,
          }

  const bestMessageFamily =
    input.conversions.bestMessageFamily
      ? {
          title: input.conversions.bestMessageFamily.messageFamily,
          detail: `${input.conversions.bestMessageFamily.paidCount} paid · ${input.conversions.bestMessageFamily.replyRate}% reply`,
        }
      : {
          title: 'No message truth yet',
          detail: 'Tag message families to compare what actually converts.',
        }

  const messageFamilyToStop =
    input.conversions.messageFamilyWinsNoCash ?? input.conversions.messageFamilyRepliesNoCash
      ? {
          title:
            input.conversions.messageFamilyWinsNoCash?.messageFamily ??
            input.conversions.messageFamilyRepliesNoCash?.messageFamily ??
            'No family to stop',
          detail:
            input.conversions.messageFamilyWinsNoCash
              ? `${input.conversions.messageFamilyWinsNoCash.wonCount} wins but ${input.conversions.messageFamilyWinsNoCash.paidCount} paid`
              : `${input.conversions.messageFamilyRepliesNoCash?.replied ?? 0} replies but ${input.conversions.messageFamilyRepliesNoCash?.paidCount ?? 0} paid`,
        }
      : {
          title: 'No family to stop yet',
          detail: 'Wait for clearer message-family cash underperformance before cutting one.',
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
  if (paidCount <= 0 && input.conversions.bestSegmentToReply) {
    nextExperiment = {
      focus: 'segment',
      title: `Get first paid proof on ${input.conversions.bestSegmentToReply.source}/${input.conversions.bestSegmentToReply.band}`,
      detail: `Drive one segment to first paid cash before changing the offer stack.`,
      source: input.conversions.bestSegmentToReply.source,
      band: input.conversions.bestSegmentToReply.band,
    }
  } else if (input.conversions.segmentRepliesNoPay && input.conversions.segmentRepliesNoPay.replied > 0) {
    nextExperiment = {
      focus: 'segment',
      title: `Fix close friction on ${input.conversions.segmentRepliesNoPay.source}/${input.conversions.segmentRepliesNoPay.band}`,
      detail: `Keep volume steady and test a tighter close for ${input.conversions.segmentRepliesNoPay.offerName}.`,
      source: input.conversions.segmentRepliesNoPay.source,
      band: input.conversions.segmentRepliesNoPay.band,
    }
  } else if (input.conversions.messageFamilyRepliesNoCash) {
    nextExperiment = {
      focus: 'message_family',
      title: `Tighten family ${input.conversions.messageFamilyRepliesNoCash.messageFamily}`,
      detail: `This family replies but does not convert to paid cash yet.`,
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
    bestOfferByCash,
    bestAngle,
    bestAngleByCash,
    bestMessageFamily,
    messageFamilyToStop,
    topObjection,
    highestValueObjection,
    cashReality,
    mainLeak,
    nextExperiment,
  }
}
