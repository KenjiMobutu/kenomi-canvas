function missing(count) {
  return !Number.isFinite(count) || count <= 0
}

export function evalRevenueAttributionGate(input) {
  const failures = []

  if (!input.healthOk) failures.push('health_not_ok')
  if (!input.attributionProtected) failures.push('revenue_attribution_not_protected')
  if (missing(input.attributionRows)) failures.push('payment_attributions_missing')
  if (missing(input.paidAttributionRows)) failures.push('paid_attributions_missing')
  if (missing(input.knownAttributionRows)) failures.push('known_attributions_missing')
  if (missing(input.attributedCashCents)) failures.push('attributed_cash_missing')

  return { ok: failures.length === 0, failures }
}
