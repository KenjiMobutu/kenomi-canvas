import { describe, expect, it } from 'vitest'
import {
  buildProspectFollowUpDraft,
  getNextFollowUpKind,
  getNextFollowUpVersion,
  requiresFollowUpApproval,
  scheduleNextFollowUpAt,
  shouldGenerateFollowUp,
} from './follow-up'
import { DIAGNOSTIC_CASH_LANE } from '@/lib/revenue/diagnostic-cash-lane'

describe('follow-up sequencing', () => {
  it('maps counts to the next follow-up kind', () => {
    expect(getNextFollowUpKind(0)).toBe('follow_up_1')
    expect(getNextFollowUpKind(1)).toBe('follow_up_2')
    expect(getNextFollowUpKind(2)).toBe('follow_up_3')
    expect(getNextFollowUpKind(3)).toBeNull()
  })

  it('schedules the next due date from the completed outreach kind', () => {
    const now = new Date('2026-05-26T10:00:00.000Z')
    expect(scheduleNextFollowUpAt(now, 'initial')).toBe('2026-05-28T10:00:00.000Z')
    expect(scheduleNextFollowUpAt(now, 'follow_up_1')).toBe('2026-05-31T10:00:00.000Z')
    expect(scheduleNextFollowUpAt(now, 'follow_up_2')).toBe('2026-06-05T10:00:00.000Z')
    expect(scheduleNextFollowUpAt(now, 'follow_up_3')).toBeNull()
  })

  it('only generates due follow-ups for sent prospects with remaining sequence capacity', () => {
    expect(
      shouldGenerateFollowUp({
        pipeline_status: 'sent',
        next_followup_at: '2026-05-25T10:00:00.000Z',
        follow_up_count: 0,
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe(true)

    expect(
      shouldGenerateFollowUp({
        pipeline_status: 'draft_created',
        next_followup_at: '2026-05-25T10:00:00.000Z',
        follow_up_count: 0,
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe(false)

    expect(
      shouldGenerateFollowUp({
        pipeline_status: 'sent',
        next_followup_at: '2026-05-25T10:00:00.000Z',
        follow_up_count: 3,
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe(false)
  })

  it('resets the version for a new follow-up kind and increments on regeneration', () => {
    expect(
      getNextFollowUpVersion({
        currentKind: 'follow_up_1',
        currentVersion: 1,
        targetKind: 'follow_up_1',
      })
    ).toBe(2)

    expect(
      getNextFollowUpVersion({
        currentKind: 'initial',
        currentVersion: 4,
        targetKind: 'follow_up_2',
      })
    ).toBe(1)
  })

  it('requires approval only for the first follow-up', () => {
    expect(requiresFollowUpApproval('follow_up_1')).toBe(true)
    expect(requiresFollowUpApproval('follow_up_2')).toBe(false)
    expect(requiresFollowUpApproval('follow_up_3')).toBe(false)
  })
})

describe('buildProspectFollowUpDraft', () => {
  it('builds a concise follow-up from prospect context', () => {
    const draft = buildProspectFollowUpDraft({
      companyName: 'Acme Studio',
      contactName: 'Léa Martin',
      summary: 'manual lead qualification',
      painPoints: ['manual triage'],
      previousSubject: 'Acme Studio — qualify faster',
      operatorNotes: 'Mention the shorter setup path',
      kind: 'follow_up_1',
    })

    expect(draft.subject).toBe('Acme Studio — 300EUR Diagnostic for manual lead qualification')
    expect(draft.body).toContain('Hi Léa,')
    expect(draft.body).toContain('manual triage')
    expect(draft.body).toContain(DIAGNOSTIC_CASH_LANE.offer.title)
    expect(draft.body).toContain('https://lab.kenomi.eu/diagnostic-300')
    expect(draft.cta).toBe('Review the 300EUR Diagnostic: https://lab.kenomi.eu/diagnostic-300')
  })
})
