import { isAllowedWebhookUrl } from '@/lib/security'

export type MarketingPublisherMode = 'n8n' | 'mock'

export interface MarketingPublisherStatus {
  mode: MarketingPublisherMode
  label: string
  canPublishLive: boolean
  reason: string
  channels: string[]
}

export const N8N_LIVE_CHANNELS = [
  'email',
  'twitter',
  'x',
  'linkedin',
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'reddit',
  'seo',
  'newsletter',
]

export function getMarketingPublisherStatus(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): MarketingPublisherStatus {
  const webhookUrl = env.N8N_PUBLISH_WEBHOOK_URL
  const wantsN8n = env.MARKETING_ADAPTER === 'n8n'
  const allowed = webhookUrl ? isAllowedWebhookUrl(webhookUrl, env as NodeJS.ProcessEnv) : false

  if (wantsN8n && webhookUrl && allowed) {
    return {
      mode: 'n8n',
      label: 'n8n live',
      canPublishLive: true,
      reason: 'Les publications partent vers N8N_PUBLISH_WEBHOOK_URL.',
      channels: N8N_LIVE_CHANNELS,
    }
  }

  return {
    mode: 'mock',
    label: 'Mock contrôlé',
    canPublishLive: false,
    reason: wantsN8n
      ? 'n8n demandé mais webhook manquant ou non autorisé. Aucune publication externe réelle.'
      : 'MARKETING_ADAPTER différent de n8n. Les publications sont simulées et traçables.',
    channels: N8N_LIVE_CHANNELS,
  }
}
