import { createMockPublisher } from './mock'
import { createN8nPublisher } from './n8n'
import { getMarketingPublisherStatus } from './status'
import type { MarketingPublisher } from './types'

export type { MarketingPublisher, PublishInput, PublishResult } from './types'
export { getMarketingPublisherStatus } from './status'

export function getMarketingPublisher(
  channel: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): MarketingPublisher {
  if (env.MARKETING_ADAPTER === 'mock') return createMockPublisher()
  const status = getMarketingPublisherStatus(env)
  if (status.canPublishLive && status.channels.includes(channel.toLowerCase())) {
    return createN8nPublisher(env)
  }
  return createMockPublisher()
}
