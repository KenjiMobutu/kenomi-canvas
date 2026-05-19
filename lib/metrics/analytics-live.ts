import type { MetricSourceContract } from './source-contract'

export interface LiveVentureMetrics {
  ventureId: string
  name: string
  slug: string
  metrics: {
    visits: number
    signups: number
    signupRate: number
    revenueCents: number
    spendCents: number
    profitCents: number
    roi: number
  }
}

export interface LiveAggregate {
  totalVisits: number
  totalSignups: number
  signupRate: number
  revenueEur: number
  spendEur: number
  profitEur: number
  roi: number
  ventureCount: number
  hasData: boolean
  source?: MetricSourceContract
}

export function aggregateLive(
  snapshots: LiveVentureMetrics[],
  source?: MetricSourceContract
): LiveAggregate {
  const totalVisits = snapshots.reduce((sum, venture) => sum + venture.metrics.visits, 0)
  const totalSignups = snapshots.reduce((sum, venture) => sum + venture.metrics.signups, 0)
  const revenueCents = snapshots.reduce((sum, venture) => sum + venture.metrics.revenueCents, 0)
  const spendCents = snapshots.reduce((sum, venture) => sum + venture.metrics.spendCents, 0)
  const profitCents = revenueCents - spendCents

  return {
    totalVisits,
    totalSignups,
    signupRate: totalVisits > 0 ? totalSignups / totalVisits : 0,
    revenueEur: revenueCents / 100,
    spendEur: spendCents / 100,
    profitEur: profitCents / 100,
    roi: spendCents > 0 ? profitCents / spendCents : 0,
    ventureCount: snapshots.length,
    hasData: totalVisits + totalSignups + revenueCents + spendCents > 0,
    source,
  }
}
