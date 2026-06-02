import { describe, it, expect } from 'vitest'
import { computeGamification, ACHIEVEMENTS_META } from './gamification'
import type { GamificationInput } from './gamification'

const EMPTY_INPUT: GamificationInput = {
  ventures: [],
  snapshots: [],
  workflows: [],
  landings: [],
  payments: [],
  metrics: [],
  decisions: [],
  ventureEvents: [],
  agentRuns: [],
  claimed: [],
}

describe('computeGamification', () => {
  it('retourne 12 achievements avec unlocked=false et pct=0 si input vide', () => {
    const r = computeGamification(EMPTY_INPUT)
    expect(r.achievements).toHaveLength(12)
    expect(r.achievements.every((a) => !a.unlocked)).toBe(true)
    expect(r.achievements.every((a) => a.pct === 0)).toBe(true)
  })

  it('first-mrr : unlocked quand mrr >= 1000', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ revenue: '€1200', cac: null, updated_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find((a) => a.id === 'first-mrr')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBe(100)
  })

  it('first-mrr : pct proportionnel avant seuil', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ revenue: '€500', cac: null, updated_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find((a) => a.id === 'first-mrr')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(50)
  })

  it('first-scale : unlocked quand un venture a score >= 75', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      ventures: [
        { id: '1', score: 80, mrr: '0', stage: 'build', created_at: new Date().toISOString() },
      ],
    }
    const r = computeGamification(input)
    const a = r.achievements.find((a) => a.id === 'first-scale')!
    expect(a.unlocked).toBe(true)
  })

  it('5-ventures : unlocked quand 5 ventures ou plus', () => {
    const vs = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      score: 50,
      mrr: '0',
      stage: 'build',
      created_at: new Date().toISOString(),
    }))
    const r = computeGamification({ ...EMPTY_INPUT, ventures: vs })
    const a = r.achievements.find((a) => a.id === '5-ventures')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBe(100)
  })

  it('userXP = somme des xp des achievements réclamés', () => {
    const r = computeGamification({ ...EMPTY_INPUT, claimed: ['first-mrr', 'ship-7'] })
    const expectedXP =
      ACHIEVEMENTS_META.find((a) => a.id === 'first-mrr')!.xp +
      ACHIEVEMENTS_META.find((a) => a.id === 'ship-7')!.xp
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
      id: String(i),
      score: 80,
      mrr: '0',
      stage: 'scale',
      created_at: new Date().toISOString(),
    }))
    const r = computeGamification({ ...EMPTY_INPUT, ventures: vs })
    const dec = r.agentLevels.find((a) => a.id === 'decision')!
    expect(dec.level).toBeGreaterThan(0)
  })

  it('newUnlocks contient les ids unlocked non réclamés', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      ventures: Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        score: 50,
        mrr: '0',
        stage: 'build',
        created_at: new Date().toISOString(),
      })),
      claimed: [],
    }
    const r = computeGamification(input)
    expect(r.newUnlocks).toContain('5-ventures')
  })

  it('cac-under-20 : unlocked quand cac > 0 et cac <= 20 avec mrr > 0', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ revenue: '€500', cac: '15', updated_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find((a) => a.id === 'cac-under-20')!
    expect(a.unlocked).toBe(true)
    expect(a.pct).toBeGreaterThan(0)
  })

  it('cac-under-20 : non unlocked si pas de données cac (cac=0)', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ revenue: '€500', cac: null, updated_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    const a = r.achievements.find((a) => a.id === 'cac-under-20')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(0)
  })

  it('parseNum : retourne 0 pour une string invalide avec k', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      snapshots: [{ revenue: 'unknownk', cac: null, updated_at: new Date().toISOString() }],
    }
    const r = computeGamification(input)
    expect(r.achievements.every((a) => !isNaN(a.pct))).toBe(true)
  })

  it('agentLevels : paiements négatifs (remboursements) ne produisent pas NaN', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      payments: [
        { id: '1', amount_eur: -200, status: 'refunded', created_at: new Date().toISOString() },
      ],
    }
    const r = computeGamification(input)
    const payment = r.agentLevels.find((a) => a.id === 'payment')!
    expect(isNaN(payment.level)).toBe(false)
    expect(payment.level).toBe(0)
  })

  it('agentLevels : dépend des agent_runs réels et reste monotone avec le nombre de runs', () => {
    const input: GamificationInput = {
      ...EMPTY_INPUT,
      agentRuns: [
        { agent_id: 'scout', duration_ms: 1000, created_at: new Date().toISOString() },
        { agent_id: 'scout', duration_ms: 1000, created_at: new Date().toISOString() },
        { agent_id: 'builder', duration_ms: 1000, created_at: new Date().toISOString() },
      ],
    }
    const r = computeGamification(input)
    const scout = r.agentLevels.find((a) => a.id === 'scout')!
    const builder = r.agentLevels.find((a) => a.id === 'builder')!
    const payment = r.agentLevels.find((a) => a.id === 'payment')!
    expect(scout.level).toBeGreaterThan(builder.level)
    expect(payment.level).toBe(0)
  })

  it('agentLevels : plus de runs ⇒ plus de niveau (sans dépendre du stage/scorage)', () => {
    const base: GamificationInput = {
      ...EMPTY_INPUT,
      agentRuns: [
        { agent_id: 'marketing', duration_ms: 1000, created_at: new Date().toISOString() },
      ],
    }
    const upgraded: GamificationInput = {
      ...base,
      agentRuns: [
        ...base.agentRuns,
        ...base.agentRuns,
        ...base.agentRuns,
        ...base.agentRuns,
      ],
    }
    const r1 = computeGamification(base)
    const r2 = computeGamification(upgraded)
    const l1 = r1.agentLevels.find((a) => a.id === 'marketing')?.level ?? 0
    const l2 = r2.agentLevels.find((a) => a.id === 'marketing')?.level ?? 0
    expect(l2).toBeGreaterThan(l1)
  })

  it('utilise venture_events comme source revenu/ROI pour achievements et agents', () => {
    const r = computeGamification({
      ...EMPTY_INPUT,
      ventureEvents: [
        {
          venture_id: 'v1',
          event_type: 'campaign_published',
          value: null,
          occurred_at: new Date().toISOString(),
        },
        {
          venture_id: 'v1',
          event_type: 'campaign_spend',
          value: 2000,
          occurred_at: new Date().toISOString(),
        },
        {
          venture_id: 'v1',
          event_type: 'payment_succeeded',
          value: 120000,
          occurred_at: new Date().toISOString(),
        },
        {
          venture_id: 'v1',
          event_type: 'page_view',
          value: 100_000,
          occurred_at: new Date().toISOString(),
        },
      ],
    })

    expect(r.achievements.find((a) => a.id === 'first-mrr')?.unlocked).toBe(true)
    expect(r.achievements.find((a) => a.id === '100k-imp')?.unlocked).toBe(true)
    expect(r.agentLevels.find((a) => a.id === 'payment')?.level).toBeGreaterThan(0)
    expect(r.agentLevels.find((a) => a.id === 'marketing')?.level).toBeGreaterThan(0)
  })

  it('utilise visiteurs et statut legacy sans casser les unlocks', () => {
    const now = new Date().toISOString()
    const r = computeGamification({
      ...EMPTY_INPUT,
      landings: Array.from({ length: 7 }, (_, i) => ({
        id: `landing-${i}`,
        statut: 'deployed',
        created_at: now,
      })),
      metrics: [{ visiteurs: 100_000 }],
    })

    expect(r.achievements.find((a) => a.id === 'ship-7')?.unlocked).toBe(true)
    expect(r.achievements.find((a) => a.id === '100k-imp')?.unlocked).toBe(true)
  })

  it('season-podium : toujours locked, pct = 0', () => {
    const r = computeGamification(EMPTY_INPUT)
    const a = r.achievements.find((a) => a.id === 'season-podium')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(0)
  })
})
