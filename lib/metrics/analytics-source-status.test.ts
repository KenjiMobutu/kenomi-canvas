import { describe, expect, it } from 'vitest'
import { aggregateLive } from './analytics-live'

describe('analytics live aggregation', () => {
  it('reports no data when all venture event counters are zero', () => {
    expect(aggregateLive([]).hasData).toBe(false)
  })

  it('carries source status with the aggregate', () => {
    expect(
      aggregateLive([], {
        source: 'venture_events',
        window: 'all_visible_events',
        rowCount: 0,
        status: 'empty',
        checkedAt: '2026-05-19T10:00:00.000Z',
      }).source
    ).toMatchObject({
      source: 'venture_events',
      status: 'empty',
    })
  })
})
