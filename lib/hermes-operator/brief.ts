import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'
import { DIAGNOSTIC_CASH_LANE } from '@/lib/revenue/diagnostic-cash-lane'

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

function buildQueueFocus(context: HermesOperatorContextSnapshot) {
  if (context.prospects.pendingApprovals > 0) {
    return {
      blocker: `${context.prospects.pendingApprovals} approvals are blocking the ${DIAGNOSTIC_CASH_LANE.offer.title} outbound lane`,
      nextAction: `Clear ${context.prospects.pendingApprovals} approvals in Prospects for ${DIAGNOSTIC_CASH_LANE.offer.title}`,
      topOpportunity: `${context.prospects.pendingApprovals} approval-gated diagnostic drafts can move now`,
    }
  }
  if (context.prospects.followUpsDue > 0) {
    return {
      blocker: `${context.prospects.followUpsDue} follow-ups are due in the ${DIAGNOSTIC_CASH_LANE.offer.title} lane`,
      nextAction: `Run follow-up queue on ${context.prospects.followUpsDue} diagnostic prospects`,
      topOpportunity: `${context.prospects.followUpsDue} due diagnostic follow-ups are ready to push`,
    }
  }
  if (context.prospects.hotLeads > 0) {
    return {
      blocker: null,
      nextAction: `Run prospect on ${context.prospects.hotLeads} hot diagnostic leads`,
      topOpportunity: `${context.prospects.hotLeads} hot leads are ready for the diagnostic offer`,
    }
  }
  if (context.automation.failedJobs > 0 || context.infrastructure.status !== 'ok') {
    return {
      blocker: `${context.automation.failedJobs} operator failures need cleanup`,
      nextAction: 'Run devops diagnostics now',
      topOpportunity: titleOrFallback(context.infrastructure.operatorNextStep, 'Recover operator throughput'),
    }
  }
  return {
    blocker: null,
    nextAction: null,
    topOpportunity: null,
  }
}

function buildTopBlocker(context: HermesOperatorContextSnapshot, delta: HermesOperatorRunDelta | null) {
  const queueFocus = buildQueueFocus(context)
  if (queueFocus.blocker) return queueFocus.blocker
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
  const queueFocus = buildQueueFocus(context)
  if (queueFocus.topOpportunity) return queueFocus.topOpportunity
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
  const queueFocus = buildQueueFocus(input.context)
  const topBlocker = buildTopBlocker(input.context, input.runDelta ?? null)
  const topOpportunity = buildTopOpportunity(input.context)
  const mainLeak = `${input.context.revenue.weeklyReview.mainLeak.title} · ${input.context.revenue.weeklyReview.mainLeak.detail}`
  const stopThisWeek = titleOrFallback(
    input.context.revenue.weeklyReview.messageFamilyToStop.title,
    'No weak message family flagged yet'
  )
  const nextBestAction =
    queueFocus.nextAction ??
    titleOrFallback(input.context.revenue.weeklyReview.nextExperiment.title, 'Review the next commercial experiment.')

  return {
    userId: input.userId,
    runId: input.runId,
    summary: `${DIAGNOSTIC_CASH_LANE.offer.title}: ${bestOffer} leads cash. Block cash: ${topBlocker}. Push: ${topOpportunity}. Stop: ${stopThisWeek}.`,
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
