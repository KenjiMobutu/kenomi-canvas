import { describe, expect, it } from 'vitest'
import {
  compareMetricReadings,
  validateMetricContracts,
  type StudioMetricContract,
} from './studio-data-consistency'

describe('studio data consistency', () => {
  it('rejects critical metrics without source, user scope, window, and fallback', () => {
    const contracts = [
      {
        id: 'agents.scout.runs',
        page: '/studio/agents',
        label: 'Scout runs',
        sourceTable: 'agent_runs',
        userScopedBy: 'user_id',
        window: 'lifetime',
        fallback: 'zero_when_empty',
      },
      {
        id: 'analytics.revenue',
        page: '/studio/analytics',
        label: 'Revenue',
        sourceTable: '',
        userScopedBy: '',
        window: '',
        fallback: '',
      },
    ] as StudioMetricContract[]

    expect(validateMetricContracts(contracts)).toEqual([
      {
        id: 'analytics.revenue',
        message: 'missing sourceTable',
      },
      {
        id: 'analytics.revenue',
        message: 'missing userScopedBy',
      },
      {
        id: 'analytics.revenue',
        message: 'missing window',
      },
      {
        id: 'analytics.revenue',
        message: 'missing fallback',
      },
    ])
  })

  it('flags mismatched readings for the same declared metric source', () => {
    const issues = compareMetricReadings([
      {
        metricId: 'agents.scout.runs',
        page: '/studio/agents',
        label: 'Scout card runs',
        sourceTable: 'agent_runs',
        userScopedBy: 'user_id',
        filterKey: 'agent_id=scout',
        window: 'lifetime',
        value: 43,
      },
      {
        metricId: 'agents.scout.runs',
        page: '/studio',
        label: 'Cockpit Scout runs',
        sourceTable: 'agent_runs',
        userScopedBy: 'user_id',
        filterKey: 'agent_id=scout',
        window: 'lifetime',
        value: 4,
      },
      {
        metricId: 'agents.scout.runs_24h',
        page: '/studio/agents',
        label: 'Scout 24h runs',
        sourceTable: 'agent_runs',
        userScopedBy: 'user_id',
        filterKey: 'agent_id=scout',
        window: '24h',
        value: 4,
      },
    ])

    expect(issues).toEqual([
      {
        key: 'agents.scout.runs|agent_runs|user_id|agent_id=scout|lifetime',
        message:
          'agents.scout.runs has conflicting values for the same source/filter/window: 43 vs 4',
        readings: [
          { page: '/studio/agents', label: 'Scout card runs', value: 43 },
          { page: '/studio', label: 'Cockpit Scout runs', value: 4 },
        ],
      },
    ])
  })
})
