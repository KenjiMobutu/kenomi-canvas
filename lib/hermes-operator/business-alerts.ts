import type { HermesOperatorAlert } from '@/lib/hermes-operator/engine'
import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'

type SnapshotLike = Record<string, any> | null

function numberOf(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function severityForDelta(delta: number, warnAt: number, criticalAt: number): HermesOperatorAlert['severity'] | null {
  if (delta >= criticalAt) return 'critical'
  if (delta >= warnAt) return 'warn'
  return null
}

function buildAlert(input: {
  severity: HermesOperatorAlert['severity']
  category: string
  dedupeKey: string
  headline: string
  detail: string
  payload?: Record<string, unknown>
}): HermesOperatorAlert {
  return {
    severity: input.severity,
    category: input.category,
    dedupeKey: input.dedupeKey,
    headline: input.headline,
    detail: input.detail,
    channel: 'studio',
    payload: input.payload ?? {},
  }
}

export function buildHermesBusinessAlerts(input: {
  context: HermesOperatorContextSnapshot
  previousSnapshot?: SnapshotLike
  now?: Date
}): HermesOperatorAlert[] {
  const previous = input.previousSnapshot ?? null
  const alerts: HermesOperatorAlert[] = []

  const currentFollowUps = input.context.prospects.followUpsDue
  const previousFollowUps = numberOf(previous?.prospects?.followUpsDue)
  const followUpsDelta = currentFollowUps - previousFollowUps
  const followUpsSeverity =
    severityForDelta(followUpsDelta, 3, 6) ??
    (currentFollowUps >= 8 ? 'warn' : null)
  if (followUpsSeverity) {
    alerts.push(
      buildAlert({
        severity: followUpsSeverity,
        category: 'business_followups_due_spike',
        dedupeKey: 'business_followups_due_spike',
        headline: 'Follow-ups due are piling up',
        detail: `${currentFollowUps} follow-ups due${followUpsDelta > 0 ? ` · +${followUpsDelta} since last run` : ''}.`,
        payload: { current: currentFollowUps, delta: followUpsDelta },
      })
    )
  }

  const winningSource = input.context.revenue.conversions.sourceCollectsFastest?.source
  if (winningSource) {
    const currentRate =
      input.context.revenue.outcomes.sourceBreakdown.find((item) => item.source === winningSource)?.replyRate ?? 0
    const previousRate =
      numberOf(
        previous?.revenue?.outcomes?.sourceBreakdown?.find?.((item: any) => item?.source === winningSource)?.replyRate
      )
    const rateDrop = previousRate - currentRate
    const sourceSeverity = severityForDelta(rateDrop, 10, 20)
    if (sourceSeverity) {
      alerts.push(
        buildAlert({
          severity: sourceSeverity,
          category: 'business_reply_rate_drop',
          dedupeKey: `business_reply_rate_drop:${winningSource}`,
          headline: `${winningSource} reply rate is falling`,
          detail: `Winning source ${winningSource} dropped from ${previousRate}% to ${currentRate}% replies.`,
          payload: { source: winningSource, previousRate, currentRate },
        })
      )
    }
  }

  const cashDelta7d = numberOf(input.context.revenue.outcomes.delta7d.cashEur)
  if (cashDelta7d < 0) {
    alerts.push(
      buildAlert({
        severity: cashDelta7d <= -1000 ? 'critical' : 'warn',
        category: 'business_paid_cash_drop',
        dedupeKey: 'business_paid_cash_drop',
        headline: 'Paid cash is down week over week',
        detail: `Cash 7d moved by ${cashDelta7d}€ against the previous 7d window.`,
        payload: { cashDelta7d },
      })
    )
  }

  const currentBlockedRevenue = numberOf(input.context.revenue.loop.blockedRevenueEur)
  const previousBlockedRevenue = numberOf(previous?.revenue?.loop?.blockedRevenueEur)
  const blockedRevenueDelta = currentBlockedRevenue - previousBlockedRevenue
  const blockedSeverity =
    severityForDelta(blockedRevenueDelta, 250, 750) ??
    (currentBlockedRevenue >= 1000 ? 'warn' : null)
  if (blockedSeverity) {
    alerts.push(
      buildAlert({
        severity: blockedSeverity,
        category: 'business_blocked_revenue_increase',
        dedupeKey: 'business_blocked_revenue_increase',
        headline: 'Blocked revenue is climbing',
        detail: `${currentBlockedRevenue}€ blocked${blockedRevenueDelta > 0 ? ` · +${blockedRevenueDelta}€ since last run` : ''}.`,
        payload: { currentBlockedRevenue, blockedRevenueDelta },
      })
    )
  }

  const currentBestSegment = input.context.revenue.conversions.segmentRepliesNoPay
  const previousBestSegment = previous?.revenue?.conversions?.bestSegmentToPay
  if (
    currentBestSegment &&
    previousBestSegment &&
    currentBestSegment.source === previousBestSegment.source &&
    currentBestSegment.band === previousBestSegment.band
  ) {
    alerts.push(
      buildAlert({
        severity: 'warn',
        category: 'business_best_segment_stall',
        dedupeKey: `business_best_segment_stall:${currentBestSegment.source}:${currentBestSegment.band}`,
        headline: `${currentBestSegment.source}/${currentBestSegment.band} is stalling`,
        detail: `The segment that used to collect cash now has ${currentBestSegment.replied} replies and ${currentBestSegment.paidCount} paid.`,
        payload: {
          source: currentBestSegment.source,
          band: currentBestSegment.band,
          replied: currentBestSegment.replied,
          paidCount: currentBestSegment.paidCount,
        },
      })
    )
  }

  const failedJobs = input.context.automation.failedJobs
  const previousFailedJobs = numberOf(previous?.automation?.failedJobs)
  const failedJobsDelta = failedJobs - previousFailedJobs
  const failedSeverity =
    severityForDelta(failedJobsDelta, 1, 3) ??
    (failedJobs > 0 ? 'warn' : null)
  if (failedSeverity) {
    alerts.push(
      buildAlert({
        severity: failedSeverity,
        category: 'execution_failed_jobs_increase',
        dedupeKey: 'execution_failed_jobs_increase',
        headline: 'Operator job failures need attention',
        detail: `${failedJobs} failed jobs${failedJobsDelta > 0 ? ` · +${failedJobsDelta} since last run` : ''}.`,
        payload: { failedJobs, failedJobsDelta },
      })
    )
  }

  return alerts
}
