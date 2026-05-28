export function buildRevenueHref(input?: { focus?: 'cash_7d' | 'cash_30d' | 'blocked' | 'ready_checkouts' }) {
  const params = new URLSearchParams()
  if (input?.focus) params.set('focus', input.focus)
  const query = params.toString()
  return query ? `/studio/revenue?${query}` : '/studio/revenue'
}

export type RevenueFocus = 'cash_7d' | 'cash_30d' | 'blocked' | 'ready_checkouts'

export function readRevenueFocusFromSearch(search: string): RevenueFocus | null {
  const value = new URLSearchParams(search).get('focus')?.trim()
  if (
    value === 'cash_7d' ||
    value === 'cash_30d' ||
    value === 'blocked' ||
    value === 'ready_checkouts'
  ) {
    return value
  }
  return null
}
