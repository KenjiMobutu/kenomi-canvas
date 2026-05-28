import { describe, expect, it } from 'vitest'
import { buildOfferSnapshots, normalizeOfferText } from './offers'

describe('normalizeOfferText', () => {
  it('trims empty strings to null', () => {
    expect(normalizeOfferText('  ')).toBeNull()
    expect(normalizeOfferText(' Offer A ')).toBe('Offer A')
  })
})

describe('buildOfferSnapshots', () => {
  it('aggregates prospects by offer and sorts by wins, replies, then total', () => {
    const snapshots = buildOfferSnapshots({
      offers: [
        { id: 'offer-a', name: 'Offer A', category: 'service', target_icp: 'founders' },
        { id: 'offer-b', name: 'Offer B', category: 'audit', target_icp: 'teams' },
      ],
      prospects: [
        { offer_id: 'offer-a', pipeline_status: 'won' },
        { offer_id: 'offer-a', pipeline_status: 'replied' },
        { offer_id: 'offer-a', pipeline_status: 'sent' },
        { offer_id: 'offer-b', pipeline_status: 'replied' },
        { offer_id: 'offer-b', pipeline_status: 'draft_created' },
      ],
    })

    expect(snapshots).toEqual([
      {
        id: 'offer-a',
        name: 'Offer A',
        category: 'service',
        targetIcp: 'founders',
        totalProspects: 3,
        repliedProspects: 1,
        wonProspects: 1,
      },
      {
        id: 'offer-b',
        name: 'Offer B',
        category: 'audit',
        targetIcp: 'teams',
        totalProspects: 2,
        repliedProspects: 1,
        wonProspects: 0,
      },
    ])
  })
})
