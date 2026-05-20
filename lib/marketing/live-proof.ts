export type MarketingLiveProofStatus = 'live' | 'mock_controlled' | 'missing'

export interface MarketingLiveProofDraft {
  status?: string | null
  provider_run_id?: string | null
  metadata?: Record<string, unknown> | null
}

export interface MarketingLiveProof {
  status: MarketingLiveProofStatus
  livePublishedCampaigns: number
  mockPublishedCampaigns: number
  reason: string
}

function adapter(row: MarketingLiveProofDraft): string {
  const raw = row.metadata?.adapter
  if (typeof raw === 'string') return raw.toLowerCase()

  const providerRunId = row.provider_run_id ?? ''
  if (providerRunId.startsWith('mock-')) return 'mock'
  if (providerRunId.length > 0) return 'n8n'
  return ''
}

export function buildMarketingLiveProof(input: {
  providerStatus: { mode: string; canPublishLive: boolean }
  campaignDrafts: MarketingLiveProofDraft[]
}): MarketingLiveProof {
  const published = input.campaignDrafts.filter((row) => row.status === 'published')
  const livePublishedCampaigns = published.filter((row) => adapter(row) === 'n8n').length
  const mockPublishedCampaigns = published.filter((row) => adapter(row) === 'mock').length

  if (input.providerStatus.canPublishLive && livePublishedCampaigns > 0) {
    return {
      status: 'live',
      livePublishedCampaigns,
      mockPublishedCampaigns,
      reason: `${livePublishedCampaigns} campagne${livePublishedCampaigns > 1 ? 's' : ''} live publiee${livePublishedCampaigns > 1 ? 's' : ''} via n8n.`,
    }
  }

  if (mockPublishedCampaigns > 0) {
    return {
      status: 'mock_controlled',
      livePublishedCampaigns,
      mockPublishedCampaigns,
      reason: `${mockPublishedCampaigns} campagne${mockPublishedCampaigns > 1 ? 's' : ''} mock controlee${mockPublishedCampaigns > 1 ? 's' : ''}.`,
    }
  }

  return {
    status: 'missing',
    livePublishedCampaigns: 0,
    mockPublishedCampaigns: 0,
    reason: 'Aucune campagne publiee.',
  }
}
