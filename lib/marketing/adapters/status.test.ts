import { describe, expect, it } from 'vitest'
import { getMarketingPublisherStatus } from './status'

describe('getMarketingPublisherStatus', () => {
  it('assume clairement mock contrôlé quand n8n webhook manque', () => {
    expect(getMarketingPublisherStatus({})).toMatchObject({
      mode: 'mock',
      label: 'Mock contrôlé',
      canPublishLive: false,
    })
  })

  it('active n8n live quand webhook autorisé et adapter n8n', () => {
    expect(
      getMarketingPublisherStatus({
        MARKETING_ADAPTER: 'n8n',
        N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.example.com/webhook/publish',
      })
    ).toMatchObject({
      mode: 'n8n',
      label: 'n8n live',
      canPublishLive: true,
    })
  })
})
