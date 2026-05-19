import { describe, expect, it } from 'vitest'
import { aggregateLive } from './analytics-live'

describe('analytics live aggregation', () => {
  it('reports no data when all venture event counters are zero', () => {
    expect(aggregateLive([]).hasData).toBe(false)
  })
})
