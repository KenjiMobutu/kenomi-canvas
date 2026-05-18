# Suite de l'audit Kenomi Canvas — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adresser les 9 items priorisés de l'audit `2026-05-18-audit-complet.md` pour passer de "production-ready supervisé" à "100% exploitation autonome continue". Couvre sécurité (RLS), stabilité (setState, tests intégration), maintenabilité (composants UI extraits, logger), observabilité (tracking LLM, pages erreur, /api/metrics) et performance (bundle analyzer).

**Architecture:** S'appuie sur l'existant — Supabase RLS, Vitest, `agent_runs` déjà persisté, `CkShell`, `lib/autonomy/`. Les nouvelles colonnes SQL passent par les patterns du runbook `database-migrations.md`. Les composants UI extraits doivent être drop-in replacements sans changer le look existant.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase, Vitest, Zod, Pino (nouveau).

---

## Pre-flight Check

- [ ] **Step 1: État de base**

```bash
git status
git log --oneline -3
npm run typecheck
npm run lint 2>&1 | grep -c "warning"
npm test
npm run supabase:validate
```

Expected:

- branche `codex-finalisation-alignement-kenomi` propre et synchro
- typecheck 0 erreur
- ~51 warnings ESLint
- 240/240 tests
- supabase remote ok

- [ ] **Step 2: Brancher Docker (si refactor UI inclus)**

Pas requis — toute la validation passe par les tests locaux et `supabase:validate`. Docker reste optionnel.

---

## Phase P1 — Sécurité (bloquant go-live)

### Task P1.1: DROP tables legacy sans RLS

**Files:**

- Create: `supabase/migrations/20260518_drop_legacy_tables.sql`
- Modify: `scripts/validate-supabase-remote.mjs`

**Context:** Les tables `kenomi_jobs` et `saas_opportunities` sont en prod sans RLS, sans `user_id`, sans référence code applicatif. Elles datent d'un état antérieur du projet. Décision: DROP.

- [ ] **Step 1: Inspecter le contenu une dernière fois**

```bash
set -a && source .env.local && set +a && curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query": "select count(*) as kenomi_jobs from public.kenomi_jobs; select count(*) as saas_opportunities from public.saas_opportunities;"}'
```

Si counts > 0 : faire un dump JSON avant DROP (au cas où).

- [ ] **Step 2: Écrire la migration**

```sql
-- supabase/migrations/20260518_drop_legacy_tables.sql
DROP TABLE IF EXISTS public.kenomi_jobs;
DROP TABLE IF EXISTS public.saas_opportunities;
```

- [ ] **Step 3: Appliquer en prod**

```bash
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/20260518_drop_legacy_tables.sql)"
```

Expected: `[]`

- [ ] **Step 4: Valider qu'il ne reste aucune table sans RLS**

Étendre `scripts/validate-supabase-remote.mjs` pour ajouter le check :

```js
// Après les checks existants
const rlsResp = await fetch(`${supabaseUrl}/pg/query`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: "select tablename from pg_tables where schemaname='public' and rowsecurity = false",
  }),
})
const tablesWithoutRls = await rlsResp.json()
if (Array.isArray(tablesWithoutRls) && tablesWithoutRls.length > 0) {
  console.error('tables sans RLS:', tablesWithoutRls.map((t) => t.tablename).join(', '))
  process.exit(1)
}
console.log('ok all tables have RLS enabled')
```

Run: `npm run supabase:validate`
Expected: `ok all tables have RLS enabled` puis `supabase remote ok`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518_drop_legacy_tables.sql scripts/validate-supabase-remote.mjs
git commit -m "feat(security): drop tables legacy sans RLS (kenomi_jobs, saas_opportunities)

Ces tables n'étaient référencées nulle part dans le code et n'avaient ni RLS
ni colonne user_id. Validation distante étendue pour empêcher la régression."
```

---

## Phase P2 — Stabilité (corrections critiques)

### Task P2.1: Corriger les setState in effect

**Files:**

- Modify: `app/studio/api-keys/page.tsx` (1 occurrence)
- Modify: `app/studio/automations/page.tsx` (2 occurrences ligne 1179, 1183)
- Modify: `app/studio/chat/page.tsx` (3 occurrences lignes 67, 98, 103)
- Modify: `app/studio/documents/page.tsx`
- Modify: `app/studio/gamification/page.tsx`
- Modify: `app/studio/marketing/page.tsx`
- Modify: `app/studio/page.tsx` (ligne 1846)
- Modify: `app/studio/ventures/page.tsx`
- Modify: `components/CkShell.tsx`
- Modify: `components/StudioSidebar.tsx`
- Modify: `components/studio/infra/ProxmoxDashboard.tsx`

**Context:** Le lint react-hooks 16 détecte les `setState` synchrones dans un effect — cause de cascading renders. 3 patterns possibles :

1. **Init depuis localStorage / params** → utiliser `useState(() => readInitial())` au lieu de `useState(initial) + useEffect(setFromInitial)`.
2. **Sync state ↔ état dérivé** → utiliser `useMemo` ou calculer à la volée.
3. **Effet de bord nécessaire (fetch, subscription)** → garder l'effect mais batcher avec `flushSync` ou laisser tel quel si le warning est faux positif.

- [ ] **Step 1: Audit ciblé**

Pour chaque occurrence :

```bash
grep -n -B5 "setState\|setX\|setCount\|setEvent" <file> | head -40
```

Identifier le pattern (init, sync, fetch) et choisir la stratégie.

- [ ] **Step 2: Pattern type — init depuis ext**

Avant :

```tsx
const [tab, setTab] = useState<string>('jobs')
useEffect(() => {
  setTab(searchParams.get('tab') ?? 'jobs')
}, [searchParams])
```

Après (init lazy + sync via key/route) :

```tsx
const tab = searchParams.get('tab') ?? 'jobs'
// supprimer le useState + useEffect
```

OU (si vraiment besoin de state) :

```tsx
const initialTab = useMemo(() => searchParams.get('tab') ?? 'jobs', [])
const [tab, setTab] = useState(initialTab)
```

- [ ] **Step 3: Pattern type — sync dérivé**

Avant :

```tsx
const [filtered, setFiltered] = useState<Item[]>([])
useEffect(() => {
  setFiltered(items.filter((i) => i.status === status))
}, [items, status])
```

Après :

```tsx
const filtered = useMemo(() => items.filter((i) => i.status === status), [items, status])
```

- [ ] **Step 4: Appliquer un fichier à la fois**

Ordre suggéré (du moins risqué au plus complexe) :

1. `components/CkShell.tsx`
2. `components/StudioSidebar.tsx`
3. `components/studio/infra/ProxmoxDashboard.tsx`
4. `app/studio/api-keys/page.tsx`
5. `app/studio/documents/page.tsx`
6. `app/studio/marketing/page.tsx`
7. `app/studio/ventures/page.tsx`
8. `app/studio/chat/page.tsx`
9. `app/studio/automations/page.tsx`
10. `app/studio/gamification/page.tsx`
11. `app/studio/page.tsx`

Pour chaque fichier :

```bash
# Avant
npm run lint 2>&1 | grep "setState synchronously" | grep <file> | wc -l
# Faire les corrections
# Après
npm run lint 2>&1 | grep "setState synchronously" | grep <file> | wc -l
npm test
```

- [ ] **Step 5: Validation finale**

```bash
npm run lint 2>&1 | grep -c "setState synchronously"
```

Expected: `0`

```bash
npm test
npm run typecheck
npm run build
```

Expected: tous verts, 240/240 tests.

- [ ] **Step 6: Commit (un seul commit pour toute la phase, ou splittable par fichier)**

```bash
git commit -m "fix(react): supprime les setState synchrones dans les effects

11 fichiers corrigés. Patterns utilisés:
- init lazy useState(() => ...) au lieu de useEffect(setFoo)
- useMemo pour les valeurs dérivées
- suppression d'effects redondants

Impact: élimine les cascading renders détectés par react-hooks/set-state-in-effect."
```

---

### Task P2.2: Tests d'intégration routes publiques

**Files:**

- Create: `lib/api-routes/waitlist.test.ts`
- Create: `lib/api-routes/events.test.ts`
- Create: `lib/api-routes/health.test.ts`

**Context:** Les routes publiques (`/api/waitlist`, `/api/events`, `/api/health`) n'ont pas de tests directs. Le smoke HTTP couvre les status codes mais pas la logique métier (validation Zod, rate-limit, insertion DB).

- [ ] **Step 1: Pattern fake Supabase**

Réutiliser le helper de `lib/autonomy/full-loop.test.ts` (createFakeSupabase). Extraire dans `lib/test-utils/fake-supabase.ts` si pas déjà fait.

- [ ] **Step 2: Test waitlist**

```ts
// lib/api-routes/waitlist.test.ts
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/waitlist/route'

describe('POST /api/waitlist', () => {
  it('400 si email manquant', async () => {
    const req = new Request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 si email invalide', async () => {
    const req = new Request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pas-un-email', slug: 'test' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rate-limit après 5 requêtes identiques', async () => {
    // Mock supabaseAdmin pour bypass insert réel
    vi.mock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          insert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'v1' }, error: null }) }),
          }),
        }),
      },
    }))
    const body = JSON.stringify({ email: 'test@kenomi.eu', slug: 'venture-1' })
    for (let i = 0; i < 5; i++) {
      await POST(
        new Request('http://localhost/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
          body,
        })
      )
    }
    const res = await POST(
      new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body,
      })
    )
    expect(res.status).toBe(429)
  })
})
```

Run: `npx vitest run lib/api-routes/waitlist.test.ts`
Expected: 3/3 PASS

- [ ] **Step 3: Test events**

```ts
// lib/api-routes/events.test.ts
import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/events/route'

describe('POST /api/events', () => {
  it('400 si event_type manquant', async () => {
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('400 si event_type non whitelisté', async () => {
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'sql_injection', slug: 'v1' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('400 si slug manquant', async () => {
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'page_view' }),
    })
    expect((await POST(req)).status).toBe(400)
  })
})
```

- [ ] **Step 4: Test health**

```ts
// lib/api-routes/health.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.HEALTH_DATABASE_REQUIRED
  })

  it('200 si toutes les dépendances OK', async () => {
    // Mock prisma + supabase pour renvoyer success
    // ... pattern selon implémentation actuelle
  })

  it('503 degraded si DB requise et indisponible', async () => {
    // Mock prisma pour throw
  })

  it('200 si HEALTH_DATABASE_REQUIRED=false même avec DB indisponible', async () => {
    process.env.HEALTH_DATABASE_REQUIRED = 'false'
    // Mock prisma pour throw
    // Vérifier status === 200
  })
})
```

- [ ] **Step 5: Run + commit**

```bash
npx vitest run lib/api-routes/
npm test
```

Expected: 240 → ~250 tests.

```bash
git add lib/api-routes/
git commit -m "test: tests intégration routes publiques (waitlist, events, health)"
```

---

## Phase P3 — Maintenabilité

### Task P3.1: Extraire composants UI réutilisables

**Files:**

- Create: `components/studio/KpiCard.tsx`
- Create: `components/studio/StatusBadge.tsx`
- Create: `components/studio/Sparkline.tsx`
- Create: `components/studio/SectionPanel.tsx`
- Create: `components/studio/EmptyState.tsx`
- Modify: `app/studio/analytics/page.tsx` (utiliser KpiCard)
- Modify: `app/studio/marketing/page.tsx` (utiliser StatusBadge)
- Modify: `app/studio/agents/page.tsx` (utiliser SectionPanel)

**Context:** 5 composants visuels sont dupliqués dans 5-9 pages. Les extraire réduit ~800 lignes au total et accélère le HMR.

- [ ] **Step 1: KpiCard**

```tsx
// components/studio/KpiCard.tsx
'use client'
import { surface, surface2, line, text, muted, muted2 } from '@/lib/ck-vars'

export interface KpiCardProps {
  label: string
  value: string
  delta?: string
  color: string
  trend?: number[]
  /** Optionnel: SVG path déjà calculé (sparkPath/areaPath) */
  sparkPath?: string
}

export function KpiCard({ label, value, delta, color, trend, sparkPath }: KpiCardProps) {
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 12,
        padding: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
          opacity: 0.7,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {delta && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              padding: '2px 6px',
              borderRadius: 3,
              background: `${color}1a`,
              color,
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: 6,
          color: text,
        }}
      >
        {value}
      </div>
      {sparkPath && (
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 22, marginTop: 4, display: 'block' }}
        >
          <path d={sparkPath} fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      )}
    </div>
  )
}
```

- [ ] **Step 2: StatusBadge**

```tsx
// components/studio/StatusBadge.tsx
'use client'
import { muted2 } from '@/lib/ck-vars'

const COLORS: Record<string, string> = {
  draft: '#94a3b8',
  blocked: '#fbbf24',
  approved: '#22d3ee',
  published: '#34d399',
  failed: '#f87171',
  rejected: '#94a3b8',
  pending: '#fbbf24',
  running: '#22d3ee',
  completed: '#34d399',
  cancelled: '#94a3b8',
}

export function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const color = COLORS[status] ?? muted2
  const padding = size === 'md' ? '4px 10px' : '3px 7px'
  const fontSize = size === 'md' ? 10 : 9
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize,
        padding,
        borderRadius: 4,
        background: `${color}22`,
        color,
        border: `1px solid ${color}40`,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {status}
    </span>
  )
}
```

- [ ] **Step 3: Sparkline + SectionPanel + EmptyState**

Pattern similaire, factoriser depuis les pages existantes.

- [ ] **Step 4: Migrer une page à la fois**

Pour chaque page modifiée :

```bash
# Avant
wc -l app/studio/<page>/page.tsx
# Après extraction
wc -l app/studio/<page>/page.tsx
# Vérifier compile + test
npm run typecheck
npm run dev # smoke visuel
```

Cible : -150 à -250 lignes par page.

- [ ] **Step 5: Tests visuels**

Pas de tests unitaires pour ces composants (UI pur). Vérifier dans `npm run dev` :

- `/studio/analytics` : Live KPIs + bandes de KPI legacy s'affichent identiques
- `/studio/marketing` : badges status drafts identiques
- `/studio/agents` : tabs Autonomy Ops + badge budget breach identiques

- [ ] **Step 6: Commit**

```bash
git add components/studio/ app/studio/
git commit -m "refactor(ui): extrait KpiCard, StatusBadge, Sparkline, SectionPanel, EmptyState"
```

---

### Task P3.2: Logger structuré (Pino)

**Files:**

- Modify: `package.json` (deps: `pino`, `pino-pretty`)
- Create: `lib/logger.ts`
- Modify: `app/studio/documents/page.tsx` (console.error → logger)
- Modify: `app/api/studio/infra/proxmox/route.ts`
- Modify: `app/api/waitlist/route.ts`
- Modify: `app/api/studio/automations/trigger/route.ts`
- Modify: `lib/venture-events.ts`
- Modify: `lib/llm-client.ts`
- Modify: `lib/audit-log.ts`
- Modify: `lib/proxmox-client.ts`

- [ ] **Step 1: Installer Pino**

```bash
npm install pino pino-pretty
```

- [ ] **Step 2: Wrapper logger**

```ts
// lib/logger.ts
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  base: { service: 'kenomi-canvas' },
})

export function logError(scope: string, error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error)
  logger.error({ scope, ...context, error: message }, `[${scope}] ${message}`)
}

export function logWarn(scope: string, message: string, context?: Record<string, unknown>) {
  logger.warn({ scope, ...context }, `[${scope}] ${message}`)
}

export function logInfo(scope: string, message: string, context?: Record<string, unknown>) {
  logger.info({ scope, ...context }, `[${scope}] ${message}`)
}
```

- [ ] **Step 3: Remplacer console partout**

Pattern :

```diff
- console.error('[waitlist]', err)
+ logError('waitlist', err)

- console.warn('[venture-events]', result.error)
+ logWarn('venture-events', result.error)
```

Liste exacte (11 occurrences identifiées dans l'audit).

- [ ] **Step 4: Tests + commit**

```bash
npm test
npm run typecheck
git add lib/logger.ts package.json package-lock.json [tous les fichiers modifiés]
git commit -m "refactor(logs): logger Pino structuré remplace console.* (11 occurrences)"
```

---

### Task P3.3: Documenter la stratégie Prisma vs Supabase JS

**Files:**

- Modify: `CLAUDE.md`
- Create: `lib/README.md`

- [ ] **Step 1: Section CLAUDE.md**

Ajouter dans la section "Architecture générale" :

```markdown
### Stratégie DB long terme

**Status: stack hybride documentée**

L'app utilise deux clients DB :

1. **Prisma** (`lib/db.ts`) — pour les modèles legacy ventures (Idea, Venture, LandingPage, Payment, Campaign, Decision, Metric, Waitlist, BudgetRequest)
2. **Supabase JS** (`lib/supabase-*.ts`) — pour tout le reste (autonomy, conversations, automations, agent runs, venture_events, campaign_drafts...)

**Règle:**

- Nouveau code → Supabase JS exclusivement.
- Modifications de modèles legacy → garder Prisma (regen le client après changement schéma).
- À terme, Prisma sera retiré (ticket #TBD) une fois toutes les routes ventures migrées.

**Pour les Server Actions :** toujours `lib/supabase-admin.ts` (service role).
Pour les routes API authentifiées : `requireAllowedUser` retourne `supabase` client scopé user.
```

- [ ] **Step 2: lib/README.md**

```markdown
# lib/ — Conventions

## DB

- `db.ts` : Prisma client (legacy ventures)
- `supabase-admin.ts` : service role (server-side)
- `supabase-browser.ts` : anon key + cookies (client-side)
- `auth-server.ts` : `requireAllowedUser()` pour routes API

## Modules métier

- `autonomy/` : moteur d'autonomie (config, policy, executor)
- `marketing/` : drafts + adapters publication
- `stripe/` : checkout + webhook
- `coolify/` : client API + déploiements
- `metrics/` : agrégation venture_events → KPIs
- `agent-output-schemas.ts` : schémas Zod par agent

## Helpers

- `logger.ts` : Pino structuré (remplace console.\*)
- `security.ts` : SSRF guard (isAllowedWebhookUrl, isAllowedOllamaUrl)
- `audit-log.ts` : insertAuditEvent vers agent_events
- `rate-limit.ts` : in-memory rate-limit (mono-instance)
- `validation.ts` : email + slug validators
- `api-response.ts` : apiOk / apiError helpers
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md lib/README.md
git commit -m "docs: stratégie Prisma vs Supabase JS + lib/README"
```

---

## Phase P4 — Observabilité (avant exploitation continue)

### Task P4.1: Tracking coût LLM par run

**Files:**

- Create: `supabase/migrations/20260518_agent_runs_tokens.sql`
- Modify: `lib/llm-client.ts`
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `app/studio/analytics/page.tsx`

**Context:** `agent_runs` stocke `duration_ms`, `model`, `provider` mais pas les tokens consommés ni le coût. Sans ça impossible de calculer la marge réelle.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260518_agent_runs_tokens.sql
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS prompt_tokens integer,
  ADD COLUMN IF NOT EXISTS completion_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(10,6);

CREATE INDEX IF NOT EXISTS agent_runs_user_cost_idx
  ON public.agent_runs(user_id, created_at DESC)
  WHERE cost_usd IS NOT NULL;
```

Appliquer en prod :

```bash
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/20260518_agent_runs_tokens.sql)"
```

- [ ] **Step 2: Étendre LLMResponse**

```ts
// lib/llm-client.ts
export interface LLMUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface LLMResponse {
  content: string
  provider: 'ollama' | 'claude' | 'openai'
  model: string
  fallback_triggered: boolean
  usage?: LLMUsage
}
```

Mettre à jour `llmChat` pour extraire `usage` depuis les réponses Ollama (champ `prompt_eval_count` + `eval_count`) et Anthropic (`usage.input_tokens` + `usage.output_tokens`).

- [ ] **Step 3: Pricing table**

```ts
// lib/llm-client.ts (suite)
const PRICING_PER_1K_TOKENS_USD: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
  // Ollama local: gratuit
  'qwen3:8b': { input: 0, output: 0 },
  'qwen3:14b': { input: 0, output: 0 },
  'llama3.1:8b': { input: 0, output: 0 },
}

export function computeCostUsd(model: string, usage: LLMUsage): number {
  const p = PRICING_PER_1K_TOKENS_USD[model]
  if (!p) return 0
  return (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1000
}
```

- [ ] **Step 4: Tests**

```ts
// lib/llm-client.test.ts (étendre)
describe('computeCostUsd', () => {
  it('calcule le coût pour Claude Sonnet', () => {
    expect(
      computeCostUsd('claude-sonnet-4-6', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBeCloseTo(0.003 * 1 + 0.015 * 0.5, 6)
  })
  it('retourne 0 pour Ollama local', () => {
    expect(
      computeCostUsd('qwen3:8b', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBe(0)
  })
  it('retourne 0 pour un modèle inconnu', () => {
    expect(
      computeCostUsd('inconnu', {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      })
    ).toBe(0)
  })
})
```

- [ ] **Step 5: Persister dans agent_runs**

Dans `lib/autonomy/run-agent-step.ts`, à la fin du run :

```ts
const usage = llmResult.usage
const costUsd = usage ? computeCostUsd(usedModel, usage) : null

const agentRun = await single<{ id?: string }>(
  supabase
    .from('agent_runs')
    .insert({
      user_id: userId,
      agent_id: agentId,
      model: usedModel,
      prompt: userPrompt,
      response: content,
      duration_ms: durationMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      cost_usd: costUsd,
    })
    .select('id')
)
```

- [ ] **Step 6: UI Analytics**

Ajouter une 8ème case dans le grid Live KPIs : "Coût LLM (30j)" qui somme `agent_runs.cost_usd` du user.

Nouvelle route :

```ts
// app/api/studio/analytics/llm-cost/route.ts
// GET retourne { totalUsd: number, byAgent: { agent_id, cost_usd }[] }
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260518_agent_runs_tokens.sql lib/llm-client.ts lib/llm-client.test.ts \
  lib/autonomy/run-agent-step.ts app/api/studio/analytics/llm-cost/route.ts app/studio/analytics/page.tsx
git commit -m "feat(observability): tracking tokens + coût USD par agent_run + KPI Analytics"
```

---

### Task P4.2: Pages d'erreur custom

**Files:**

- Create: `app/error.tsx`
- Create: `app/not-found.tsx`
- Create: `app/global-error.tsx`

- [ ] **Step 1: `app/error.tsx`**

```tsx
'use client'
import { useEffect } from 'react'
import { bg, surface, text, muted, accent } from '@/lib/ck-vars'
import { logError } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logError('app.error', error, { digest: error.digest })
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: surface,
          padding: 32,
          borderRadius: 14,
          maxWidth: 480,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: text, margin: 0 }}>
          Erreur interne
        </h1>
        <p style={{ color: muted, fontSize: 14, lineHeight: 1.6 }}>
          {error.message ?? 'Une erreur inattendue est survenue.'}
        </p>
        {error.digest && (
          <code style={{ fontSize: 11, color: muted, fontFamily: 'var(--font-mono)' }}>
            digest: {error.digest}
          </code>
        )}
        <button
          onClick={reset}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            background: accent,
            color: '#0b0d12',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `app/not-found.tsx`**

Pattern similaire avec message "Page introuvable" + lien retour `/`.

- [ ] **Step 3: `app/global-error.tsx`**

Fallback ultime pour les erreurs hors layout.

- [ ] **Step 4: Test manuel**

- Forcer une erreur dans `/studio/agents` (ex: throw dans un useEffect)
- Visiter `/route-inexistante`
- Vérifier que les pages s'affichent aux couleurs Kenomi

- [ ] **Step 5: Commit**

```bash
git add app/error.tsx app/not-found.tsx app/global-error.tsx
git commit -m "feat(ui): pages d'erreur custom (error, not-found, global-error)"
```

---

### Task P4.3: Endpoint /api/metrics (Prometheus)

**Files:**

- Modify: `package.json` (deps: `prom-client`)
- Create: `lib/metrics/prometheus.ts`
- Create: `app/api/metrics/route.ts`
- Modify: `proxy.ts` (autoriser /api/metrics non-auth ou auth par token)

- [ ] **Step 1: Install prom-client**

```bash
npm install prom-client
```

- [ ] **Step 2: Wrapper metrics**

```ts
// lib/metrics/prometheus.ts
import { Counter, Histogram, register } from 'prom-client'

export const httpRequestsTotal = new Counter({
  name: 'kenomi_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
})

export const httpRequestDurationMs = new Histogram({
  name: 'kenomi_http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
})

export const agentRunsTotal = new Counter({
  name: 'kenomi_agent_runs_total',
  help: 'Total agent runs',
  labelNames: ['agent_id', 'provider', 'fallback'],
})

export const agentRunCostUsd = new Counter({
  name: 'kenomi_agent_run_cost_usd_total',
  help: 'Total agent run cost in USD',
  labelNames: ['agent_id', 'model'],
})

export { register }
```

- [ ] **Step 3: Route /api/metrics**

```ts
// app/api/metrics/route.ts
import { register } from '@/lib/metrics/prometheus'

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${token}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const metrics = await register.metrics()
  return new Response(metrics, {
    headers: { 'Content-Type': register.contentType },
  })
}
```

- [ ] **Step 4: Instrumenter les routes API**

Pattern à appliquer dans 2-3 routes critiques (waitlist, events, /studio/agents/run) :

```ts
import { httpRequestsTotal, httpRequestDurationMs } from '@/lib/metrics/prometheus'

export async function POST(req: Request) {
  const start = Date.now()
  let status = 200
  try {
    // ... logique
    return Response.json(...)
  } catch (err) {
    status = 500
    throw err
  } finally {
    const duration = Date.now() - start
    httpRequestsTotal.inc({ method: 'POST', route: '/api/waitlist', status: String(status) })
    httpRequestDurationMs.observe({ method: 'POST', route: '/api/waitlist', status: String(status) }, duration)
  }
}
```

- [ ] **Step 5: Documenter dans README**

Section "Observabilité" : URL `/api/metrics` + token + format Prometheus + exemples Grafana.

- [ ] **Step 6: Commit**

```bash
git add lib/metrics/prometheus.ts app/api/metrics/route.ts package.json package-lock.json proxy.ts README.md
git commit -m "feat(observability): endpoint /api/metrics Prometheus + compteurs HTTP/LLM"
```

---

## Phase P5 — Performance (optionnel)

### Task P5.1: Bundle analyzer

**Files:**

- Modify: `package.json` (devDep: `@next/bundle-analyzer`)
- Modify: `next.config.ts`

- [ ] **Step 1: Install**

```bash
npm install -D @next/bundle-analyzer
```

- [ ] **Step 2: Config**

```ts
// next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  output: 'standalone',
}

export default withBundleAnalyzer(nextConfig)
```

- [ ] **Step 3: Lancer l'analyse**

```bash
ANALYZE=true npm run build
```

- [ ] **Step 4: Documenter top 5 bundles dans docs/audits/2026-05-18-bundle-analysis.md**

Inclure screenshots du report.

- [ ] **Step 5: Commit (sans recommandations d'optim pour l'instant)**

```bash
git add next.config.ts package.json package-lock.json docs/audits/
git commit -m "feat(perf): bundle analyzer + rapport top 5 bundles"
```

---

## Final Release Gate

- [ ] **Step 1: Tous les checks verts**

```bash
npm run typecheck
npm run lint   # warnings <= 41 (51 initial - 10 setState corrigés)
npm test       # >= 250 tests
npm run build
npm run smoke
npm run supabase:validate
```

- [ ] **Step 2: Vérifications manuelles**

- [ ] `/studio/analytics` montre 8 KPIs Live (visites, signups, taux, revenu, spend, profit, ROI, **coût LLM**)
- [ ] `/studio/agents` montre les 3 tabs Autonomy Ops
- [ ] `/studio/marketing` montre les drafts + boutons publish/reject
- [ ] `/route-inexistante` retourne la page 404 custom
- [ ] `/api/metrics` retourne du format Prometheus avec compteurs
- [ ] Aucune table prod sans RLS (`supabase:validate`)
- [ ] Aucun `console.error` résiduel dans le code (`grep -rn "console\." app lib | grep -v test`)

- [ ] **Step 3: PR vers main**

```bash
gh pr create --title "feat: suite audit — sécurité + stabilité + obs + perf" --body "$(cat <<'EOF'
## Summary
- P1 : drop tables legacy sans RLS (kenomi_jobs, saas_opportunities)
- P2 : corrige setState in effect (11 fichiers) + tests intégration routes publiques
- P3 : extrait composants UI (KpiCard, StatusBadge...) + logger Pino + docs stratégie DB
- P4 : tracking tokens/coût LLM + pages erreur custom + endpoint Prometheus /api/metrics
- P5 : bundle analyzer

## Test plan
- [ ] Tous tests verts (`npm test`)
- [ ] Smoke HTTP `npm run smoke`
- [ ] Validation Supabase `npm run supabase:validate`
- [ ] Manuel : voir checklist Final Release Gate
- [ ] Mesure: ouverture `/studio/agents` < 1s en local

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes d'exécution

- **Ordre recommandé** : P1 (30 min, bloquant) → P4.1 + P4.2 (1 jour, obs critique) → P2.1 (½ jour) → P2.2 (1 jour) → P3 (3 jours) → P4.3 (½ jour) → P5 (½ jour).
- **Tests à chaque task** : `npm run typecheck && npm test` avant chaque commit.
- **Migrations SQL** : toujours appliquer en prod via curl + revalider avec `supabase:validate`.
- **Si bloqué sur un fichier monolithique** : extraire d'abord les composants visuels (lignes 1-200), puis les hooks (200-400), enfin le JSX principal. Ne jamais réécrire toute la page d'un coup.

**Total estimé** : ~6 jours de travail focus, sans surprises.
