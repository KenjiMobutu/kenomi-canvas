import type { PaymentProviderStatus } from './autonomy/types'

export type PublicLandingCta =
  | { kind: 'checkout'; label: string; href: string }
  | { kind: 'waitlist'; label: string; href: '#waitlist' }

export function selectPublicLandingCta(input: {
  heroCta: string
  checkoutUrl?: string | null
  checkoutAvailable?: boolean
  checkoutHref?: string | null
  providerStatus?: PaymentProviderStatus | string | null
}): PublicLandingCta {
  const label = input.heroCta.trim() || 'Rejoindre'
  if (input.checkoutAvailable && input.checkoutHref) {
    return {
      kind: 'checkout',
      label,
      href: input.checkoutHref,
    }
  }

  if (input.checkoutUrl && ['ready', 'pending'].includes(String(input.providerStatus))) {
    return {
      kind: 'checkout',
      label,
      href: input.checkoutUrl,
    }
  }

  return {
    kind: 'waitlist',
    label,
    href: '#waitlist',
  }
}
