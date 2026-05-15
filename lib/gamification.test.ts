import { describe, it, expect } from 'vitest'
import { computeGamification, ACHIEVEMENTS_META } from './gamification'
import type { GamificationInput } from './gamification'

const EMPTY_INPUT: GamificationInput = {
  ventures: [], snapshots: [], workflows: [],
  landings: [], payments: [], metrics: [],
  decisions: [], claimed: [],
}

describe('computeGamification', () => {
  it('retourne 12 achievements avec unlocked=false et pct=0 si input vide', () => {
    const r = computeGamification(EMPTY_INPUT)
    expect(r.achievements).toHaveLength(12)
    expect(r.achievements.every(a => !a.unlocked)).toBe(true)
    expect(r.achievements.every(a => a.pct === 0)).toBe(true)
  })

  it('first-mrr : unlocked quand mrr >= 1000', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ mrr: '1200', cac: null, created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find(a => a.id === 'first-mrr')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBe(100)
  })

  it('first-mrr : pct proportionnel avant seuil', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ mrr: '500', cac: null, created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find(a => a.id === 'first-mrr')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(50)
  })

  it('first-scale : unlocked quand un venture a score >= 75', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      ventures: [{ id: '1', score: 80, mrr: '0', stage: 'build', created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find(a => a.id === 'first-scale')!
    expect(a.unlocked).toBe(true)
  })

  it('5-ventures : unlocked quand 5 ventures ou plus', () => {
    const vs = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), score: 50, mrr: '0', stage: 'build', created_at: new Date().toISOString(),
    }))
    const r = computeGamification({ ...EMPTY_INPUT, ventures: vs })
    const a = r.achievements.find(a => a.id === '5-ventures')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBe(100)
  })

  it('userXP = somme des xp des achievements réclamés', () => {
    const r = computeGamification({ ...EMPTY_INPUT, claimed: ['first-mrr', 'ship-7'] })
    const expectedXP = ACHIEVEMENTS_META.find(a => a.id === 'first-mrr')!.xp
                     + ACHIEVEMENTS_META.find(a => a.id === 'ship-7')!.xp
    expect(r.userXP).toBe(expectedXP)
  })

  it('userLevel = 0 avec 0 XP', () => {
    const r = computeGamification(EMPTY_INPUT)
    expect(r.userLevel).toBe(0)
  })

  it('userLevel = 1 avec 250 XP (first-mrr)', () => {
    // first-mrr = 250 XP → level = floor(sqrt(250/100)) = floor(1.58) = 1
    const r = computeGamification({ ...EMPTY_INPUT, claimed: ['first-mrr'] })
    expect(r.userLevel).toBe(1)
  })

  it('decision agent level monte avec ventures scale', () => {
    const vs = Array.from({ length: 3 }, (_, i) => ({
      id: String(i), score: 80, mrr: '0', stage: 'scale', created_at: new Date().toISOString(),
    }))
    const r = computeGamification({ ...EMPTY_INPUT, ventures: vs })
    const dec = r.agentLevels.find(a => a.id === 'decision')!
    expect(dec.level).toBeGreaterThan(0)
  })

  it('newUnlocks contient les ids unlocked non réclamés', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      ventures: Array.from({ length: 5 }, (_, i) => ({
        id: String(i), score: 50, mrr: '0', stage: 'build', created_at: new Date().toISOString(),
      })),
      claimed: [],
    }
    const r = computeGamification(input)
    expect(r.newUnlocks).toContain('5-ventures')
  })

  it('cac-under-20 : unlocked quand cac > 0 et cac <= 20 avec mrr > 0', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ mrr: '500', cac: '15', created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find(a => a.id === 'cac-under-20')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBeGreaterThan(0)
  })

  it('cac-under-20 : non unlocked si pas de données cac (cac=0)', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ mrr: '500', cac: null, created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find(a => a.id === 'cac-under-20')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(0)
  })

  it('parseNum : retourne 0 pour une string invalide avec k', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ mrr: 'unknownk', cac: null, created_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    expect(r.achievements.every(a => !isNaN(a.pct))).toBe(true)
  })

  it('agentLevels : paiements négatifs (remboursements) ne produisent pas NaN', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      payments: [
        { id: '1', amount_eur: -200, status: 'refunded', created_at: new Date().toISOString() },
      ],
    }
    const r = computeGamification(input)
    const payment = r.agentLevels.find(a => a.id === 'payment')!
    expect(isNaN(payment.level)).toBe(false)
    expect(payment.level).toBe(0)
  })

  it('season-podium : toujours locked, pct = 0', () => {
    const r = computeGamification(EMPTY_INPUT)
    const a = r.achievements.find(a => a.id === 'season-podium')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(0)
  })
})
