import { describe, expect, it } from 'vitest'
import { buildHermesOperatorView } from '@/lib/studio/hermes-operator-view'

describe('buildHermesOperatorView', () => {
  it('builds a compact Hermes operator view from runs, recommendations, and alerts', () => {
    const view = buildHermesOperatorView({
      settings: {
        operatorMode: 'observe',
        notifyInStudio: true,
      },
      runs: [
        {
          id: 'run-1',
          mode: 'observe',
          status: 'completed',
          model: 'hermes3:8b',
          summary: 'Cash is blocked on reddit/hot.',
          alertsCount: 1,
          enqueuedJobsCount: 0,
          executedActionsCount: 0,
          createdAt: '2026-05-28T10:00:00.000Z',
          lastError: null,
        },
        {
          id: 'run-0',
          mode: 'recommend',
          status: 'failed',
          model: 'hermes3:8b',
          summary: 'Older failed run.',
          alertsCount: 2,
          enqueuedJobsCount: 1,
          executedActionsCount: 1,
          createdAt: '2026-05-28T09:00:00.000Z',
          lastError: 'network',
        },
      ],
      recommendations: [
        {
          id: 'rec-1',
          runId: 'run-1',
          kind: 'run_follow_up_scan',
          priority: 90,
          title: 'Push follow-ups',
          detail: 'Replies exist but no wins.',
          actionType: 'run_agent',
          riskLevel: 'low',
          status: 'accepted',
          createdAt: '2026-05-28T10:00:00.000Z',
        },
        {
          id: 'rec-2',
          runId: 'run-1',
          kind: 'run_prospect',
          priority: 95,
          title: 'Run prospect',
          detail: 'Push one more prospect pass.',
          actionType: 'run_agent',
          riskLevel: 'low',
          status: 'accepted',
          createdAt: '2026-05-28T10:01:00.000Z',
        },
        {
          id: 'rec-3',
          runId: 'run-1',
          kind: 'run_devops',
          priority: 80,
          title: 'Run devops',
          detail: 'Check infra.',
          actionType: 'run_agent',
          riskLevel: 'low',
          status: 'accepted',
          createdAt: '2026-05-28T10:02:00.000Z',
        },
        {
          id: 'rec-4',
          runId: 'run-old',
          kind: 'run_prospect',
          priority: 60,
          title: 'Older run prospect',
          detail: 'Should not count in the last run.',
          actionType: 'run_agent',
          riskLevel: 'low',
          status: 'accepted',
          createdAt: '2026-05-28T09:00:00.000Z',
        },
      ],
      alerts: [
        {
          id: 'alert-1',
          severity: 'warn',
          category: 'cash_blocker',
          headline: 'Replies without close',
          detail: 'reddit/hot is stalled.',
          status: 'open',
          channel: 'studio',
          createdAt: '2026-05-28T10:00:00.000Z',
        },
      ],
    })

    expect(view.currentMode).toBe('observe')
    expect(view.lastRun?.mode).toBe('observe')
    expect(view.recentRuns).toHaveLength(2)
    expect(view.topRecommendation?.title).toBe('Run prospect')
    expect(view.openAlertsCount).toBe(1)
    expect(view.lastRunEffects).toEqual({
      followUpScans: 1,
      prospectRuns: 1,
      devopsRuns: 1,
    })
  })
})
