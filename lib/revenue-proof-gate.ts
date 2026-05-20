export interface RevenueProofGateInput {
  healthOk: boolean
  routeProtected: boolean
  paymentsWithCheckout: number
  completedPayments: number
  paymentSucceededEvents: number
  campaignPublishedEvents: number
  campaignSpendEvents: number
  pageViewEvents: number
  waitlistSignupEvents: number
  decisions: number
}

export interface RevenueProofGateResult {
  ok: boolean
  failures: string[]
}

function missing(count: number) {
  return !Number.isFinite(count) || count <= 0
}

export function evaluateRevenueProofGate(input: RevenueProofGateInput): RevenueProofGateResult {
  const failures: string[] = []

  if (!input.healthOk) failures.push('health_not_ok')
  if (!input.routeProtected) failures.push('revenue_proof_route_not_protected')
  if (missing(input.paymentsWithCheckout)) failures.push('checkout_missing')
  if (missing(input.completedPayments)) failures.push('completed_payment_missing')
  if (missing(input.paymentSucceededEvents)) failures.push('payment_succeeded_event_missing')
  if (missing(input.campaignPublishedEvents)) failures.push('campaign_published_event_missing')
  if (missing(input.campaignSpendEvents)) failures.push('campaign_spend_event_missing')
  if (missing(input.pageViewEvents)) failures.push('page_view_event_missing')
  if (missing(input.waitlistSignupEvents)) failures.push('waitlist_signup_event_missing')
  if (missing(input.decisions)) failures.push('decision_missing')

  return { ok: failures.length === 0, failures }
}
