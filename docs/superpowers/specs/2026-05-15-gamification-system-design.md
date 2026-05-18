# Gamification System — Design Spec

**Date:** 2026-05-15
**Projet:** kenomi-canvas (Next.js 15 / Supabase SSR)
**Scope:** Câbler la page `/studio/gamification` existante sur des données réelles

---

## Contexte

La page `app/studio/gamification/page.tsx` contient déjà une UI complète :

- `AchievementsTab` : 12 achievements avec cards animées, barre de progression, filtre par rarity, bouton "Réclamer"
- `LevelUpTab` : animation level-up avec orbe, confetti, `LevelBadge`, `StatDelta`, barre XP

Tout est actuellement hardcodé (`unlocked: false, pct: 0`, builder LV 17→18 figé). Le système consiste à brancher cette UI sur les données Supabase réelles sans changer le design visuel.

---

## Architecture retenue

**Approche A — calcul client + snapshot localStorage**

Deux nouveaux fichiers, un fichier modifié, zéro migration DB.

```
Supabase data (7 tables)
  ↓ fetch parallèle au mount
computeGamification(input)   ← lib/gamification.ts (fonction pure)
  ↓ GamificationResult
useGamification()             ← lib/use-gamification.ts (hook React)
  ↓ diff vs localStorage snapshot
GamificationPage              ← app/studio/gamification/page.tsx (branché)
  ├── AchievementsTab(achievements[])
  └── LevelUpTab(lastLevelUp)
```

---

## Section 1 — Couche Données

### Sources Supabase lues en parallèle

| Table                  | Colonnes lues                                     | Rôle                                   |
| ---------------------- | ------------------------------------------------- | -------------------------------------- |
| `ventures`             | `id, name, status, score, stage, mrr, created_at` | nb ventures, MRR total, score max      |
| `kpi_snapshots`        | `mrr, churn, cac, runway, created_at`             | MRR/CAC le plus récent                 |
| `automation_workflows` | `enabled, run_count, created_at`                  | nb workflows actifs / total            |
| `landing_pages`        | `venture_id, status, created_at`                  | nb landings déployées (30j)            |
| `payments`             | `amount_eur, status, venture_id, created_at`      | revenu total, nb paiements par venture |
| `metrics`              | `views`                                           | sum des vues (impressions)             |
| `decisions`            | `venture_id, decision, created_at`                | détection pivots (decision = 'pivot')  |
| `achievement_claims`   | `achievement_id, xp, created_at`                  | XP cumulé, achievements déjà réclamés  |

### Contrat de la fonction

```typescript
type GamificationInput = {
  ventures: Venture[]
  snapshots: KpiSnapshot[]
  workflows: Workflow[]
  landings: LandingPage[]
  payments: Payment[]
  metrics: Metric[]
  claimed: string[] // achievement_ids déjà réclamés
}

type GamificationResult = {
  achievements: Achievement[] // unlocked + pct calculés
  userXP: number // XP total réclamé
  userLevel: number // calculé depuis userXP
  userXpBar: number // 0–1, fraction dans le niveau courant
  userXpToNext: number // XP manquants pour le prochain niveau
  agentLevels: AgentLevel[] // { id, level, xpBar: 0–1 }
  newUnlocks: string[] // ids unlocked non encore réclamés
  lastLevelUp: { agentId: string; fromLevel: number; toLevel: number } | null
}

type AgentLevel = {
  id: string // 'scout' | 'validation' | 'builder' | 'payment' | 'marketing' | 'analytics' | 'decision'
  level: number
  xpBar: number // 0–1
}
```

---

## Section 2 — Conditions d'unlock des 12 Achievements

| ID               | Label               | Condition unlock                                                                     | Source                          | Formule pct                                 |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------- |
| `first-mrr`      | First €1k MRR       | `mrr_latest ≥ 1000`                                                                  | kpi_snapshots                   | `min(mrr/1000, 1) × 100`                    |
| `ship-7`         | Ship 7 landings     | `deployed_30d.length ≥ 7`                                                            | landing_pages                   | `min(count/7, 1) × 100`                     |
| `cac-under-20`   | CAC < €20           | `cac_latest ≤ 20 AND mrr > 0`                                                        | kpi_snapshots                   | `cac ? max(0, (40-cac)/40×100) : 0`         |
| `100k-imp`       | 100k impressions    | `sum(views) ≥ 100_000`                                                               | metrics                         | `min(views/100000, 1) × 100`                |
| `valid-pivot`    | Validate pivot      | `∃ décision 'pivot' dans decisions table en < 30j + ≥1 paiement sur la même venture` | ventures + decisions + payments | `pivotDone ? 50 : 0 + paymentDone ? 50 : 0` |
| `20-experiments` | 20 expériences live | `enabled_workflows.length ≥ 20`                                                      | automation_workflows            | `min(enabled/20, 1) × 100`                  |
| `first-scale`    | First scale call    | `∃ venture.score ≥ 75`                                                               | ventures                        | `min(maxScore/75, 1) × 100`                 |
| `5-ventures`     | 5 ventures launched | `ventures.length ≥ 5`                                                                | ventures                        | `min(count/5, 1) × 100`                     |
| `auto-30`        | 30 workflows n8n    | `workflows.length ≥ 30`                                                              | automation_workflows            | `min(count/30, 1) × 100`                    |
| `20k-mrr`        | €20k MRR            | `mrr_latest ≥ 20_000`                                                                | kpi_snapshots                   | `min(mrr/20000, 1) × 100`                   |
| `10-ventures`    | 10 ventures live    | `actives.length ≥ 10`                                                                | ventures                        | `min(count/10, 1) × 100`                    |
| `season-podium`  | Season podium       | Manuel (future saison)                                                               | —                               | `0` (pas de source actuelle)                |

---

## Section 3 — Formules XP & Niveaux

### User XP & Level

- **Source XP :** somme des `xp` dans `achievement_claims` (table existante)
- **Formule niveau :**

```typescript
userLevel = Math.floor(Math.sqrt(xpTotal / 100))
xpInLevel = xpTotal - userLevel ** 2 * 100
xpToNext = (userLevel + 1) ** 2 * 100 - userLevel ** 2 * 100
userXpBar = xpInLevel / xpToNext // 0–1
```

Paliers indicatifs : LV 1 = 100 XP · LV 5 = 2 500 XP · LV 10 = 10 000 XP · LV 20 = 40 000 XP

### Agent Levels — XP raw par agent

| Agent      | ID           | Formule XP raw                                          | Logique                     |
| ---------- | ------------ | ------------------------------------------------------- | --------------------------- |
| Scout      | `scout`      | `ventures.length × 40`                                  | 1 venture analysée = +40 XP |
| Validation | `validation` | `sum(ventures.score) × 3`                               | score élevé = plus d'XP     |
| Builder    | `builder`    | `landings.length × 60`                                  | 1 landing déployée = +60 XP |
| Payment    | `payment`    | `sum(payments.amount_eur) / 10`                         | €100 encaissé = +10 XP      |
| Marketing  | `marketing`  | `workflows.enabled × 25`                                | 1 workflow actif = +25 XP   |
| Analytics  | `analytics`  | `snapshots.length × 15`                                 | 1 snapshot KPI = +15 XP     |
| Decision   | `decision`   | `claimed.length × 80 + ventures[score≥75].length × 200` | agent le plus puissant      |

```typescript
agentLevel(xpRaw) = Math.floor(Math.sqrt(xpRaw / 50))
agentXpBar(xpRaw) = fraction dans le niveau courant   // 0–1
```

Seuil 50 (vs 100 user) : progression agents plus rapide.

---

## Section 4 — Intégration dans le code

### Nouveaux fichiers

**`lib/gamification.ts`**

- Exporte `computeGamification(input: GamificationInput): GamificationResult`
- Fonction pure, zéro dépendance React, testable unitairement
- Exporte les types `GamificationInput`, `GamificationResult`, `AgentLevel`

**`lib/use-gamification.ts`**

- Hook `useGamification(): GamificationResult & { loading: boolean }`
- Fetch parallèle des 7 tables Supabase via `createSupabaseBrowser()`
- Appelle `computeGamification(input)`
- Lit le snapshot localStorage `kenomi-agent-levels` pour comparer les niveaux
- Si `newLevel > prevLevel` pour un agent → stocke `lastLevelUp = { agentId, fromLevel, toLevel }` dans le state
- Met à jour le snapshot localStorage après comparaison

### Fichier modifié — `app/studio/gamification/page.tsx`

Changements minimaux — on remplace les constantes figées :

```typescript
// AVANT
const ACHIEVEMENTS = [ { unlocked: false, pct: 0 }, ... ]
const fromLevel = 17, toLevel = 18  // builder figé

// APRÈS
const { achievements, userXP, userLevel, userXpBar, userXpToNext,
        agentLevels, lastLevelUp, loading } = useGamification()
```

- `AchievementsTab` reçoit `achievements` (prop au lieu de constante module)
- `LevelUpTab` reçoit `lastLevelUp` (agentId, fromLevel, toLevel) à la place des valeurs hardcodées
- Header pills : affichent `LV {userLevel}` et `{userXP} XP`
- `ACHIEVEMENTS` constant reste comme définition des métadonnées (label, desc, xp, badge, rarity, color) — seuls `unlocked` et `pct` viennent du hook

### Flux au chargement

1. **mount** → `useGamification()` démarre, `loading = true`
2. **fetch** → 7 requêtes Supabase en parallèle (`Promise.all`)
3. **compute** → `computeGamification(input)` retourne le résultat
4. **diff** → compare `agentLevels` calculés vs snapshot localStorage → détecte level-ups → stocke `lastLevelUp`
5. **render** → page se met à jour, `AchievementsTab` montre les vrais unlocks, `LevelUpTab` anime si level-up détecté

### Zéro migration DB

Toutes les tables sont déjà présentes : `achievement_claims`, `ventures`, `kpi_snapshots`, `automation_workflows`, `landing_pages`, `payments`, `metrics`, `decisions`.

---

## Fichiers touchés

| Fichier                            | Action                   |
| ---------------------------------- | ------------------------ |
| `lib/gamification.ts`              | Créer                    |
| `lib/use-gamification.ts`          | Créer                    |
| `app/studio/gamification/page.tsx` | Modifier (brancher hook) |

## Hors scope

- Leaderboard multi-utilisateur / saisons
- Notifications push à l'unlock
- `season-podium` — restera manuel jusqu'à implémentation future des saisons
