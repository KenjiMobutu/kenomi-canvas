import { describe, expect, it } from 'vitest'
import { evaluateRevenueProofGate } from './revenue-proof-gate'

describe('evaluateRevenueProofGate', () => {
  it('passe seulement quand toute la boucle revenue live est prouvée', () => {
    const result = evaluateRevenueProofGate({
      healthOk: true,
      routeProtected: true,
      paymentsWithCheckout: 1,
      completedPaymentsWithCheckout: 1,
      completedPayments: 1,
      paymentSucceededEvents: 1,
      campaignPublishedEvents: 1,
      campaignSpendEvents: 1,
      pageViewEvents: 1,
      checkoutStartedEvents: 1,
      waitlistSignupEvents: 1,
      highIntentLeadEvents: 1,
      completedFulfillments: 1,
      decisions: 1,
    })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('liste les preuves manquantes avec libellés actionnables', () => {
    const result = evaluateRevenueProofGate({
      healthOk: true,
      routeProtected: true,
      paymentsWithCheckout: 0,
      completedPaymentsWithCheckout: 0,
      completedPayments: 0,
      paymentSucceededEvents: 0,
      campaignPublishedEvents: 0,
      campaignSpendEvents: 0,
      pageViewEvents: 0,
      checkoutStartedEvents: 0,
      waitlistSignupEvents: 0,
      highIntentLeadEvents: 0,
      completedFulfillments: 0,
      decisions: 0,
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      'checkout_missing',
      'completed_public_checkout_missing',
      'completed_payment_missing',
      'payment_succeeded_event_missing',
      'campaign_published_event_missing',
      'campaign_spend_event_missing',
      'page_view_event_missing',
      'checkout_started_event_missing',
      'waitlist_signup_event_missing',
      'high_intent_lead_event_missing',
      'fulfillment_missing',
      'decision_missing',
    ])
  })
})
