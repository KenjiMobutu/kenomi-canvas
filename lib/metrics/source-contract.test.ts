import { describe, expect, it } from 'vitest'
import { buildMetricSource, deriveMetricSourceStatus } from './source-contract'

describe('metric source contract', () => {
  it('marks a real source when rows exist and values are complete', () => {
    expect(
      buildMetricSource({
        source: 'venture_events',
        window: 'all_visible_events',
        rowCount: 4,
        partial: false,
        checkedAt: '2026-05-19T10:00:00.000Z',
      })
    ).toEqual({
      source: 'venture_events',
      window: 'all_visible_events',
      rowCount: 4,
      status: 'real',
      checkedAt: '2026-05-19T10:00:00.000Z',
    })
  })

  it('separates empty, partial, and unavailable sources', () => {
    expect(deriveMetricSourceStatus({ rowCount: 0 })).toBe('empty')
    expect(deriveMetricSourceStatus({ rowCount: 4, partial: true })).toBe('partial')
    expect(deriveMetricSourceStatus({ unavailable: true })).toBe('unavailable')
  })
})
