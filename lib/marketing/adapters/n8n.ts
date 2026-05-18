import { isAllowedWebhookUrl } from '@/lib/security'
import type { MarketingPublisher, PublishInput, PublishResult } from './types'

export function createN8nPublisher(env: Record<string, string | undefined>): MarketingPublisher {
  const webhookUrl = env.N8N_PUBLISH_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('N8N_PUBLISH_WEBHOOK_URL missing')
  }
  if (!isAllowedWebhookUrl(webhookUrl, env as NodeJS.ProcessEnv)) {
    throw new Error(`N8N webhook URL non autorisée: ${webhookUrl}`)
  }
  const token = env.N8N_PUBLISH_TOKEN

  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) headers['X-Kenomi-Token'] = token

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          venture_id: input.ventureId,
          channel: input.channel,
          content: input.content,
          metadata: input.metadata,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`n8n publish ${response.status}: ${body.slice(0, 200)}`)
      }

      const data = (await response.json()) as { executionId?: string; url?: string }
      return {
        externalId: data.executionId ?? `n8n-${Date.now()}`,
        url: data.url,
        metadata: { adapter: 'n8n' },
      }
    },
  }
}
