import { describe, expect, it } from 'vitest'
import { getProspectDeliveryStatusLabel } from '@/lib/studio/prospect-delivery-status'

describe('getProspectDeliveryStatusLabel', () => {
  it('returns a loading label while runtime delivery status is still unknown', () => {
    expect(getProspectDeliveryStatusLabel(null)).toEqual({
      tone: 'muted',
      text: 'checking delivery…',
    })
  })

  it('returns the configured provider when runtime delivery is ready', () => {
    expect(
      getProspectDeliveryStatusLabel({
        email_delivery: {
          configured: true,
          provider: 'smtp',
          fromAddress: 'hello@kenomi.eu',
        },
      })
    ).toEqual({
      tone: 'ready',
      text: 'delivery ready · smtp',
    })
  })

  it('returns identity-only when no server-side delivery provider exists', () => {
    expect(
      getProspectDeliveryStatusLabel({
        email_delivery: {
          configured: false,
          provider: null,
          fromAddress: null,
        },
      })
    ).toEqual({
      tone: 'warning',
      text: 'identity only · no server-side delivery provider',
    })
  })
})
