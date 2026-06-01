import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'

export type HermesOperatorRunDelta = {
  replied: number
  paid: number
  followUpsDue: number
  pendingApprovals: number
  queuedJobs: number
  failedJobs: number
}

export type HermesOperatorBriefRecord = {
  userId: string
  runId: string
  summary: string
  cashDelta7d: number
  topBlocker: string
  topOpportunity: string
  bestOffer: string
  bestSegment: string
  bestSource: string
  mainLeak: string
  nextBestAction: string
  createdAt: string
}

function titleOrFallback(value: string | undefined, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function buildTopBlocker(context: HermesOperatorContextSnapshot, delta: HermesOperatorRunDelta | null) {
  const repliesNoCash = context.revenue.conversions.messageFamilyRepliesNoCash
  if (repliesNoCash) {
    return `${repliesNoCash.messageFamily} replies without cash (${repliesNoCash.replied} replies · ${repliesNoCash.paidCount} paid)`
  }
  if (delta && delta.followUpsDue > 0) {
    return `follow-ups due increased by ${delta.followUpsDue}`
  }
  if (delta && delta.failedJobs > 0) {
    return `failed operator jobs increased by ${delta.failedJobs}`
  }
  return titleOrFallback(context.revenue.weeklyReview.mainLeak.title, 'No critical blocker')
}

function buildTopOpportunity(context: HermesOperatorContextSnapshot) {
  const bestSegment = context.revenue.conversions.bestSegmentToPay
  if (bestSegment) {
    return `${bestSegment.source}/${bestSegment.band} is collecting cash fastest`
  }
  const bestSource = context.revenue.conversions.sourceCollectsFastest
  if (bestSource) {
    return `${bestSource.source} closes in ${bestSource.replyToCloseDays}d`
  }
  return titleOrFallback(context.revenue.weeklyReview.bestOffer.title, 'No clear opportunity yet')
}

function buildBestSegment(context: HermesOperatorContextSnapshot) {
  const bestSegment = context.revenue.conversions.bestSegmentToPay
  if (bestSegment) return `${bestSegment.source}/${bestSegment.band}`
  const reviewSegment = context.revenue.weeklyReview.bestSegment
  if (reviewSegment.source && reviewSegment.band) return `${reviewSegment.source}/${reviewSegment.band}`
  return reviewSegment.title
}

export function buildHermesOperatorBrief(input: {
  userId: string
  runId: string
  context: HermesOperatorContextSnapshot
  runDelta?: HermesOperatorRunDelta | null
  now?: Date
}): HermesOperatorBriefRecord {
  const nowIso = (input.now ?? new Date()).toISOString()
  const bestOffer =
    input.context.revenue.conversions.bestOfferToCollectCash?.offerName ??
    titleOrFallback(input.context.revenue.weeklyReview.bestOffer.title, 'No best offer yet')
  const bestSource =
    input.context.revenue.conversions.sourceCollectsFastest?.source ??
    input.context.revenue.weeklyReview.bestSource.source ??
    titleOrFallback(input.context.revenue.weeklyReview.bestSource.title, 'No best source yet')
  const bestSegment = buildBestSegment(input.context)
  const topBlocker = buildTopBlocker(input.context, input.runDelta ?? null)
  const topOpportunity = buildTopOpportunity(input.context)
  const mainLeak = `${input.context.revenue.weeklyReview.mainLeak.title} · ${input.context.revenue.weeklyReview.mainLeak.detail}`
  const nextBestAction = titleOrFallback(
    input.context.revenue.weeklyReview.nextExperiment.title,
    'Review the next commercial experiment.'
  )

  return {
    userId: input.userId,
    runId: input.runId,
    summary: `${bestOffer} is the current cash leader; ${bestSource} is the strongest source. Main blocker: ${topBlocker}.`,
    cashDelta7d: Number(input.context.revenue.outcomes.delta7d.cashEur.toFixed(2)),
    topBlocker,
    topOpportunity,
    bestOffer,
    bestSegment,
    bestSource,
    mainLeak,
    nextBestAction,
    createdAt: nowIso,
  }
}
