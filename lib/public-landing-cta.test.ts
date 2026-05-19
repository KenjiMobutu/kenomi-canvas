import { describe, expect, it } from 'vitest'
import { selectPublicLandingCta } from './public-landing-cta'

describe('selectPublicLandingCta', () => {
  it('uses public checkout endpoint when payment configuration is available', () => {
    expect(
      selectPublicLandingCta({
        heroCta: 'Acheter',
        checkoutAvailable: true,
        checkoutHref: '/api/public/stripe/checkout',
      })
    ).toEqual({
      kind: 'checkout',
      label: 'Acheter',
      href: '/api/public/stripe/checkout',
    })
  })

  it('uses checkout when a ready payment has a checkout URL', () => {
    expect(
      selectPublicLandingCta({
        heroCta: 'Acheter',
        checkoutUrl: 'https://checkout.stripe.com/c/session',
        providerStatus: 'ready',
      })
    ).toEqual({
      kind: 'checkout',
      label: 'Acheter',
      href: 'https://checkout.stripe.com/c/session',
    })
  })

  it('falls back to waitlist when checkout is not ready', () => {
    expect(
      selectPublicLandingCta({
        heroCta: 'Rejoindre',
        checkoutUrl: 'https://checkout.stripe.com/c/session',
        providerStatus: 'approval_required',
      })
    ).toEqual({
      kind: 'waitlist',
      label: 'Rejoindre',
      href: '#waitlist',
    })
  })
})
