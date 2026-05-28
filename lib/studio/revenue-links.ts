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

export function formatRevenueFocusLabel(focus: RevenueFocus): string {
  if (focus === 'cash_7d') return 'Cash 7d'
  if (focus === 'cash_30d') return 'Cash 30d'
  if (focus === 'blocked') return 'Blocked revenue'
  return 'Ready checkouts'
}
