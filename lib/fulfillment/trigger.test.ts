import { describe, expect, it, vi } from 'vitest'
import { triggerFulfillmentForPayment } from './trigger'

function fakeSupabase() {
  const inserts: Record<string, unknown[]> = {}
  return {
    inserts,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts[table] = [...(inserts[table] ?? []), row]
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'delivery-1', ...row }, error: null }),
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: () => ({
              eq: async () => {
                inserts[`${table}:updates`] = [...(inserts[`${table}:updates`] ?? []), patch]
                return { error: null }
              },
            }),
          }
        },
      }
    },
  }
}

describe('triggerFulfillmentForPayment', () => {
  it('creates and completes a fulfillment delivery', async () => {
    const supabase = fakeSupabase()
    const provider = {
      deliver: vi.fn().mockResolvedValue({
        externalId: 'fulfill-1',
        accessUrl: 'https://x.test/access',
      }),
    }

    const result = await triggerFulfillmentForPayment({
      supabase,
      provider,
      payment: {
        id: 'payment-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        customer_email: 'client@example.com',
        amount_eur: 29,
      },
      offerName: 'Kenomi audit',
      now: () => new Date('2026-05-20T10:00:00.000Z'),
    })

    expect(result.status).toBe('completed')
    expect(provider.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'delivery-1', paymentId: 'payment-1' })
    )
  })
})
