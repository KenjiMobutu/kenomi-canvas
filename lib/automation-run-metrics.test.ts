import { describe, expect, it } from 'vitest'
import { buildAutomationRunMetrics } from './automation-run-metrics'

describe('automation run metrics', () => {
  it('derives workflow counts from automation_runs rows', () => {
    const metrics = buildAutomationRunMetrics(
      [
        {
          workflow_id: 'wf-1',
          status: 'success',
          duration_ms: 100,
          triggered_at: '2026-05-19T08:00:00.000Z',
        },
        {
          workflow_id: 'wf-1',
          status: 'error',
          duration_ms: 300,
          triggered_at: '2026-05-19T09:00:00.000Z',
        },
      ],
      ['wf-1', 'wf-2']
    )

    expect(metrics['wf-1'].run_count).toBe(2)
    expect(metrics['wf-1'].success_count).toBe(1)
    expect(metrics['wf-1'].avg_duration_ms).toBe(200)
    expect(metrics['wf-1'].last_run_at).toBe('2026-05-19T09:00:00.000Z')
    expect(metrics['wf-2'].run_count).toBe(0)
  })
})
