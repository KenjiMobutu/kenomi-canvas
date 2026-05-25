import { describe, expect, it } from 'vitest'
import { scoreProspect } from './score-prospect'

describe('scoreProspect', () => {
  it('scores a strong upwork lead as hot', () => {
    const result = scoreProspect({
      companyName: 'Acme Studio',
      source: 'upwork',
      signals: ['urgent lead', 'budget', 'technical fit'],
      fit: 'high',
      urgency: 'high',
    })

    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.band).toBe('hot')
    expect(result.reasons.length).toBeGreaterThan(0)
  })
})
