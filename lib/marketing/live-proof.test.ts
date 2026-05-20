import { describe, expect, it } from 'vitest'
import { buildMarketingLiveProof } from './live-proof'

describe('buildMarketingLiveProof', () => {
  it('marque live quand au moins une campagne publiee vient de n8n', () => {
    const proof = buildMarketingLiveProof({
      providerStatus: { mode: 'n8n', canPublishLive: true },
      campaignDrafts: [
        {
          status: 'published',
          provider_run_id: 'n8n-exec-123',
          metadata: { adapter: 'n8n' },
        },
      ],
    })

    expect(proof).toEqual({
      status: 'live',
      livePublishedCampaigns: 1,
      mockPublishedCampaigns: 0,
      reason: '1 campagne live publiee via n8n.',
    })
  })

  it('marque mock_controlled quand les campagnes publiees sont mock', () => {
    const proof = buildMarketingLiveProof({
      providerStatus: { mode: 'mock', canPublishLive: false },
      campaignDrafts: [
        {
          status: 'published',
          provider_run_id: 'mock-email-1',
          metadata: { adapter: 'mock' },
        },
      ],
    })

    expect(proof.status).toBe('mock_controlled')
    expect(proof.mockPublishedCampaigns).toBe(1)
  })
})
