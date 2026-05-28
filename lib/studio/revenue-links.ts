export function buildRevenueHref(input?: { focus?: 'cash_7d' | 'cash_30d' | 'blocked' | 'ready_checkouts' }) {
  const params = new URLSearchParams()
  if (input?.focus) params.set('focus', input.focus)
  const query = params.toString()
  return query ? `/studio/revenue?${query}` : '/studio/revenue'
}
