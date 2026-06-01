export type HermesOperatorRunViewRow = {
  id: string
  mode: 'observe' | 'recommend' | 'act'
  status: 'completed' | 'failed' | 'skipped'
  model: string
  summary: string
  alertsCount: number
  enqueuedJobsCount: number
  executedActionsCount: number
  createdAt: string
  lastError: string | null
  snapshot: {
    prospectsTotal: number
    pendingApprovals: number
    followUpsDue: number
    queuedJobs: number
    failedJobs: number
    replied: number
    paid: number
  } | null
}

export type HermesOperatorRecommendationViewRow = {
  id: string
  runId: string
  kind: string
  priority: number
  title: string
  detail: string
  actionType: string | null
  riskLevel: string | null
  status: string
  createdAt: string
}

export type HermesOperatorAlertViewRow = {
  id: string
  severity: 'info' | 'warn' | 'critical'
  category: string
  headline: string
  detail: string
  status: string
  channel: string
  createdAt: string
}

export type HermesOperatorSettingsViewRow = {
  operatorMode: 'observe' | 'recommend' | 'act'
  notifyInStudio: boolean
}

export type HermesOperatorView = {
  currentMode: 'observe' | 'recommend' | 'act'
  notifyInStudio: boolean
  lastRun: HermesOperatorRunViewRow | null
  recentRuns: HermesOperatorRunViewRow[]
  topRecommendation: HermesOperatorRecommendationViewRow | null
  topAlert: HermesOperatorAlertViewRow | null
  topBusinessAlert: HermesOperatorAlertViewRow | null
  topExecutionAlert: HermesOperatorAlertViewRow | null
  openRecommendationsCount: number
  openAlertsCount: number
  openBusinessAlertsCount: number
  openExecutionAlertsCount: number
  lastRunDelta: {
    pendingApprovals: number
    followUpsDue: number
    queuedJobs: number
    failedJobs: number
    replied: number
    paid: number
  } | null
  lastRunEffects: {
    followUpScans: number
    prospectRuns: number
    devopsRuns: number
  }
  recommendations: HermesOperatorRecommendationViewRow[]
  alerts: HermesOperatorAlertViewRow[]
  businessAlerts: HermesOperatorAlertViewRow[]
  executionAlerts: HermesOperatorAlertViewRow[]
}

function severityScore(severity: HermesOperatorAlertViewRow['severity']) {
  if (severity === 'critical') return 3
  if (severity === 'warn') return 2
  return 1
}

function diffMetric(current: number, previous: number): number {
  return current - previous
}

function isBusinessAlert(alert: HermesOperatorAlertViewRow): boolean {
  return alert.category.startsWith('business_')
}

export function buildHermesOperatorView(input: {
  settings: HermesOperatorSettingsViewRow
  runs: HermesOperatorRunViewRow[]
  recommendations: HermesOperatorRecommendationViewRow[]
  alerts: HermesOperatorAlertViewRow[]
}): HermesOperatorView {
  const openRecommendations = input.recommendations
    .filter((item) => item.status === 'open' || item.status === 'accepted')
    .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
  const openAlerts = input.alerts
    .filter((item) => item.status === 'open' || item.status === 'sent')
    .sort(
      (a, b) =>
        severityScore(b.severity) - severityScore(a.severity) ||
        b.createdAt.localeCompare(a.createdAt)
    )
  const businessAlerts = openAlerts.filter(isBusinessAlert)
  const executionAlerts = openAlerts.filter((item) => !isBusinessAlert(item))

  const lastRunId = input.runs[0]?.id ?? null
  const currentRun = input.runs[0] ?? null
  const previousRun = input.runs[1] ?? null
  const lastRunAccepted = lastRunId
    ? input.recommendations.filter(
        (item) =>
          item.runId === lastRunId && (item.status === 'accepted' || item.status === 'executed')
      )
    : []

  return {
    currentMode: input.settings.operatorMode,
    notifyInStudio: input.settings.notifyInStudio,
    lastRun: currentRun,
    recentRuns: input.runs.slice(0, 5),
    topRecommendation: openRecommendations[0] ?? null,
    topAlert: businessAlerts[0] ?? executionAlerts[0] ?? null,
    topBusinessAlert: businessAlerts[0] ?? null,
    topExecutionAlert: executionAlerts[0] ?? null,
    openRecommendationsCount: openRecommendations.length,
    openAlertsCount: openAlerts.length,
    openBusinessAlertsCount: businessAlerts.length,
    openExecutionAlertsCount: executionAlerts.length,
    lastRunDelta:
      currentRun?.snapshot && previousRun?.snapshot
        ? {
            pendingApprovals: diffMetric(
              currentRun.snapshot.pendingApprovals,
              previousRun.snapshot.pendingApprovals
            ),
            followUpsDue: diffMetric(
              currentRun.snapshot.followUpsDue,
              previousRun.snapshot.followUpsDue
            ),
            queuedJobs: diffMetric(currentRun.snapshot.queuedJobs, previousRun.snapshot.queuedJobs),
            failedJobs: diffMetric(currentRun.snapshot.failedJobs, previousRun.snapshot.failedJobs),
            replied: diffMetric(currentRun.snapshot.replied, previousRun.snapshot.replied),
            paid: diffMetric(currentRun.snapshot.paid, previousRun.snapshot.paid),
          }
        : null,
    lastRunEffects: {
      followUpScans: lastRunAccepted.filter((item) => item.kind === 'run_follow_up_scan').length,
      prospectRuns: lastRunAccepted.filter((item) => item.kind === 'run_prospect').length,
      devopsRuns: lastRunAccepted.filter((item) => item.kind === 'run_devops').length,
    },
    recommendations: openRecommendations,
    alerts: openAlerts,
    businessAlerts,
    executionAlerts,
  }
}
