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
  topRecommendation: HermesOperatorRecommendationViewRow | null
  topAlert: HermesOperatorAlertViewRow | null
  openRecommendationsCount: number
  openAlertsCount: number
  lastRunEffects: {
    followUpScans: number
    prospectRuns: number
    devopsRuns: number
  }
  recommendations: HermesOperatorRecommendationViewRow[]
  alerts: HermesOperatorAlertViewRow[]
}

function severityScore(severity: HermesOperatorAlertViewRow['severity']) {
  if (severity === 'critical') return 3
  if (severity === 'warn') return 2
  return 1
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

  const lastRunId = input.runs[0]?.id ?? null
  const lastRunAccepted = lastRunId
    ? input.recommendations.filter(
        (item) =>
          item.runId === lastRunId && (item.status === 'accepted' || item.status === 'executed')
      )
    : []

  return {
    currentMode: input.settings.operatorMode,
    notifyInStudio: input.settings.notifyInStudio,
    lastRun: input.runs[0] ?? null,
    topRecommendation: openRecommendations[0] ?? null,
    topAlert: openAlerts[0] ?? null,
    openRecommendationsCount: openRecommendations.length,
    openAlertsCount: openAlerts.length,
    lastRunEffects: {
      followUpScans: lastRunAccepted.filter((item) => item.kind === 'run_follow_up_scan').length,
      prospectRuns: lastRunAccepted.filter((item) => item.kind === 'run_prospect').length,
      devopsRuns: lastRunAccepted.filter((item) => item.kind === 'run_devops').length,
    },
    recommendations: openRecommendations,
    alerts: openAlerts,
  }
}
