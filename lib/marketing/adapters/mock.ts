import type { MarketingPublisher, PublishInput, PublishResult } from './types'

export function createMockPublisher(): MarketingPublisher {
  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      return {
        externalId: `mock-${Date.now()}-${input.channel}`,
        url: `https://mock.local/${input.ventureId}/${input.channel}`,
        metadata: { adapter: 'mock' },
      }
    },
  }
}
