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
      ],
      recommendations: [
        {
          id: 'rec-1',
          kind: 'run_follow_up_scan',
          priority: 90,
          title: 'Push follow-ups',
          detail: 'Replies exist but no wins.',
          actionType: 'run_agent',
          riskLevel: 'low',
          status: 'open',
          createdAt: '2026-05-28T10:00:00.000Z',
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
    expect(view.topRecommendation?.title).toBe('Push follow-ups')
    expect(view.openAlertsCount).toBe(1)
  })
})
