import { describe, expect, it } from 'vitest'
import { buildProspectHref, readProspectFiltersFromSearch } from './prospect-filters'

describe('readProspectFiltersFromSearch', () => {
  it('reads supported prospect filters from the URL query string', () => {
    expect(
      readProspectFiltersFromSearch(
        '?status=follow_up_due&source=reddit&band=warm&tag=phase2&q=acme'
      )
    ).toEqual({
      statusFilter: 'follow_up_due',
      sourceFilter: 'reddit',
      bandFilter: 'warm',
      tagFilter: 'phase2',
      searchFilter: 'acme',
    })
  })

  it('falls back to all/empty values when filters are missing', () => {
    expect(readProspectFiltersFromSearch('')).toEqual({
      statusFilter: 'all',
      sourceFilter: 'all',
      bandFilter: 'all',
      tagFilter: '',
      searchFilter: '',
    })
  })

  it('builds prospect links with source and optional status filters', () => {
    expect(buildProspectHref({ source: 'reddit' })).toBe('/studio/prospects?source=reddit')
    expect(buildProspectHref({ source: 'linkedin', status: 'awaiting_approval' })).toBe(
      '/studio/prospects?source=linkedin&status=awaiting_approval'
    )
  })
})
