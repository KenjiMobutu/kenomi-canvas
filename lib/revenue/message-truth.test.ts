import { describe, expect, it } from 'vitest'
import { buildMessageTruthSnapshot, deriveMessageMetadata } from '@/lib/revenue/message-truth'

describe('message truth', () => {
  it('derives stable message metadata from prospect fields', () => {
    expect(
      deriveMessageMetadata({
        outreach_angle: 'speed',
        last_outreach_kind: 'initial',
        source: 'linkedin',
        metadata: {},
      })
    ).toEqual({
      messageFamily: 'speed',
      messageKey: 'speed:initial:linkedin',
    })

    expect(
      deriveMessageMetadata({
        outreach_angle: null,
        last_outreach_kind: 'follow_up_1',
        source: 'reddit',
        metadata: {},
      })
    ).toEqual({
      messageFamily: 'follow_up_1',
      messageKey: 'follow_up_1:follow_up_1:reddit',
    })
  })

  it('aggregates reply, win, paid and objections by message family', () => {
    const snapshot = buildMessageTruthSnapshot({
      prospects: [
        {
          id: 'p1',
          source: 'linkedin',
          outreach_angle: 'speed',
          last_outreach_kind: 'initial',
          metadata: { message_family: 'speed' },
        },
        {
          id: 'p2',
          source: 'linkedin',
          outreach_angle: 'speed',
          last_outreach_kind: 'initial',
          metadata: { message_family: 'speed' },
        },
        {
          id: 'p3',
          source: 'reddit',
          outreach_angle: 'roi',
          last_outreach_kind: 'initial',
          metadata: { message_family: 'roi' },
        },
      ],
      conversationEvents: [
        { prospect_id: 'p1', event_type: 'positive_reply' },
        { prospect_id: 'p1', event_type: 'closed_won' },
        { prospect_id: 'p2', event_type: 'soft_interest' },
        { prospect_id: 'p2', event_type: 'budget_block' },
        { prospect_id: 'p3', event_type: 'wrong_person' },
      ],
      paymentAttributions: [{ prospect_id: 'p1', amount_eur: 2400, payment_status: 'paid' }],
    })

    expect(snapshot.bestFamily).toMatchObject({
      messageFamily: 'speed',
      contacted: 2,
      replied: 2,
      wonCount: 1,
      paidCount: 1,
      paidCashEur: 2400,
    })
    expect(snapshot.familyRepliesNoCash).toBeNull()
    expect(snapshot.familyWinsNoCash).toBeNull()
    expect(snapshot.topObjectionFamily).toMatchObject({
      messageFamily: 'speed',
      topObjection: 'budget_block',
      objectionCount: 1,
    })
    expect(snapshot.breakdown[0]).toMatchObject({
      messageFamily: 'speed',
      paidRate: 50,
      winRate: 50,
      replyRate: 100,
    })
  })
})
