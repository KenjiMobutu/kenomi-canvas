import { describe, expect, it } from 'vitest'
import {
  buildControlledCampaignDraft,
  buildControlledTrackingEvents,
} from './revenue-proof-actions'

describe('buildControlledCampaignDraft', () => {
  it('prépare une campagne mock avec budget mesurable', () => {
    expect(
      buildControlledCampaignDraft({
        userId: 'u1',
        ventureId: 'v1',
        nowIso: '2026-05-19T10:00:00.000Z',
      })
    ).toMatchObject({
      user_id: 'u1',
      venture_id: 'v1',
      channel: 'email',
      status: 'draft',
      metadata: {
        budget_eur: 5,
        source: 'revenue_proof',
        controlled: true,
      },
    })
  })
})

describe('buildControlledTrackingEvents', () => {
  it('émet page_view, waitlist_signup et campaign_spend attribués', () => {
    const rows = buildControlledTrackingEvents({
      userId: 'u1',
      ventureId: 'v1',
      nowIso: '2026-05-19T10:00:00.000Z',
      campaign: {
        channel: 'email',
        draftId: 'd1',
        externalId: 'mock-d1',
      },
    })

    expect(rows.map((row) => row.event_type)).toEqual([
      'page_view',
      'waitlist_signup',
      'campaign_spend',
    ])
    expect(rows[2]).toMatchObject({
      value: 500,
      metadata: {
        channel: 'email',
        draft_id: 'd1',
        external_id: 'mock-d1',
      },
    })
  })
})
