export type StudioMetricSourceTable =
  | 'agent_runs'
  | 'automation_runs'
  | 'autonomy_jobs'
  | 'autonomy_actions'
  | 'campaign_drafts'
  | 'human_approvals'
  | 'landing_pages'
  | 'payments'
  | 'services_health'
  | 'venture_events'
  | 'ventures'
  | string

export interface StudioMetricContract {
  id: string
  page: string
  label: string
  sourceTable: StudioMetricSourceTable
  userScopedBy: string
  window: string
  fallback: string
  repairHref?: string
}

export interface StudioMetricContractIssue {
  id: string
  message: string
}

export interface StudioMetricReading {
  metricId: string
  page: string
  label: string
  sourceTable: StudioMetricSourceTable
  userScopedBy: string
  filterKey: string
  window: string
  value: number
}

export interface StudioMetricReadingIssue {
  key: string
  message: string
  readings: Array<{
    page: string
    label: string
    value: number
  }>
}

export const STUDIO_METRIC_CONTRACTS: StudioMetricContract[] = [
  {
    id: 'agents.runs.lifetime',
    page: '/studio/agents',
    label: 'Agent lifetime runs',
    sourceTable: 'agent_runs',
    userScopedBy: 'user_id',
    window: 'lifetime',
    fallback: 'zero_when_empty',
    repairHref: '/studio/agents',
  },
  {
    id: 'agents.runs.24h',
    page: '/studio/agents',
    label: 'Agent 24h activity',
    sourceTable: 'agent_runs',
    userScopedBy: 'user_id',
    window: '24h',
    fallback: 'zero_when_empty',
    repairHref: '/studio/agents',
  },
  {
    id: 'agents.autonomy.jobs',
    page: '/studio/agents',
    label: 'Autonomy jobs',
    sourceTable: 'autonomy_jobs',
    userScopedBy: 'user_id',
    window: 'latest',
    fallback: 'empty_list',
    repairHref: '/studio/agents',
  },
  {
    id: 'agents.autonomy.actions',
    page: '/studio/agents',
    label: 'Autonomy actions',
    sourceTable: 'autonomy_actions',
    userScopedBy: 'user_id',
    window: 'latest',
    fallback: 'empty_list',
    repairHref: '/studio/agents',
  },
  {
    id: 'agents.autonomy.approvals',
    page: '/studio/agents',
    label: 'Human approvals',
    sourceTable: 'human_approvals',
    userScopedBy: 'user_id',
    window: 'latest',
    fallback: 'empty_list',
    repairHref: '/studio/agents',
  },
  {
    id: 'analytics.venture.visits',
    page: '/studio/analytics',
    label: 'Visits',
    sourceTable: 'venture_events',
    userScopedBy: 'user_id',
    window: 'all_visible_events',
    fallback: 'zero_when_empty',
    repairHref: '/studio/analytics',
  },
  {
    id: 'analytics.venture.revenue',
    page: '/studio/analytics',
    label: 'Revenue',
    sourceTable: 'venture_events',
    userScopedBy: 'user_id',
    window: 'all_visible_events',
    fallback: 'zero_when_empty',
    repairHref: '/studio/analytics',
  },
  {
    id: 'analytics.llm.cost',
    page: '/studio/analytics',
    label: 'LLM cost',
    sourceTable: 'agent_runs',
    userScopedBy: 'user_id',
    window: 'all_visible_runs',
    fallback: 'partial_when_pricing_missing',
    repairHref: '/studio/analytics',
  },
  {
    id: 'automations.runs',
    page: '/studio/automations',
    label: 'Automation runs',
    sourceTable: 'automation_runs',
    userScopedBy: 'user_id',
    window: 'latest',
    fallback: 'zero_when_empty',
    repairHref: '/studio/automations',
  },
  {
    id: 'marketing.drafts',
    page: '/studio/marketing',
    label: 'Campaign drafts',
    sourceTable: 'campaign_drafts',
    userScopedBy: 'user_id',
    window: 'latest',
    fallback: 'empty_list',
    repairHref: '/studio/marketing',
  },
  {
    id: 'ventures.readiness',
    page: '/studio/ventures',
    label: 'Venture readiness',
    sourceTable: 'ventures',
    userScopedBy: 'user_id',
    window: 'current_state',
    fallback: 'repair_required',
    repairHref: '/studio/ventures',
  },
  {
    id: 'ventures.landing.readiness',
    page: '/studio/ventures',
    label: 'Landing readiness',
    sourceTable: 'landing_pages',
    userScopedBy: 'venture_owner_user_id',
    window: 'current_state',
    fallback: 'repair_required',
    repairHref: '/studio/ventures',
  },
  {
    id: 'cockpit.ops.health',
    page: '/studio',
    label: 'Ops health',
    sourceTable: 'services_health',
    userScopedBy: 'allowed_studio_user',
    window: 'latest',
    fallback: 'degraded_when_unavailable',
    repairHref: '/studio/infrastructure',
  },
]

const REQUIRED_FIELDS: Array<keyof StudioMetricContract> = [
  'sourceTable',
  'userScopedBy',
  'window',
  'fallback',
]

export function validateMetricContracts(
  contracts: StudioMetricContract[] = STUDIO_METRIC_CONTRACTS
): StudioMetricContractIssue[] {
  return contracts.flatMap((contract) =>
    REQUIRED_FIELDS.flatMap((field) => {
      const value = contract[field]
      return typeof value === 'string' && value.trim().length > 0
        ? []
        : [{ id: contract.id, message: `missing ${field}` }]
    })
  )
}

export function buildMetricReadingKey(reading: StudioMetricReading): string {
  return [
    reading.metricId,
    reading.sourceTable,
    reading.userScopedBy,
    reading.filterKey,
    reading.window,
  ].join('|')
}

export function compareMetricReadings(readings: StudioMetricReading[]): StudioMetricReadingIssue[] {
  const byKey = new Map<string, StudioMetricReading[]>()

  readings.forEach((reading) => {
    const key = buildMetricReadingKey(reading)
    const group = byKey.get(key) ?? []
    group.push(reading)
    byKey.set(key, group)
  })

  return Array.from(byKey.entries()).flatMap(([key, group]) => {
    const uniqueValues = Array.from(new Set(group.map((reading) => reading.value)))
    if (uniqueValues.length <= 1) return []

    const first = uniqueValues[0]
    const second = uniqueValues[1]
    return [
      {
        key,
        message: `${group[0].metricId} has conflicting values for the same source/filter/window: ${first} vs ${second}`,
        readings: group.map((reading) => ({
          page: reading.page,
          label: reading.label,
          value: reading.value,
        })),
      },
    ]
  })
}
