import { describe, expect, it } from 'vitest'
import { createMockPublisher } from './mock'

describe('createMockPublisher', () => {
  it('returns externalId prefixed with mock-', async () => {
    const publisher = createMockPublisher()
    const result = await publisher.publish({
      channel: 'twitter',
      content: 'hello',
      ventureId: 'v-1',
    })
    expect(result.externalId.startsWith('mock-')).toBe(true)
  })

  it('returns url containing ventureId and channel', async () => {
    const publisher = createMockPublisher()
    const result = await publisher.publish({
      channel: 'linkedin',
      content: 'hello',
      ventureId: 'venture-abc',
    })
    expect(result.url).toContain('venture-abc')
    expect(result.url).toContain('linkedin')
  })

  it('returns metadata.adapter === "mock"', async () => {
    const publisher = createMockPublisher()
    const result = await publisher.publish({
      channel: 'email',
      content: 'hello',
      ventureId: 'v-2',
    })
    expect(result.metadata?.adapter).toBe('mock')
  })
})
