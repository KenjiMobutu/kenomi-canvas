// ── Types input ──────────────────────────────────────────────────────────────

export type GamifVenture  = { id: string; score: number; mrr: string; stage: string; created_at: string }
export type GamifSnapshot = { mrr?: string | null; cac?: string | null; created_at: string }
export type GamifWorkflow = { id: string; enabled: boolean; created_at: string }
export type GamifLanding  = { id: string; status: string; created_at: string }
export type GamifPayment  = { id: string; amount_eur: number; status: string; venture_id?: string; created_at: string }
export type GamifMetric   = { views: number }
export type GamifDecision = { venture_id: string; decision: string; created_at: string }

export interface GamificationInput {
  ventures:  GamifVenture[]
  snapshots: GamifSnapshot[]
  workflows: GamifWorkflow[]
  landings:  GamifLanding[]
  payments:  GamifPayment[]
  metrics:   GamifMetric[]
  decisions: GamifDecision[]
  claimed:   string[]
}

// ── Types output ─────────────────────────────────────────────────────────────

export interface AchievementMeta {
  id: string
  label: string
  desc: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  xp: number
  badge: string
  color: string
}

export interface Achievement extends AchievementMeta {
  unlocked: boolean
  pct: number
}

export type AgentLevel = {
  id: string
  level: number
  xpBar: number
}

export interface GamificationResult {
  achievements:  Achievement[]
  userXP:        number
  userLevel:     number
  userXpBar:     number
  userXpToNext:  number
  agentLevels:   AgentLevel[]
  newUnlocks:    string[]
  lastLevelUp:   { agentId: string; fromLevel: number; toLevel: number } | null
}

// ── Static metadata ──────────────────────────────────────────────────────────

export const ACHIEVEMENTS_META: AchievementMeta[] = [
  { id: 'first-mrr',      label: 'First €1k MRR',       desc: 'Atteindre €1 000 de MRR mensuel',            rarity: 'rare',      xp: 250,  badge: '★', color: '#22d3ee' },
  { id: 'ship-7',         label: 'Ship 7 landings',      desc: 'Lancer 7 landings sur 30 jours',             rarity: 'rare',      xp: 200,  badge: '▲', color: '#34d399' },
  { id: 'cac-under-20',   label: 'CAC < €20',            desc: 'Maintenir CAC sous €20 sur 14j',             rarity: 'epic',      xp: 320,  badge: '◈', color: '#fbbf24' },
  { id: '100k-imp',       label: '100k impressions',     desc: 'Cumuler 100 000 impressions',                rarity: 'common',    xp: 100,  badge: '≋', color: '#60a5fa' },
  { id: 'valid-pivot',    label: 'Validate pivot',       desc: 'Réussir un pivot validé en moins de 30j',    rarity: 'epic',      xp: 380,  badge: '✦', color: '#a78bfa' },
  { id: '20-experiments', label: '20 expériences live',  desc: '20 workflows actifs simultanément',          rarity: 'common',    xp:  80,  badge: '◬', color: '#22d3ee' },
  { id: 'first-scale',    label: 'First scale call',     desc: "Premier venture avec score ≥ 75",            rarity: 'epic',      xp: 420,  badge: '◮', color: '#fb923c' },
  { id: '5-ventures',     label: '5 ventures launched',  desc: 'Lancer 5 ventures live',                     rarity: 'rare',      xp: 280,  badge: '◇', color: '#34d399' },
  { id: 'auto-30',        label: '30 workflows n8n',     desc: 'Configurer 30 workflows actifs',             rarity: 'common',    xp: 120,  badge: '⟁', color: '#60a5fa' },
  { id: '20k-mrr',        label: '€20k MRR',             desc: 'Atteindre €20 000 de MRR studio',            rarity: 'legendary', xp: 1200, badge: '✺', color: '#e879f9' },
  { id: '10-ventures',    label: '10 ventures live',     desc: 'Maintenir 10 ventures live',                 rarity: 'epic',      xp: 600,  badge: '◐', color: '#a78bfa' },
  { id: 'season-podium',  label: 'Season podium',        desc: "Finir top 3 d'une season",                   rarity: 'legendary', xp: 1500, badge: '✦', color: '#ff6a3d' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const s = String(v).replace(/[€$, ]/g, '').replace('%', '')
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return String(v).toLowerCase().includes('k') ? n * 1000 : n
}

function clamp(v: number): number { return Math.round(Math.max(0, Math.min(100, v))) }

function levelFromXp(xp: number, divisor: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / divisor))
}

function xpBarFromXp(xp: number, divisor: number): number {
  const lv = levelFromXp(xp, divisor)
  const xpIn = xp - lv * lv * divisor
  const xpNeeded = (lv + 1) * (lv + 1) * divisor - lv * lv * divisor
  return xpNeeded > 0 ? xpIn / xpNeeded : 0
}

// ── Achievement conditions ────────────────────────────────────────────────────

function computeUnlocks(input: GamificationInput): Record<string, { unlocked: boolean; pct: number }> {
  const { ventures, snapshots, workflows, landings, payments, metrics, decisions } = input

  const latestSnap = [...snapshots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  const mrr = parseNum(latestSnap?.mrr)
  const cac = parseNum(latestSnap?.cac)
  const totalViews = metrics.reduce((s, m) => s + (m.views || 0), 0)

  const ms30d = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const deployed30d = landings.filter(
    l => l.status === 'deployed' && now - new Date(l.created_at).getTime() < ms30d
  )
  const enabledWf = workflows.filter(w => w.enabled)
  const maxScore = ventures.length ? Math.max(...ventures.map(v => v.score)) : 0
  const activeVentures = ventures.filter(v => v.stage !== 'archived')

  const recentPivots = decisions.filter(
    d => d.decision === 'pivot' && now - new Date(d.created_at).getTime() < ms30d
  )
  const pivotDone = recentPivots.length > 0
  const paymentDone = recentPivots.some(p =>
    payments.some(pay => pay.venture_id === p.venture_id && pay.status === 'succeeded')
  )

  return {
    'first-mrr':      { unlocked: mrr >= 1000,                      pct: clamp(mrr / 1000 * 100) },
    'ship-7':         { unlocked: deployed30d.length >= 7,           pct: clamp(deployed30d.length / 7 * 100) },
    // cac > 0 guards against "no data" — parseNum(null) returns 0, not a real CAC of zero
    'cac-under-20':   { unlocked: cac > 0 && cac <= 20 && mrr > 0,  pct: cac > 0 ? clamp((40 - cac) / 40 * 100) : 0 },
    '100k-imp':       { unlocked: totalViews >= 100_000,             pct: clamp(totalViews / 100_000 * 100) },
    'valid-pivot':    { unlocked: pivotDone && paymentDone,          pct: (pivotDone ? 50 : 0) + (paymentDone ? 50 : 0) },
    '20-experiments': { unlocked: enabledWf.length >= 20,            pct: clamp(enabledWf.length / 20 * 100) },
    'first-scale':    { unlocked: maxScore >= 75,                    pct: clamp(maxScore / 75 * 100) },
    '5-ventures':     { unlocked: ventures.length >= 5,              pct: clamp(ventures.length / 5 * 100) },
    'auto-30':        { unlocked: workflows.length >= 30,            pct: clamp(workflows.length / 30 * 100) },
    '20k-mrr':        { unlocked: mrr >= 20_000,                     pct: clamp(mrr / 20_000 * 100) },
    '10-ventures':    { unlocked: activeVentures.length >= 10,       pct: clamp(activeVentures.length / 10 * 100) },
    'season-podium':  { unlocked: false,                             pct: 0 },
  }
}

// ── Agent XP ──────────────────────────────────────────────────────────────────

function computeAgentLevels(input: GamificationInput): AgentLevel[] {
  const { ventures, snapshots, workflows, landings, payments, claimed } = input
  const enabledWf = workflows.filter(w => w.enabled)
  const totalRevenue = payments.reduce((s, p) => s + (Number(p.amount_eur) || 0), 0)
  const totalScore = ventures.reduce((s, v) => s + (v.score || 0), 0)

  const raw: Record<string, number> = {
    scout:      ventures.length * 40,
    validation: totalScore * 3,
    builder:    landings.length * 60,
    payment:    totalRevenue / 10,
    marketing:  enabledWf.length * 25,
    analytics:  snapshots.length * 15,
    decision:   claimed.length * 80 + ventures.filter(v => v.score >= 75).length * 200,
  }

  return Object.entries(raw).map(([id, xp]) => ({
    id,
    level: levelFromXp(xp, 50),
    xpBar: xpBarFromXp(xp, 50),
  }))
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeGamification(
  input: GamificationInput
): Omit<GamificationResult, 'lastLevelUp'> {
  const unlocks = computeUnlocks(input)
  const achievements = ACHIEVEMENTS_META.map(meta => ({
    ...meta,
    unlocked: unlocks[meta.id]?.unlocked ?? false,
    pct: unlocks[meta.id]?.pct ?? 0,
  }))

  const agentLevels = computeAgentLevels(input)

  const userXP = input.claimed.reduce((sum, id) => {
    const meta = ACHIEVEMENTS_META.find(a => a.id === id)
    return sum + (meta?.xp ?? 0)
  }, 0)

  const userLevel = levelFromXp(userXP, 100)
  const xpIn = userXP - userLevel * userLevel * 100
  const userXpToNext = (userLevel + 1) * (userLevel + 1) * 100 - userLevel * userLevel * 100
  const userXpBar = userXpToNext > 0 ? xpIn / userXpToNext : 0

  const newUnlocks = achievements
    .filter(a => a.unlocked && !input.claimed.includes(a.id))
    .map(a => a.id)

  return { achievements, userXP, userLevel, userXpBar, userXpToNext, agentLevels, newUnlocks }
}
