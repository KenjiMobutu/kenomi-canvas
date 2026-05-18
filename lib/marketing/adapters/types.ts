export interface PublishInput {
  channel: string
  content: string
  ventureId: string
  metadata?: Record<string, unknown>
}

export interface PublishResult {
  externalId: string
  url?: string
  metadata?: Record<string, unknown>
}

export interface MarketingPublisher {
  publish(input: PublishInput): Promise<PublishResult>
}
