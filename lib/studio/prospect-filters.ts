export type ProspectFilters = {
  statusFilter: string
  sourceFilter: string
  bandFilter: string
  tagFilter: string
  searchFilter: string
}

export function readProspectFiltersFromSearch(search: string): ProspectFilters {
  const params = new URLSearchParams(search)
  return {
    statusFilter: params.get('status')?.trim() || 'all',
    sourceFilter: params.get('source')?.trim() || 'all',
    bandFilter: params.get('band')?.trim() || 'all',
    tagFilter: params.get('tag')?.trim() || '',
    searchFilter: params.get('q')?.trim() || '',
  }
}

export function buildProspectHref(input: { source?: string | null; status?: string | null }) {
  const params = new URLSearchParams()
  if (input.source?.trim()) params.set('source', input.source.trim())
  if (input.status?.trim()) params.set('status', input.status.trim())
  const query = params.toString()
  return query ? `/studio/prospects?${query}` : '/studio/prospects'
}
