import { describe, expect, it } from 'vitest'
import { averageDaysFromMs, averageHoursFromMs, percentage } from '@/lib/revenue/funnel-metrics'

describe('revenue funnel metrics', () => {
  it('computes percentages safely', () => {
    expect(percentage(2, 4)).toBe(50)
    expect(percentage(0, 0)).toBe(0)
  })

  it('computes average hour/day durations', () => {
    expect(averageHoursFromMs([2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000])).toBe(3)
    expect(averageDaysFromMs([24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000])).toBe(2)
  })
})
