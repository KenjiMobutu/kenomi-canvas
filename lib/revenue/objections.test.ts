import { describe, expect, it } from 'vitest'
import {
  buildConversationEventInsert,
  getConversationEventLabel,
  summarizeConversationEvents,
} from '@/lib/revenue/objections'

describe('revenue objections helpers', () => {
  it('builds normalized conversation event inserts', () => {
    expect(
      buildConversationEventInsert({
        prospectId: 'prospect-1',
        userId: 'user-1',
        eventType: 'budget_block',
        eventValue: '  q3 only  ',
        notes: '  asked to revisit later  ',
        createdAt: '2026-05-28T10:00:00.000Z',
      })
    ).toEqual({
      prospect_id: 'prospect-1',
      user_id: 'user-1',
      event_type: 'budget_block',
      event_value: 'q3 only',
      notes: 'asked to revisit later',
      created_at: '2026-05-28T10:00:00.000Z',
    })
  })

  it('summarizes blockers and latest conversation truth by prospect', () => {
    const summary = summarizeConversationEvents([
      {
        id: '1',
        prospect_id: 'prospect-1',
        user_id: 'user-1',
        event_type: 'soft_interest',
        created_at: '2026-05-28T08:00:00.000Z',
      },
      {
        id: '2',
        prospect_id: 'prospect-1',
        user_id: 'user-1',
        event_type: 'meeting_booked',
        event_value: 'call next week',
        notes: 'sent calendly',
        created_at: '2026-05-28T09:00:00.000Z',
      },
      {
        id: '3',
        prospect_id: 'prospect-2',
        user_id: 'user-1',
        event_type: 'budget_block',
        created_at: '2026-05-28T07:00:00.000Z',
      },
    ])

    expect(summary.totalEvents).toBe(3)
    expect(summary.blockers).toEqual([
      { type: 'budget_block', label: 'budget block', count: 1 },
    ])
    expect(summary.latestByProspectId['prospect-1']).toEqual({
      eventType: 'meeting_booked',
      label: 'meeting booked',
      eventValue: 'call next week',
      notes: 'sent calendly',
      createdAt: '2026-05-28T09:00:00.000Z',
    })
    expect(getConversationEventLabel('soft_interest')).toBe('soft interest')
})
})
