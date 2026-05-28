import { describe, expect, it } from 'vitest'
import { buildWeeklyReviewHref } from './weekly-review-links'

describe('buildWeeklyReviewHref', () => {
  it('builds a source drilldown for the weekly best source', () => {
    expect(
      buildWeeklyReviewHref('best_source', {
        source: 'linkedin',
      })
    ).toBe('/studio/prospects?source=linkedin')
  })

  it('builds a segment drilldown for the weekly best segment', () => {
    expect(
      buildWeeklyReviewHref('best_segment', {
        source: 'reddit',
        band: 'hot',
      })
    ).toBe('/studio/prospects?source=reddit&band=hot')
  })

  it('builds revenue drilldowns for offer and angle review cards', () => {
    expect(buildWeeklyReviewHref('best_offer')).toBe('/studio/revenue?focus=cash_30d')
    expect(buildWeeklyReviewHref('best_angle')).toBe('/studio/revenue?focus=cash_30d')
  })

  it('builds actionable drilldowns for leak and next experiment', () => {
    expect(
      buildWeeklyReviewHref('main_leak', {
        stageKey: 'contact_to_reply',
      })
    ).toBe('/studio/prospects?status=sent')

    expect(
      buildWeeklyReviewHref('next_experiment', {
        focus: 'segment',
        source: 'reddit',
        band: 'warm',
      })
    ).toBe('/studio/prospects?source=reddit&band=warm')
  })
})
