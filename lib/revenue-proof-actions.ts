export interface ControlledCampaignInput {
  userId: string
  ventureId: string
  nowIso: string
  channel?: string
  budgetEur?: number
}

export interface ControlledTrackingCampaign {
  channel: string
  draftId: string
  externalId: string
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export function buildControlledCampaignDraft(input: ControlledCampaignInput) {
  const budgetEur = positiveNumber(input.budgetEur, 5)
  const channel = input.channel ?? 'email'

  return {
    user_id: input.userId,
    venture_id: input.ventureId,
    channel,
    content:
      'Signal revenue-first Kenomi: campagne contrôlée pour mesurer acquisition, conversion et ROI.',
    status: 'draft',
    metadata: {
      budget_eur: budgetEur,
      source: 'revenue_proof',
      controlled: true,
    },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  }
}

export function buildControlledTrackingEvents(input: {
  userId: string
  ventureId: string
  nowIso: string
  campaign: ControlledTrackingCampaign
  spendEur?: number
}) {
  const metadata = {
    channel: input.campaign.channel,
    draft_id: input.campaign.draftId,
    external_id: input.campaign.externalId,
    source: 'revenue_proof',
    controlled: true,
  }

  return [
    {
      user_id: input.userId,
      venture_id: input.ventureId,
      event_type: 'page_view',
      source: 'revenue_proof',
      value: null,
      metadata,
      occurred_at: input.nowIso,
    },
    {
      user_id: input.userId,
      venture_id: input.ventureId,
      event_type: 'waitlist_signup',
      source: 'revenue_proof',
      value: null,
      metadata,
      occurred_at: input.nowIso,
    },
    {
      user_id: input.userId,
      venture_id: input.ventureId,
      event_type: 'campaign_spend',
      source: 'revenue_proof',
      value: Math.round(positiveNumber(input.spendEur, 5) * 100),
      metadata,
      occurred_at: input.nowIso,
    },
  ]
}
