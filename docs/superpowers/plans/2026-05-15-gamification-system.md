# Gamification System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher la page `/studio/gamification` sur des données Supabase réelles — achievements avec unlock/pct calculés, XP user, niveaux par agent, détection de level-up.

**Architecture:** Fonction pure `computeGamification()` dans `lib/gamification.ts` + hook React `useGamification()` dans `lib/use-gamification.ts`. La page existante accepte les données comme props au lieu de constantes figées. Zéro migration DB.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase SSR (`createSupabaseBrowser`), Vitest (tests unitaires)

---

## File Map

| Fichier | Action | Responsabilité |
|---|---|---|
| `lib/gamification.ts` | Créer | Types, `ACHIEVEMENTS_META`, `computeGamification()` pure |
| `lib/use-gamification.ts` | Créer | Hook React, fetch Supabase, diff localStorage |
| `app/studio/gamification/page.tsx` | Modifier | Brancher hook, passer props aux tabs |
| `lib/gamification.test.ts` | Créer | Tests unitaires de `computeGamification` |
| `vitest.config.ts` | Créer | Configuration Vitest |
| `package.json` | Modifier | Ajouter script `test` |

---

## Task 0 — Setup Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1 : Installer Vitest**

```bash
npm install -D vitest
```

Expected output: `added 1 package (or similar)`, no errors.

- [ ] **Step 2 : Créer `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 3 : Ajouter le script `test` dans `package.json`**

Ajouter dans la clé `"scripts"` :

```json
"test": "vitest run"
```

- [ ] **Step 4 : Vérifier**

```bash
npx vitest run
```

Expected: `No test files found` (pas d'erreur).

- [ ] **Step 5 : Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest"
```

---

## Task 1 — `lib/gamification.ts` (types + ACHIEVEMENTS_META + computeGamification)

**Files:**
- Create: `lib/gamification.ts`
- Create: `lib/gamification.test.ts`

### Step 1 — Écrire les tests en premier

- [ ] **Step 1a : Créer `lib/gamification.test.ts` avec les tests failing**

```typescript
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

  it('userLevel = 1 avec 100 XP', () => {
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

  it('season-podium : toujours locked, pct = 0', () => {
    const r = computeGamification(EMPTY_INPUT)
    const a = r.achievements.find(a => a.id === 'season-podium')!
    expect(a.unlocked).toBe(false)
    expect(a.pct).toBe(0)
  })
})
```

- [ ] **Step 1b : Vérifier que les tests échouent**

```bash
npm test
```

Expected: tous les tests FAIL avec `Cannot find module './gamification'`.

### Step 2 — Implémenter `lib/gamification.ts`

- [ ] **Step 2a : Créer `lib/gamification.ts`**

```typescript
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
  return String(v).toLowerCase().includes('k') ? n * 1000 : (isNaN(n) ? 0 : n)
}

function clamp(v: number): number { return Math.round(Math.max(0, Math.min(100, v))) }

function levelFromXp(xp: number, divisor: number): number {
  return Math.floor(Math.sqrt(xp / divisor))
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
```

- [ ] **Step 2b : Lancer les tests**

```bash
npm test
```

Expected: tous les tests PASS.

- [ ] **Step 2c : Commit**

```bash
git add lib/gamification.ts lib/gamification.test.ts
git commit -m "feat(gamification): computeGamification pure function + types"
```

---

## Task 2 — `lib/use-gamification.ts` (hook React)

**Files:**
- Create: `lib/use-gamification.ts`

- [ ] **Step 1 : Créer `lib/use-gamification.ts`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import {
  computeGamification,
  ACHIEVEMENTS_META,
  type GamificationInput,
  type GamificationResult,
} from '@/lib/gamification'

const LEVELS_SNAP_KEY = 'kenomi-agent-levels'

const INITIAL: GamificationResult = {
  achievements: ACHIEVEMENTS_META.map(a => ({ ...a, unlocked: false, pct: 0 })),
  userXP: 0, userLevel: 0, userXpBar: 0, userXpToNext: 100,
  agentLevels: [], newUnlocks: [], lastLevelUp: null,
}

export function useGamification(): GamificationResult & { loading: boolean } {
  const { user } = useAuth()
  const [result, setResult] = useState<GamificationResult>(INITIAL)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }

    const supabase = createSupabaseBrowser()

    async function load() {
      // Step 1: fetch studio ventures for this user (RLS + explicit filter)
      const { data: ventures } = await supabase
        .from('ventures')
        .select('id, score, mrr, stage, created_at')
        .eq('user_id', user.id)

      const ventureIds = (ventures ?? []).map((v: { id: string }) => v.id)

      // Step 2: fetch all other data in parallel
      const [
        { data: snapshots },
        { data: workflows },
        { data: landings },
        { data: payments },
        { data: metrics },
        { data: decisions },
        { data: claims },
      ] = await Promise.all([
        supabase.from('kpi_snapshots').select('mrr, cac, created_at').eq('user_id', user.id),
        supabase.from('automation_workflows').select('id, enabled, created_at').eq('user_id', user.id),
        ventureIds.length
          ? supabase.from('landing_pages').select('id, status, created_at').in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase.from('payments').select('id, amount_eur, status, venture_id, created_at').in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase.from('metrics').select('views').in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase.from('decisions').select('venture_id, decision, created_at').in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        supabase.from('achievement_claims').select('achievement_id').eq('user_id', user.id),
      ])

      const input: GamificationInput = {
        ventures:  (ventures  ?? []) as GamificationInput['ventures'],
        snapshots: (snapshots ?? []) as GamificationInput['snapshots'],
        workflows: (workflows ?? []) as GamificationInput['workflows'],
        landings:  (landings  ?? []) as GamificationInput['landings'],
        payments:  (payments  ?? []) as GamificationInput['payments'],
        metrics:   (metrics   ?? []) as GamificationInput['metrics'],
        decisions: (decisions ?? []) as GamificationInput['decisions'],
        claimed:   (claims ?? []).map((c: { achievement_id: string }) => c.achievement_id),
      }

      const computed = computeGamification(input)

      // Detect level-ups by comparing with localStorage snapshot
      let lastLevelUp: GamificationResult['lastLevelUp'] = null
      try {
        const snap = JSON.parse(localStorage.getItem(LEVELS_SNAP_KEY) || '{}') as Record<string, number>
        for (const al of computed.agentLevels) {
          const prev = snap[al.id] ?? 0
          if (al.level > prev) {
            lastLevelUp = { agentId: al.id, fromLevel: prev, toLevel: al.level }
            break
          }
        }
        const newSnap: Record<string, number> = {}
        for (const al of computed.agentLevels) newSnap[al.id] = al.level
        localStorage.setItem(LEVELS_SNAP_KEY, JSON.stringify(newSnap))
      } catch { /* localStorage non disponible (SSR guard) */ }

      setResult({ ...computed, lastLevelUp })
      setLoading(false)
    }

    load()
  }, [user])

  return { ...result, loading }
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add lib/use-gamification.ts
git commit -m "feat(gamification): useGamification hook"
```

---

## Task 3 — Brancher la page `app/studio/gamification/page.tsx`

**Files:**
- Modify: `app/studio/gamification/page.tsx`

### Changements à effectuer

Quatre modifications indépendantes dans ce fichier.

---

#### 3-A : Imports + supprimer `ACHIEVEMENTS` local

- [ ] **Step 3-A-1 : Remplacer le bloc import en tête de fichier**

Trouver :
```typescript
import { agentById, useIsMobile } from '@/lib/studio-utils'
```

Remplacer par :
```typescript
import { agentById, useIsMobile } from '@/lib/studio-utils'
import { ACHIEVEMENTS_META, type Achievement, type AgentLevel } from '@/lib/gamification'
import { useGamification } from '@/lib/use-gamification'
```

- [ ] **Step 3-A-2 : Supprimer le bloc `const ACHIEVEMENTS: Achievement[] = [...]`**

Supprimer entièrement les lignes 31 à 44 (la constante `ACHIEVEMENTS` et ses 12 entrées). La définition de l'interface `Achievement` (lignes 17–28) reste inchangée.

---

#### 3-B : Modifier `AchievementsTab` pour accepter `achievements` en prop

- [ ] **Step 3-B-1 : Changer la signature de `AchievementsTab`**

Trouver :
```typescript
function AchievementsTab() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<string>('all')
```

Remplacer par :
```typescript
function AchievementsTab({ achievements }: { achievements: Achievement[] }) {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<string>('all')
```

- [ ] **Step 3-B-2 : Remplacer les 5 usages de `ACHIEVEMENTS` dans `AchievementsTab`**

Trouver :
```typescript
  const filtered = ACHIEVEMENTS.filter(a => {
```
Remplacer par :
```typescript
  const filtered = achievements.filter(a => {
```

Trouver :
```typescript
  const unlockedCount = ACHIEVEMENTS.filter(a => a.unlocked).length
  const totalCount = ACHIEVEMENTS.length
  const xpEarned = ACHIEVEMENTS.filter(a => a.unlocked).reduce((s, a) => s + a.xp, 0)
  const xpPossible = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0)
  const justUnlocked = ACHIEVEMENTS[0]
```
Remplacer par :
```typescript
  const unlockedCount = achievements.filter(a => a.unlocked).length
  const totalCount = achievements.length
  const xpEarned = achievements.filter(a => a.unlocked).reduce((s, a) => s + a.xp, 0)
  const xpPossible = achievements.reduce((s, a) => s + a.xp, 0)
  const justUnlocked = achievements.find(a => !a.unlocked) ?? achievements[0] ?? { ...ACHIEVEMENTS_META[0], unlocked: false, pct: 0 }
```

---

#### 3-C : Modifier `LevelUpTab` pour accepter `lastLevelUp` et `agentLevels` en props

- [ ] **Step 3-C-1 : Changer la signature de `LevelUpTab`**

Trouver :
```typescript
function LevelUpTab() {
  const agent = agentById('builder')
  const isMobile = useIsMobile()
  const fromLevel = 17, toLevel = 18
  const [lvl, setLvl] = useState(toLevel)
  const [phase, setPhase] = useState<'locked' | 'burst'>('locked')
```

Remplacer par :
```typescript
function LevelUpTab({
  lastLevelUp,
  agentLevels,
}: {
  lastLevelUp: { agentId: string; fromLevel: number; toLevel: number } | null
  agentLevels: AgentLevel[]
}) {
  const agentId  = lastLevelUp?.agentId ?? 'builder'
  const agent    = agentById(agentId)
  const isMobile = useIsMobile()
  const fromLevel = lastLevelUp?.fromLevel ?? (agentLevels.find(a => a.id === agentId)?.level ?? 1)
  const toLevel   = lastLevelUp?.toLevel   ?? fromLevel + 1
  const [lvl, setLvl] = useState(toLevel)
  const [phase, setPhase] = useState<'locked' | 'burst'>('locked')
```

- [ ] **Step 3-C-2 : Mettre à jour la dépendance du `useEffect` dans `LevelUpTab`**

Trouver (dans `LevelUpTab`, le useEffect de l'animation) :
```typescript
  useEffect(() => {
    let idA: ReturnType<typeof setTimeout>, idB: ReturnType<typeof setTimeout>
    function loop() {
      setLvl(fromLevel); setPhase('locked')
      idA = setTimeout(() => { setPhase('burst'); setLvl(toLevel) }, 500)
      idB = setTimeout(loop, 5200)
    }
    loop()
    return () => { clearTimeout(idA); clearTimeout(idB) }
  }, [])
```

Remplacer par :
```typescript
  useEffect(() => {
    let idA: ReturnType<typeof setTimeout>, idB: ReturnType<typeof setTimeout>
    function loop() {
      setLvl(fromLevel); setPhase('locked')
      idA = setTimeout(() => { setPhase('burst'); setLvl(toLevel) }, 500)
      idB = setTimeout(loop, 5200)
    }
    loop()
    return () => { clearTimeout(idA); clearTimeout(idB) }
  }, [fromLevel, toLevel])
```

- [ ] **Step 3-C-3 : Mettre à jour le XP bar dans `LevelUpTab`**

Trouver dans `LevelUpTab` la ligne hardcodée du XP bar :
```typescript
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: agent.color, letterSpacing: '.1em' }}>
              1000 / 1000 → 124 / 1100 (next: LV {toLevel + 1})
            </span>
```

Remplacer par :
```typescript
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: agent.color, letterSpacing: '.1em' }}>
              LV {toLevel} → LV {toLevel + 1}
            </span>
```

---

#### 3-D : Brancher `useGamification()` dans `GamificationPage` + passer les props

- [ ] **Step 3-D-1 : Ajouter le hook dans `GamificationPage`**

Trouver dans `GamificationPage` :
```typescript
export default function GamificationPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'levelup' | 'achievements'>('levelup')
```

Remplacer par :
```typescript
export default function GamificationPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'levelup' | 'achievements'>('levelup')
  const { achievements, agentLevels, lastLevelUp, userLevel, userXP, loading } = useGamification()
```

- [ ] **Step 3-D-2 : Passer les props aux tabs dans le JSX**

Trouver :
```typescript
      {tab === 'levelup' ? <LevelUpTab /> : <AchievementsTab />}
```

Remplacer par :
```typescript
      {tab === 'levelup'
        ? <LevelUpTab lastLevelUp={lastLevelUp} agentLevels={agentLevels} />
        : <AchievementsTab achievements={achievements} />}
```

- [ ] **Step 3-D-3 : Afficher `userLevel` et `userXP` dans le header**

Trouver dans le header (les pills à droite, zone `display: 'flex', alignItems: 'center', gap: 6`) :
```typescript
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <button onClick={() => router.push('/studio')} style={{
```

Remplacer par :
```typescript
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!loading && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em',
              padding: '4px 10px', borderRadius: 999,
              background: surface2, color: muted, border: `1px solid ${line}`,
            }}>LV {userLevel} · {userXP} XP</span>
          )}
          {!isMobile && (
            <button onClick={() => router.push('/studio')} style={{
```

---

#### 3-E : Build et commit

- [ ] **Step 3-E-1 : Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3-E-2 : Build Next.js**

```bash
npx next build 2>&1 | tail -20
```

Expected: build réussi, `/studio/gamification` dans la liste des routes.

- [ ] **Step 3-E-3 : Lancer les tests**

```bash
npm test
```

Expected: tous les tests PASS.

- [ ] **Step 3-E-4 : Commit**

```bash
git add app/studio/gamification/page.tsx
git commit -m "feat(gamification): brancher useGamification sur la page"
```

---

## Task 4 — Push + Deploy

- [ ] **Step 1 : Push**

```bash
git push origin main
```

- [ ] **Step 2 : Déclencher le déploiement Coolify**

```bash
curl -s "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1&force=false" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```

Expected: `{"deployments":[{"message":"Application kenomi-canvas deployment queued.",...}]}`

---

## Récapitulatif spec → tasks

| Spec | Task |
|---|---|
| Types GamificationInput / GamificationResult | Task 1 |
| ACHIEVEMENTS_META (12 achievements) | Task 1 |
| Conditions unlock des 12 achievements | Task 1 |
| Formule User XP + Level (sqrt/100) | Task 1 |
| Formules Agent XP par agent | Task 1 |
| newUnlocks | Task 1 |
| Hook useGamification() + fetch 8 tables | Task 2 |
| Détection level-up via localStorage snapshot | Task 2 |
| AchievementsTab branchée sur prop achievements | Task 3-B |
| LevelUpTab branchée sur lastLevelUp + agentLevels | Task 3-C |
| Header userLevel + userXP | Task 3-D |
| Deploy | Task 4 |
