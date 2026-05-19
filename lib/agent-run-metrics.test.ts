import { describe, expect, it } from 'vitest'
import { buildAgentActivitySeries, buildAgentRunMetrics } from './agent-run-metrics'

describe('agent run metrics', () => {
  it('derives displayed counts from agent_runs rows', () => {
    const metrics = buildAgentRunMetrics(
      [
        {
          agent_id: 'scout',
          duration_ms: 1200,
          created_at: '2026-05-19T08:00:00.000Z',
        },
        {
          agent_id: 'scout',
          duration_ms: 2200,
          created_at: '2026-05-17T08:00:00.000Z',
          fallback_triggered: true,
        },
      ],
      ['scout', 'builder'],
      new Date('2026-05-19T10:00:00.000Z')
    )

    expect(metrics.scout.run_count).toBe(2)
    expect(metrics.scout.runs_24h).toBe(1)
    expect(metrics.scout.avg_duration_ms).toBe(1700)
    expect(metrics.scout.fallback_count).toBe(1)
    expect(metrics.scout.last_run_at).toBe('2026-05-19T08:00:00.000Z')
    expect(metrics.builder.run_count).toBe(0)
  })

  it('builds a stable empty activity series', () => {
    expect(buildAgentActivitySeries([], 'scout')).toEqual([0, 0])
  })

  it('keeps 24h runs separate from lifetime runs', () => {
    const metrics = buildAgentRunMetrics(
      [
        { agent_id: 'scout', duration_ms: 1000, created_at: '2026-05-19T09:00:00.000Z' },
        { agent_id: 'scout', duration_ms: 1000, created_at: '2026-05-17T09:00:00.000Z' },
      ],
      ['scout'],
      new Date('2026-05-19T10:00:00.000Z')
    )

    expect(metrics.scout.run_count).toBe(2)
    expect(metrics.scout.runs_24h).toBe(1)
  })
})
