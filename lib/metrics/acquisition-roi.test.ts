import { describe, expect, it } from 'vitest'
import { buildAcquisitionRoi, buildAcquisitionRoiContext } from './acquisition-roi'

describe('buildAcquisitionRoi', () => {
  it('attribue revenu et spend au dernier campaign_published connu', () => {
    const result = buildAcquisitionRoi([
      {
        venture_id: 'venture-1',
        event_type: 'campaign_published',
        value: null,
        occurred_at: '2026-05-18T09:00:00.000Z',
        metadata: { channel: 'linkedin', draft_id: 'draft-1' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'campaign_spend',
        value: 2000,
        occurred_at: '2026-05-18T09:01:00.000Z',
        metadata: { channel: 'linkedin', draft_id: 'draft-1' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'payment_succeeded',
        value: 8700,
        occurred_at: '2026-05-18T12:00:00.000Z',
        metadata: {},
      },
    ])

    expect(result.summary).toMatchObject({
      revenueCents: 8700,
      spendCents: 2000,
      profitCents: 6700,
    })
    expect(result.channels[0]).toMatchObject({
      channel: 'linkedin',
      revenueCents: 8700,
      spendCents: 2000,
      profitCents: 6700,
      recommendation: 'scale',
    })
    expect(result.campaigns[0]).toMatchObject({
      campaignId: 'draft-1',
      channel: 'linkedin',
      roi: 3.35,
    })
  })

  it('recommande de couper les campagnes qui dépensent sans revenu', () => {
    const result = buildAcquisitionRoi([
      {
        venture_id: 'venture-1',
        event_type: 'campaign_spend',
        value: 3000,
        occurred_at: '2026-05-18T09:01:00.000Z',
        metadata: { channel: 'x', draft_id: 'draft-x' },
      },
    ])

    expect(result.channels[0]).toMatchObject({
      channel: 'x',
      revenueCents: 0,
      spendCents: 3000,
      recommendation: 'cut',
      recommendedBudgetEur: 0,
    })
  })

  it('produit un contexte compact pour Decision', () => {
    const result = buildAcquisitionRoi([
      {
        venture_id: 'venture-1',
        event_type: 'campaign_published',
        value: null,
        occurred_at: '2026-05-18T09:00:00.000Z',
        metadata: { channel: 'email', draft_id: 'draft-email' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'campaign_spend',
        value: 1000,
        occurred_at: '2026-05-18T09:01:00.000Z',
        metadata: { channel: 'email', draft_id: 'draft-email' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'payment_succeeded',
        value: 2900,
        occurred_at: '2026-05-18T10:00:00.000Z',
        metadata: {},
      },
    ])

    expect(buildAcquisitionRoiContext(result)).toContain('email: revenu 29.00 EUR')
    expect(buildAcquisitionRoiContext(result)).toContain('reco scale')
  })
})
