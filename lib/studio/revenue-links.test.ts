import { describe, expect, it } from 'vitest'
import { buildRevenueHref } from './revenue-links'

describe('buildRevenueHref', () => {
  it('builds the default revenue link', () => {
    expect(buildRevenueHref()).toBe('/studio/revenue')
  })

  it('builds a revenue link with a focus query', () => {
    expect(buildRevenueHref({ focus: 'cash_7d' })).toBe('/studio/revenue?focus=cash_7d')
    expect(buildRevenueHref({ focus: 'cash_30d' })).toBe('/studio/revenue?focus=cash_30d')
  })
})
