import { describe, expect, it } from 'vitest'
import { buildProspectOutreach, summarizePainPointForSubject } from './build-outreach'
import { DIAGNOSTIC_CASH_LANE } from '@/lib/revenue/diagnostic-cash-lane'

describe('buildProspectOutreach', () => {
  it('drafts a personalized outreach note from prospect context', () => {
    const draft = buildProspectOutreach({
      companyName: 'Acme Studio',
      contactName: 'Lina',
      source: 'upwork',
      score: 88,
      band: 'hot',
      painPoints: ['slow follow-up', 'leads going cold'],
      focus: 'prospect',
    })

    expect(draft.subject).toContain('Acme Studio')
    expect(draft.body).toContain('Lina')
    expect(draft.body).toContain('Rather than tease a teardown')
    expect(draft.body).toContain('reply yes')
    expect(draft.cta).toBeTruthy()
  })

  it('sells the 300EUR diagnostic lane with a concrete landing URL', () => {
    const draft = buildProspectOutreach({
      companyName: 'Acme Studio',
      contactName: 'Lina',
      source: 'other',
      score: 72,
      band: 'warm',
      painPoints: ['manual lead follow-up steals delivery time'],
      focus: 'prospect',
    })

    expect(draft.subject).toContain('3-point teardown')
    expect(draft.subject).toContain('Acme Studio')
    expect(draft.body).toContain(DIAGNOSTIC_CASH_LANE.offer.title)
    expect(draft.body).toContain('48h')
    expect(draft.body).toContain('Rather than tease a teardown, here it is directly:')
    expect(draft.body).toContain('1.')
    expect(draft.body).toContain('2.')
    expect(draft.body).toContain('3.')
    expect(draft.body).toContain('https://lab.kenomi.eu/diagnostic-300')
    expect(draft.cta).toContain('Reply yes')
  })

  it('compresses verbose pain points into shorter subject phrases', () => {
    expect(summarizePainPointForSubject('manual lead follow-up steals delivery time')).toBe(
      'lead follow-up drag'
    )
    expect(summarizePainPointForSubject('manual lead triage can slow conversion')).toBe(
      'manual lead qualification'
    )
    expect(summarizePainPointForSubject('new business response time competes with delivery work')).toBe(
      'slower lead response'
    )
  })
})
