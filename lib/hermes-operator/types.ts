import type { ConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'
import type { WeeklyRevenueReview } from '@/lib/revenue/weekly-review'
import type { CashOutcomeSnapshot } from '@/lib/studio/cash-outcomes'

export type HermesOperatorMode = 'observe' | 'recommend' | 'act'

export function normalizeOperatorMode(input: string | null | undefined): HermesOperatorMode {
  if (input === 'recommend' || input === 'act') return input
  return 'observe'
}

export type HermesOperatorInfrastructureSnapshot = {
  status: 'ok' | 'degraded' | 'down' | 'unknown'
  headline: string
  summary: string
  operatorNextStep: string
  checkedAt: string | null
  runtimeCommit: string | null
  servicesCount: number
  openIncidents: number
}

export type HermesOperatorProspectSnapshot = {
  total: number
  awaitingApproval: number
  pendingApprovals: number
  followUpsDue: number
  hotLeads: number
}

export type HermesOperatorAutomationSnapshot = {
  autonomyStatus: 'active' | 'paused'
  pausedReason: string | null
  queuedJobs: number
  runningJobs: number
  failedJobs: number
}

export type HermesOperatorRevenueSnapshot = {
  conversions: ConversionTruthSnapshot
  weeklyReview: WeeklyRevenueReview
  outcomes: CashOutcomeSnapshot
}

export type HermesOperatorContextSnapshot = {
  generatedAt: string
  revenue: HermesOperatorRevenueSnapshot
  prospects: HermesOperatorProspectSnapshot
  automation: HermesOperatorAutomationSnapshot
  infrastructure: HermesOperatorInfrastructureSnapshot
}
