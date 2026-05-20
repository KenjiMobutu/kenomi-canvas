import { afterEach, describe, expect, it, vi } from 'vitest'
import { createN8nFulfillmentProvider } from './n8n'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createN8nFulfillmentProvider', () => {
  it('posts the paid customer payload to n8n', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ executionId: 'fulfill-1', url: 'https://x.test/access' }),
    } as Response)

    const provider = createN8nFulfillmentProvider({
      FULFILLMENT_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/fulfill',
      FULFILLMENT_WEBHOOK_TOKEN: 'secret',
    })

    const result = await provider.deliver({
      deliveryId: 'delivery-1',
      ventureId: 'venture-1',
      paymentId: 'payment-1',
      customerEmail: 'client@example.com',
      offerName: 'AI audit',
      amountEur: 29,
    })

    expect(result).toEqual({
      externalId: 'fulfill-1',
      accessUrl: 'https://x.test/access',
      metadata: { provider: 'n8n' },
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('rejects missing webhook URL', () => {
    expect(() => createN8nFulfillmentProvider({})).toThrow(/FULFILLMENT_WEBHOOK_URL/)
  })
})
