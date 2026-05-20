import { isAllowedWebhookUrl } from '@/lib/security'
import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from './types'

export function createN8nFulfillmentProvider(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): FulfillmentProvider {
  const url = env.FULFILLMENT_WEBHOOK_URL
  if (!url) throw new Error('FULFILLMENT_WEBHOOK_URL missing')
  if (!isAllowedWebhookUrl(url, env as NodeJS.ProcessEnv)) {
    throw new Error('FULFILLMENT_WEBHOOK_URL not allowed')
  }

  return {
    async deliver(input: FulfillmentInput): Promise<FulfillmentResult> {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.FULFILLMENT_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${env.FULFILLMENT_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(input),
      })

      const body = await response.text()
      if (!response.ok) {
        throw new Error(`n8n fulfillment ${response.status}: ${body.slice(0, 200)}`)
      }

      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {}

      return {
        externalId:
          typeof parsed.executionId === 'string'
            ? parsed.executionId
            : typeof parsed.id === 'string'
              ? parsed.id
              : `n8n-${Date.now()}`,
        accessUrl: typeof parsed.url === 'string' ? parsed.url : null,
        metadata: { provider: 'n8n' },
      }
    },
  }
}
