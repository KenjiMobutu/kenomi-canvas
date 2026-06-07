import { describe, expect, it } from 'vitest'
import {
  buildProspectHref,
  buildRateDrilldownHref,
  buildSegmentPushHref,
  buildSourceFocusHref,
  readProspectFiltersFromSearch,
} from './prospect-filters'

describe('readProspectFiltersFromSearch', () => {
  it('reads supported prospect filters from the URL query string', () => {
    expect(
      readProspectFiltersFromSearch(
        '?status=follow_up_due&source=reddit&band=warm&contact=contactable&tag=phase2&q=acme'
      )
    ).toEqual({
      statusFilter: 'follow_up_due',
      sourceFilter: 'reddit',
      bandFilter: 'warm',
      contactFilter: 'contactable',
      tagFilter: 'phase2',
      searchFilter: 'acme',
    })
  })

  it('falls back to all/empty values when filters are missing', () => {
    expect(readProspectFiltersFromSearch('')).toEqual({
      statusFilter: 'all',
      sourceFilter: 'all',
      bandFilter: 'all',
      contactFilter: 'all',
      tagFilter: '',
      searchFilter: '',
    })
  })

  it('builds prospect links with source and optional status filters', () => {
    expect(buildProspectHref({ source: 'reddit' })).toBe('/studio/prospects?source=reddit')
    expect(buildProspectHref({ source: 'linkedin', status: 'awaiting_approval' })).toBe(
      '/studio/prospects?source=linkedin&status=awaiting_approval'
    )
    expect(buildProspectHref({ source: 'linkedin', band: 'warm' })).toBe(
      '/studio/prospects?source=linkedin&band=warm'
    )
  })

  it('builds rate drilldown links for reply and win queues', () => {
    expect(buildRateDrilldownHref('reply')).toBe('/studio/prospects?status=follow_up_due')
    expect(buildRateDrilldownHref('win')).toBe('/studio/prospects?status=replied')
  })

  it('builds push links for the best source-band segment', () => {
    expect(buildSegmentPushHref({ source: 'reddit', band: 'hot' })).toBe(
      '/studio/prospects?source=reddit&band=hot'
    )
  })

  it('builds focus links for the best source', () => {
    expect(buildSourceFocusHref({ source: 'linkedin' })).toBe('/studio/prospects?source=linkedin')
  })
})
