import { describe, expect, it } from 'vitest'
import { buildProspectOutreach } from './build-outreach'

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
    expect(draft.body).toContain('follow-up')
    expect(draft.cta).toBeTruthy()
  })
})
