import { createMockPublisher } from './mock'
import { createN8nPublisher } from './n8n'
import type { MarketingPublisher } from './types'

export type { MarketingPublisher, PublishInput, PublishResult } from './types'

export function getMarketingPublisher(
  channel: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): MarketingPublisher {
  if (env.MARKETING_ADAPTER === 'mock') return createMockPublisher()
  const knownChannels = ['email', 'twitter', 'linkedin', 'instagram', 'facebook']
  if (knownChannels.includes(channel.toLowerCase())) {
    return createN8nPublisher(env)
  }
  return createMockPublisher()
}
