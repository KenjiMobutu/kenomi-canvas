# Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter un workflow orchestré en 6 étapes où Scout génère une idée de venture, l'utilisateur la valide, puis les 5 agents suivants s'exécutent en séquence avec ce contexte.

**Architecture:** Une table `venture_pipeline` stocke l'idée Scout et les outputs de chaque agent avec un statut de progression. La route `/api/studio/agents/run` est augmentée pour gérer les transitions de statut et le blocage des agents. La page Agents affiche une card de validation humaine quand Scout a produit une idée en attente, et des indicateurs de statut par agent dans la chaîne.

**Tech Stack:** Next.js 15 App Router, Supabase JS (RLS), Ollama REST API (`stream: false, think: false`), React 19, TypeScript strict, Vitest, `apiError`/`apiOk` helpers, `requireAllowedUser`, `isRateLimited`, `isAllowedOllamaUrl`.

---

## Contexte codebase

### Tables existantes (Supabase self-hosted)

**`agent_configs`** — config par agent, `UNIQUE(user_id, agent_id)`
```
id uuid, user_id uuid, agent_id text, model text DEFAULT 'qwen3:8b',
system_prompt text, temperature numeric DEFAULT 0.7, max_tokens integer DEFAULT 2048,
paused boolean DEFAULT false, run_count integer DEFAULT 0, last_run_at timestamptz
```

**`agent_runs`** — historique des runs (créée manuellement en prod)
```
id uuid, user_id uuid, agent_id text, model text, prompt text,
response text, duration_ms integer, created_at timestamptz
```

**`ventures`** — ventures existantes
```
id uuid, user_id uuid, name text, niche text, stage text DEFAULT 'Validation',
score integer DEFAULT 0, mrr text, cac text, conversion text,
next_action text, insight text, created_at timestamptz
```

### Fichiers clés

- `app/api/studio/agents/run/route.ts` — POST, appel Ollama, insert `agent_runs`, update `agent_configs`
- `app/studio/agents/page.tsx` — page agents avec `AgentInspector`, `handleRun`, `handlePause`, `handleLogs`
- `lib/studio-utils.ts` — `AGENTS_DATA` (7 agents : scout, validation, builder, payment, marketing, decision + 1 autre)
- `lib/api-response.ts` — `apiError(message, status)`, `apiOk(data)`
- `lib/auth-server.ts` — `requireAllowedUser(cookieStore)` → `{ user, supabase, response }`
- `lib/rate-limit.ts` — `isRateLimited(key, { limit, windowMs })`
- `lib/security.ts` — `isAllowedOllamaUrl(url)`

### Chaîne des agents (ordre fixe)

```
1. scout      → génère idée venture (titre, niche, problème, solution, marché cible)
2. validation → score TAM/CPC/SEO/concurrents (1-100) + recommandation go/no-go
3. builder    → génère landing page (headline, subline, CTA, 3 features, pricing)
4. payment    → génère config Stripe (produit, prix, description checkout)
5. marketing  → génère plan distribution (3 canaux, 5 messages clés, calendrier J+7)
6. decision   → synthèse finale (Continue / Pivot / Stop + justification)
```

`payment` et `marketing` n'existent pas dans `AGENTS_DATA` actuel — remplacés par les IDs réels `payment` et `marketing`.

---

## Structure des fichiers

| Fichier | Action | Rôle |
|---------|--------|------|
| `supabase/migrations/20260517_venture_pipeline.sql` | Créer | Table `venture_pipeline` |
| `lib/pipeline-types.ts` | Créer | Types TypeScript partagés |
| `app/api/studio/agents/pipeline/route.ts` | Créer | GET pipeline actif + POST validate/reject |
| `app/api/studio/agents/run/route.ts` | Modifier | Logique pipeline : blocage, prompt enrichi, transitions de statut |
| `app/studio/agents/page.tsx` | Modifier | Card validation humaine + indicateurs pipeline par agent |
| `lib/pipeline-types.test.ts` | Créer | Tests unitaires sur les helpers de statut |

---

## Task 1 : Migration DB `venture_pipeline`

**Files:**
- Create: `supabase/migrations/20260517_venture_pipeline.sql`

- [ ] **Step 1 : Écrire la migration SQL**

```sql
-- venture_pipeline : état de la chaîne orchestrée Scout → Decision
CREATE TABLE IF NOT EXISTS public.venture_pipeline (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Output Scout
  idea_title     text NOT NULL DEFAULT '',
  idea_niche     text NOT NULL DEFAULT '',
  idea_problem   text NOT NULL DEFAULT '',
  idea_solution  text NOT NULL DEFAULT '',
  idea_market    text NOT NULL DEFAULT '',
  scout_raw      text NOT NULL DEFAULT '',

  -- Statut global de la chaîne
  -- 'pending_validation' | 'approved' | 'rejected' | 'running' | 'done'
  status         text NOT NULL DEFAULT 'pending_validation',

  -- Outputs des agents suivants (null = pas encore exécuté)
  validation_output  text,
  validation_score   integer,
  builder_output     text,
  payment_output     text,
  marketing_output   text,
  decision_output    text,

  -- Venture créée après validation humaine
  venture_id     uuid REFERENCES public.ventures(id) ON DELETE SET NULL,

  -- Quel agent est en cours d'exécution
  current_agent  text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venture_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_own" ON public.venture_pipeline
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pipeline_user_status_idx
  ON public.venture_pipeline(user_id, status);
```

- [ ] **Step 2 : Appliquer la migration en production**

Ouvrir le dashboard Supabase → SQL Editor → coller et exécuter le contenu du fichier.

Vérifier :
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'venture_pipeline' ORDER BY ordinal_position;
```
Attendu : 18 colonnes dont `idea_title`, `status`, `validation_score`, `venture_id`.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260517_venture_pipeline.sql
git commit -m "feat(db): table venture_pipeline pour orchestration agents"
```

---

## Task 2 : Types TypeScript partagés

**Files:**
- Create: `lib/pipeline-types.ts`
- Create: `lib/pipeline-types.test.ts`

- [ ] **Step 1 : Écrire le test**

```typescript
// lib/pipeline-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  AGENT_CHAIN,
  nextAgentInChain,
  isAgentUnlocked,
  parsePipelineIdea,
} from './pipeline-types'

describe('AGENT_CHAIN', () => {
  it('contient 6 agents dans le bon ordre', () => {
    expect(AGENT_CHAIN).toEqual(['scout', 'validation', 'builder', 'payment', 'marketing', 'decision'])
  })
})

describe('nextAgentInChain', () => {
  it('retourne le suivant pour scout', () => {
    expect(nextAgentInChain('scout')).toBe('validation')
  })
  it('retourne le suivant pour validation', () => {
    expect(nextAgentInChain('validation')).toBe('builder')
  })
  it('retourne null pour decision (dernier)', () => {
    expect(nextAgentInChain('decision')).toBeNull()
  })
  it('retourne null pour un agent hors chaîne', () => {
    expect(nextAgentInChain('unknown')).toBeNull()
  })
})

describe('isAgentUnlocked', () => {
  it('scout est toujours débloqué', () => {
    expect(isAgentUnlocked('scout', null)).toBe(true)
  })
  it('validation est bloqué si pas de pipeline approved', () => {
    expect(isAgentUnlocked('validation', null)).toBe(false)
  })
  it('validation est débloqué si pipeline approved et validation_output null', () => {
    expect(isAgentUnlocked('validation', { status: 'approved', validation_output: null, builder_output: null, payment_output: null, marketing_output: null, decision_output: null })).toBe(true)
  })
  it('validation est bloqué si déjà exécuté', () => {
    expect(isAgentUnlocked('validation', { status: 'approved', validation_output: 'done', builder_output: null, payment_output: null, marketing_output: null, decision_output: null })).toBe(false)
  })
  it('builder est bloqué si validation_output null', () => {
    expect(isAgentUnlocked('builder', { status: 'approved', validation_output: null, builder_output: null, payment_output: null, marketing_output: null, decision_output: null })).toBe(false)
  })
  it('builder est débloqué si validation_output présent', () => {
    expect(isAgentUnlocked('builder', { status: 'approved', validation_output: 'ok', builder_output: null, payment_output: null, marketing_output: null, decision_output: null })).toBe(true)
  })
})

describe('parsePipelineIdea', () => {
  it('parse un output Scout bien formaté', () => {
    const raw = `TITRE: SaaS RH
NICHE: RH / PME
PROBLÈME: Onboarding chaotique
SOLUTION: Workflow automatisé
MARCHÉ: PME 10-50 salariés`
    const result = parsePipelineIdea(raw)
    expect(result.idea_title).toBe('SaaS RH')
    expect(result.idea_niche).toBe('RH / PME')
    expect(result.idea_problem).toBe('Onboarding chaotique')
    expect(result.idea_solution).toBe('Workflow automatisé')
    expect(result.idea_market).toBe('PME 10-50 salariés')
  })
  it('retourne des chaînes vides si format invalide', () => {
    const result = parsePipelineIdea('réponse libre sans format')
    expect(result.idea_title).toBe('')
  })
})
```

- [ ] **Step 2 : Exécuter le test pour vérifier qu'il échoue**

```bash
npx vitest run lib/pipeline-types.test.ts
```
Attendu : FAIL — `Cannot find module './pipeline-types'`

- [ ] **Step 3 : Implémenter `lib/pipeline-types.ts`**

```typescript
// lib/pipeline-types.ts

export const AGENT_CHAIN = ['scout', 'validation', 'builder', 'payment', 'marketing', 'decision'] as const
export type ChainAgent = typeof AGENT_CHAIN[number]

export type PipelineStatus = 'pending_validation' | 'approved' | 'rejected' | 'running' | 'done'

export interface PipelineRow {
  id: string
  user_id: string
  idea_title: string
  idea_niche: string
  idea_problem: string
  idea_solution: string
  idea_market: string
  scout_raw: string
  status: PipelineStatus
  validation_output: string | null
  validation_score: number | null
  builder_output: string | null
  payment_output: string | null
  marketing_output: string | null
  decision_output: string | null
  venture_id: string | null
  current_agent: string | null
  created_at: string
  updated_at: string
}

type AgentOutputs = Pick<PipelineRow, 'status' | 'validation_output' | 'builder_output' | 'payment_output' | 'marketing_output' | 'decision_output'>

export function nextAgentInChain(agentId: string): ChainAgent | null {
  const idx = AGENT_CHAIN.indexOf(agentId as ChainAgent)
  if (idx === -1 || idx === AGENT_CHAIN.length - 1) return null
  return AGENT_CHAIN[idx + 1]
}

export function isAgentUnlocked(agentId: string, pipeline: AgentOutputs | null): boolean {
  if (agentId === 'scout') return true
  if (!pipeline || pipeline.status !== 'approved') return false
  switch (agentId) {
    case 'validation': return pipeline.validation_output === null
    case 'builder':    return pipeline.validation_output !== null && pipeline.builder_output === null
    case 'payment':    return pipeline.builder_output !== null && pipeline.payment_output === null
    case 'marketing':  return pipeline.payment_output !== null && pipeline.marketing_output === null
    case 'decision':   return pipeline.marketing_output !== null && pipeline.decision_output === null
    default:           return false
  }
}

// Parse la réponse structurée de Scout
export function parsePipelineIdea(raw: string): {
  idea_title: string; idea_niche: string; idea_problem: string
  idea_solution: string; idea_market: string
} {
  const extract = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
    return m ? m[1].trim() : ''
  }
  return {
    idea_title:   extract('TITRE'),
    idea_niche:   extract('NICHE'),
    idea_problem: extract('PROBLÈME|PROBLEME'),
    idea_solution: extract('SOLUTION'),
    idea_market:  extract('MARCHÉ|MARCHE'),
  }
}

// System prompts par agent — injectés avec le contexte pipeline
export function buildSystemPrompt(agentId: string, pipeline: PipelineRow | null, customPrompt: string): string {
  if (customPrompt.trim()) return customPrompt

  const ctx = pipeline ? `
Contexte venture active :
- Titre : ${pipeline.idea_title}
- Niche : ${pipeline.idea_niche}
- Problème : ${pipeline.idea_problem}
- Solution : ${pipeline.idea_solution}
- Marché cible : ${pipeline.idea_market}
` : ''

  const prompts: Record<string, string> = {
    scout: `Tu es Scout, agent de découverte de ventures pour entrepreneur solo.
Ta mission : identifier une opportunité de micro-SaaS ou service digital à fort potentiel.
Réponds UNIQUEMENT dans ce format exact (5 lignes) :
TITRE: [nom court du produit]
NICHE: [marché cible précis]
PROBLÈME: [douleur principale en 1 phrase]
SOLUTION: [solution proposée en 1 phrase]
MARCHÉ: [segment cible précis]
Aucun texte avant ou après ces 5 lignes.`,

    validation: `Tu es Validation, agent de scoring de ventures.${ctx}
Ta mission : analyser cette idée sur 4 critères (TAM, CPC estimé, concurrence SEO, faisabilité solo).
Réponds en JSON strict :
{"score": <0-100>, "tam": "<estimation marché>", "cpc": "<coût clic estimé>", "seo_difficulty": "<faible|moyen|élevé>", "verdict": "go|no-go", "reason": "<justification 2 phrases>"}`,

    builder: `Tu es Builder, agent de création de landing page.${ctx}
Ta mission : générer le contenu complet d'une landing page de pré-lancement.
Réponds en JSON strict :
{"headline": "<titre accrocheur>", "subline": "<sous-titre 1 phrase>", "cta": "<texte bouton>", "features": ["<feature 1>", "<feature 2>", "<feature 3>"], "pricing": "<offre simple ex: 29€/mois">}`,

    payment: `Tu es Payment, agent de monétisation.${ctx}
Ta mission : concevoir la configuration Stripe optimale pour cette venture.
Réponds en JSON strict :
{"product_name": "<nom produit>", "price_amount": <centimes entier>, "price_currency": "eur", "billing": "one_time|monthly|yearly", "checkout_description": "<description 1 phrase>", "trial_days": <0-30>}`,

    marketing: `Tu es Marketing, agent de distribution.${ctx}
Ta mission : créer un plan de lancement sur 7 jours.
Réponds en JSON strict :
{"channels": ["<canal 1>", "<canal 2>", "<canal 3>"], "messages": ["<message clé 1>", "<message clé 2>", "<message clé 3>", "<message clé 4>", "<message clé 5>"], "day1": "<action J+1>", "day3": "<action J+3>", "day7": "<action J+7>"}`,

    decision: `Tu es Decision, agent de commande stratégique.${ctx}
Score validation : ${pipeline?.validation_score ?? '—'}/100
Builder output : ${pipeline?.builder_output ? 'prêt' : 'non exécuté'}
Payment output : ${pipeline?.payment_output ? 'configuré' : 'non exécuté'}
Marketing output : ${pipeline?.marketing_output ? 'planifié' : 'non exécuté'}
Ta mission : rendre un verdict stratégique final.
Réponds en JSON strict :
{"verdict": "continue|pivot|stop", "confidence": <0-100>, "rationale": "<justification 3 phrases>", "next_step": "<action immédiate concrète>"}`,
  }

  return prompts[agentId] ?? `Tu es l'agent ${agentId}. Tu es opérationnel.`
}
```

- [ ] **Step 4 : Exécuter le test pour vérifier qu'il passe**

```bash
npx vitest run lib/pipeline-types.test.ts
```
Attendu : PASS — 11 tests passing

- [ ] **Step 5 : Commit**

```bash
git add lib/pipeline-types.ts lib/pipeline-types.test.ts
git commit -m "feat(pipeline): types + helpers isAgentUnlocked + parsePipelineIdea + buildSystemPrompt"
```

---

## Task 3 : Route API `pipeline` (GET + POST validate/reject)

**Files:**
- Create: `app/api/studio/agents/pipeline/route.ts`

- [ ] **Step 1 : Créer la route**

```typescript
// app/api/studio/agents/pipeline/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('venture_pipeline')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return apiError(error.message, 500)
  return apiOk({ pipeline: data })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`pipeline-action:${user!.id}`, { limit: 20, windowMs: 60_000 })) {
    return apiError('Trop de requêtes', 429)
  }

  let action: string, pipelineId: string
  try {
    const body = await req.json()
    action = body.action ?? ''
    pipelineId = body.pipelineId ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!pipelineId) return apiError('pipelineId requis', 400)
  if (!['approve', 'reject'].includes(action)) return apiError('action invalide', 400)

  // Vérifier que le pipeline appartient à l'utilisateur
  const { data: existing } = await supabase
    .from('venture_pipeline')
    .select('id, status, idea_title, idea_niche, user_id')
    .eq('id', pipelineId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!existing) return apiError('Pipeline introuvable', 404)
  if (existing.status !== 'pending_validation') return apiError('Pipeline déjà traité', 409)

  if (action === 'reject') {
    await supabase.from('venture_pipeline')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', pipelineId)
    return apiOk({ ok: true, action: 'rejected' })
  }

  // approve → créer la venture en DB puis passer status à 'approved'
  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .insert({
      user_id: user!.id,
      name: existing.idea_title,
      niche: existing.idea_niche,
      stage: 'Validation',
      score: 50,
      mrr: '0', cac: '0', conversion: '0',
      next_action: 'Lancer agent Validation',
      insight: 'Idée générée par Scout',
    })
    .select('id')
    .single()

  if (ventureErr) return apiError(ventureErr.message, 500)

  await supabase.from('venture_pipeline')
    .update({
      status: 'approved',
      venture_id: venture.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pipelineId)

  return apiOk({ ok: true, action: 'approved', ventureId: venture.id })
}
```

- [ ] **Step 2 : Vérifier que le build passe**

```bash
npm run typecheck
```
Attendu : no errors

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/agents/pipeline/route.ts
git commit -m "feat(api): route pipeline GET (pipeline actif) + POST approve/reject"
```

---

## Task 4 : Modifier la route `run` pour gérer le pipeline

**Files:**
- Modify: `app/api/studio/agents/run/route.ts`

La route doit :
1. Si `agentId === 'scout'` → utiliser le system prompt Scout fixe, parser la réponse, insérer dans `venture_pipeline`
2. Si autre agent → vérifier qu'un pipeline `approved` existe et que l'agent est débloqué, enrichir le system prompt avec le contexte, sauvegarder l'output dans la colonne dédiée

- [ ] **Step 1 : Réécrire `app/api/studio/agents/run/route.ts`**

```typescript
// app/api/studio/agents/run/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { isAllowedOllamaUrl } from '@/lib/security'
import { apiError } from '@/lib/api-response'
import { isAgentUnlocked, parsePipelineIdea, buildSystemPrompt, type PipelineRow } from '@/lib/pipeline-types'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`agent-run:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de runs. Réessayez dans une minute.', 429)
  }

  let agentId: string, prompt: string
  try {
    const body = await req.json()
    agentId = body.agentId ?? ''
    prompt = body.prompt ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!agentId) return apiError('agentId requis', 400)

  // Charger config agent
  const { data: cfg } = await supabase
    .from('agent_configs')
    .select('model, system_prompt, temperature, max_tokens, paused, run_count')
    .eq('user_id', user!.id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (cfg?.paused) return apiError('Agent en pause', 409)

  // Charger pipeline actif (non rejeté, le plus récent)
  const { data: pipeline } = await supabase
    .from('venture_pipeline')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: PipelineRow | null }

  // Vérifier que l'agent est débloqué
  if (!isAgentUnlocked(agentId, pipeline)) {
    if (agentId === 'scout') {
      // Scout peut toujours run — logique ci-dessous
    } else if (!pipeline || pipeline.status === 'pending_validation') {
      return apiError('Validez l\'idée Scout avant de lancer cet agent', 409)
    } else {
      return apiError('Cet agent attend la fin de l\'étape précédente', 409)
    }
  }

  // Ollama settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('ollama_base_url')
    .eq('user_id', user!.id)
    .maybeSingle()

  const baseUrl = (settings?.ollama_base_url ?? 'http://192.168.0.14:11434').replace(/\/$/, '')
  if (!isAllowedOllamaUrl(baseUrl)) return apiError('URL Ollama non autorisée', 400)

  const model = cfg?.model ?? 'qwen3:8b'
  const systemPrompt = buildSystemPrompt(agentId, pipeline, cfg?.system_prompt ?? '')
  const userPrompt = prompt || (agentId === 'scout'
    ? 'Lance une mission de découverte et trouve-moi la meilleure opportunité de micro-SaaS du moment.'
    : 'Exécute ta mission.')

  const startMs = Date.now()

  // Marquer l'agent comme en cours dans le pipeline
  if (pipeline && agentId !== 'scout') {
    await supabase.from('venture_pipeline')
      .update({ current_agent: agentId, updated_at: new Date().toISOString() })
      .eq('id', pipeline.id)
  }

  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        think: false,
        options: {
          temperature: cfg?.temperature ?? 0.7,
          num_predict: cfg?.max_tokens ?? 512,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) return apiError(`Ollama ${resp.status}`, 502)

    const json = await resp.json() as { message?: { content?: string } }
    const content = json.message?.content ?? ''
    const durationMs = Date.now() - startMs

    // Persister dans agent_runs
    await supabase.from('agent_runs').insert({
      user_id: user!.id, agent_id: agentId, model,
      prompt: userPrompt, response: content, duration_ms: durationMs,
    })

    // Logique pipeline selon l'agent
    if (agentId === 'scout') {
      const parsed = parsePipelineIdea(content)
      // Rejeter l'éventuel pipeline pending encore ouvert
      if (pipeline && pipeline.status === 'pending_validation') {
        await supabase.from('venture_pipeline')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', pipeline.id)
      }
      // Créer un nouveau pipeline avec l'idée Scout
      const { data: newPipeline } = await supabase.from('venture_pipeline')
        .insert({
          user_id: user!.id,
          ...parsed,
          scout_raw: content,
          status: 'pending_validation',
        })
        .select('id')
        .single()

      await supabase.from('agent_configs')
        .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
        .eq('user_id', user!.id).eq('agent_id', agentId)

      return NextResponse.json({
        ok: true, content, durationMs, model,
        pipeline: { id: newPipeline?.id, ...parsed, status: 'pending_validation' },
      })
    }

    // Agents suivants : sauvegarder l'output dans la colonne dédiée
    const outputCol: Record<string, string> = {
      validation: 'validation_output',
      builder:    'builder_output',
      payment:    'payment_output',
      marketing:  'marketing_output',
      decision:   'decision_output',
    }
    const col = outputCol[agentId]
    if (col && pipeline) {
      const extraFields: Record<string, unknown> = { [col]: content, current_agent: null, updated_at: new Date().toISOString() }
      // Extraire le score si c'est Validation
      if (agentId === 'validation') {
        try {
          const parsed = JSON.parse(content)
          if (typeof parsed.score === 'number') extraFields.validation_score = parsed.score
        } catch { /* score non parseable → on ignore */ }
      }
      // Si c'est Decision → marquer done
      if (agentId === 'decision') extraFields.status = 'done'
      await supabase.from('venture_pipeline').update(extraFields).eq('id', pipeline.id)
    }

    await supabase.from('agent_configs')
      .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq('user_id', user!.id).eq('agent_id', agentId)

    return NextResponse.json({ ok: true, content, durationMs, model })
  } catch (e) {
    // Réinitialiser current_agent en cas d'erreur
    if (pipeline && agentId !== 'scout') {
      await supabase.from('venture_pipeline')
        .update({ current_agent: null, updated_at: new Date().toISOString() })
        .eq('id', pipeline.id)
    }
    const isTimeout = e instanceof Error && e.name === 'TimeoutError'
    return apiError(isTimeout ? 'Ollama timeout (30s)' : 'Ollama injoignable', 502)
  }
}
```

- [ ] **Step 2 : Vérifier le build**

```bash
npm run typecheck
```
Attendu : no errors

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/agents/run/route.ts
git commit -m "feat(api): run/route intègre pipeline — Scout insère, agents suivants bloqués + output persisté"
```

---

## Task 5 : UI — Card de validation humaine + indicateurs pipeline dans la page Agents

**Files:**
- Modify: `app/studio/agents/page.tsx`

Ajouter en haut de la page (avant le 2-col principal) :

1. **`PipelineValidationCard`** — visible uniquement si `pipeline.status === 'pending_validation'`. Affiche l'idée Scout (titre, niche, problème, solution, marché) avec boutons Valider / Rejeter.

2. **`PipelineStatusBar`** — barre de progression de la chaîne (6 étapes, chaque nœud coloré selon son état : done / running / unlocked / locked).

3. Dans `AgentInspector` — le bouton "Run mission" est grisé avec un tooltip si `!isAgentUnlocked(agent.id, pipeline)`.

- [ ] **Step 1 : Lire les premières lignes de la page pour comprendre les imports existants**

Lire `app/studio/agents/page.tsx` lignes 1-15 pour confirmer les imports.

- [ ] **Step 2 : Ajouter les imports nécessaires en tête de fichier**

Ajouter après les imports existants :
```typescript
import type { PipelineRow } from '@/lib/pipeline-types'
import { isAgentUnlocked, AGENT_CHAIN } from '@/lib/pipeline-types'
```

- [ ] **Step 3 : Ajouter le composant `PipelineStatusBar`**

Insérer ce composant juste avant `AgentInspector` dans le fichier (après la fonction `minutesAgo`) :

```typescript
function PipelineStatusBar({ pipeline }: { pipeline: PipelineRow | null }) {
  const outputByAgent: Record<string, string | null | undefined> = {
    scout:      pipeline ? 'done' : null,
    validation: pipeline?.validation_output,
    builder:    pipeline?.builder_output,
    payment:    pipeline?.payment_output,
    marketing:  pipeline?.marketing_output,
    decision:   pipeline?.decision_output,
  }
  const labels: Record<string, string> = {
    scout: 'SCT', validation: 'VAL', builder: 'BLD',
    payment: 'PAY', marketing: 'MKT', decision: 'DEC',
  }
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 12,
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 0,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginRight: 14, flexShrink: 0 }}>Pipeline</span>
      {AGENT_CHAIN.map((id, i) => {
        const output = outputByAgent[id]
        const isDone = output != null
        const isRunning = pipeline?.current_agent === id
        const isNext = !isDone && !isRunning && pipeline?.status === 'approved' && isAgentUnlocked(id, pipeline)
        const col = isDone ? emerald : isRunning ? cyan : isNext ? accent : muted2
        const AGENT_COLORS: Record<string, string> = {
          scout: '#22d3ee', validation: '#a78bfa', builder: '#34d399',
          payment: '#fbbf24', marketing: '#e879f9', decision: '#ff6a3d',
        }
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '4px 10px',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isDone ? `${AGENT_COLORS[id]}22` : surface2,
                border: `1.5px solid ${isDone || isRunning || isNext ? AGENT_COLORS[id] : line}`,
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 800,
                color: isDone || isRunning || isNext ? AGENT_COLORS[id] : muted2,
              }}>
                {isDone ? '✓' : isRunning ? '⟳' : labels[id]}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, color: col, letterSpacing: '.1em' }}>{labels[id]}</span>
            </div>
            {i < AGENT_CHAIN.length - 1 && (
              <div style={{ width: 20, height: 1, background: isDone ? AGENT_COLORS[id] : line, opacity: 0.5 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4 : Ajouter le composant `PipelineValidationCard`**

Insérer après `PipelineStatusBar` :

```typescript
function PipelineValidationCard({
  pipeline, onApprove, onReject, loading,
}: {
  pipeline: PipelineRow
  onApprove: () => void
  onReject: () => void
  loading: boolean
}) {
  return (
    <div style={{
      background: surface, border: `2px solid ${cyan}`, borderRadius: 14,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -20, top: -20,
        fontFamily: 'var(--font-display)', fontSize: 180, fontWeight: 800,
        color: cyan, opacity: .04, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
      }}>◬</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4, background: `${cyan}22`, color: cyan, letterSpacing: 1.5, fontWeight: 800 }}>
          SCOUT · VALIDATION REQUISE
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: text }}>
        {pipeline.idea_title || 'Idée sans titre'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Niche',    value: pipeline.idea_niche    },
          { label: 'Marché',   value: pipeline.idea_market   },
          { label: 'Problème', value: pipeline.idea_problem  },
          { label: 'Solution', value: pipeline.idea_solution },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: '8px 10px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: text, lineHeight: 1.4 }}>{value || '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} disabled={loading} style={{
          flex: 1, padding: '11px 14px', borderRadius: 8,
          background: loading ? `${emerald}55` : emerald,
          color: '#0b0d12', border: 'none',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '.06em',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>{loading ? '…' : '✓ Valider cette idée'}</button>
        <button onClick={onReject} disabled={loading} style={{
          padding: '11px 14px', borderRadius: 8,
          background: `${rose}18`, color: rose, border: `1px solid ${rose}44`,
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>REJETER</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5 : Modifier `AgentsPage` pour charger le pipeline et câbler la validation**

Dans `AgentsPage`, ajouter les states et le `useEffect` de chargement :

```typescript
// Dans AgentsPage, après les useState existants :
const { user } = useAuth()
const [pipeline, setPipeline] = useState<PipelineRow | null>(null)
const [pipelineLoading, setPipelineLoading] = useState(true)
const [validating, setValidating] = useState(false)

useEffect(() => {
  let cancelled = false
  async function loadPipeline() {
    setPipelineLoading(true)
    try {
      const res = await fetch('/api/studio/agents/pipeline')
      if (res.ok) {
        const data = await res.json() as { pipeline: PipelineRow | null }
        if (!cancelled) setPipeline(data.pipeline)
      }
    } finally {
      if (!cancelled) setPipelineLoading(false)
    }
  }
  loadPipeline()
  return () => { cancelled = true }
}, [])

async function handleApprove() {
  if (!pipeline) return
  setValidating(true)
  try {
    const res = await fetch('/api/studio/agents/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', pipelineId: pipeline.id }),
    })
    const data = await res.json() as { ok?: boolean; ventureId?: string; error?: string }
    if (!res.ok) return toast.error(data.error || 'Erreur validation')
    toast.success('Venture créée · les agents sont débloqués')
    setPipeline(p => p ? { ...p, status: 'approved' } : p)
  } finally {
    setValidating(false)
  }
}

async function handleReject() {
  if (!pipeline) return
  setValidating(true)
  try {
    const res = await fetch('/api/studio/agents/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', pipelineId: pipeline.id }),
    })
    if (res.ok) {
      toast.success('Idée rejetée · relancez Scout pour une nouvelle idée')
      setPipeline(null)
    }
  } finally {
    setValidating(false)
  }
}
```

- [ ] **Step 6 : Câbler les composants dans le JSX de `AgentsPage`**

Dans le `return` de `AgentsPage`, ajouter en tête du `<div>` principal (avant `{/* Main 2-col */}`) :

```typescript
<PipelineStatusBar pipeline={pipeline} />

{pipeline?.status === 'pending_validation' && (
  <PipelineValidationCard
    pipeline={pipeline}
    onApprove={handleApprove}
    onReject={handleReject}
    loading={validating}
  />
)}
```

Et passer `pipeline` à `AgentInspector` :
```typescript
<AgentInspector agent={selected} activity={activity} queue={queue} pipeline={pipeline} />
```

- [ ] **Step 7 : Modifier `AgentInspector` pour recevoir `pipeline` et griser le bouton Run si bloqué**

Changer la signature :
```typescript
function AgentInspector({ agent, activity, queue, pipeline }: {
  agent: AgentData; activity: number[]; queue: string[]; pipeline: PipelineRow | null
}) {
```

Ajouter avant le `return` :
```typescript
const unlocked = isAgentUnlocked(agent.id, pipeline)
const lockReason = !unlocked
  ? (agent.id === 'scout' ? '' : pipeline?.status === 'pending_validation' ? 'Validez l\'idée Scout d\'abord' : 'Attendez l\'agent précédent')
  : ''
```

Modifier le bouton Run :
```typescript
<button
  onClick={handleRun}
  disabled={running || dbState.paused || !unlocked}
  title={lockReason}
  style={{
    flex: 1, padding: '10px 12px', borderRadius: 8,
    background: running || dbState.paused || !unlocked ? `${agent.color}55` : agent.color,
    color: '#0b0d12', border: 'none',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.05em',
    cursor: running || dbState.paused || !unlocked ? 'not-allowed' : 'pointer',
    opacity: running || dbState.paused || !unlocked ? 0.7 : 1,
  }}
>
  {running ? '⏳ Running…' : !unlocked ? `🔒 ${lockReason}` : '▶ Run mission'}
</button>
```

- [ ] **Step 8 : Après un run Scout réussi, mettre à jour le pipeline local**

Dans `handleRun` de `AgentInspector`, après `toast.success(...)` :
```typescript
// Si Scout a généré une idée, récupérer le nouveau pipeline
if (agent.id === 'scout' && data.pipeline) {
  setPipeline(data.pipeline as PipelineRow)
}
```

Cela nécessite de passer `setPipeline` en prop à `AgentInspector` :
```typescript
function AgentInspector({ agent, activity, queue, pipeline, setPipeline }: {
  agent: AgentData; activity: number[]; queue: string[]
  pipeline: PipelineRow | null
  setPipeline: React.Dispatch<React.SetStateAction<PipelineRow | null>>
}) {
```

Et dans `AgentsPage` :
```typescript
<AgentInspector agent={selected} activity={activity} queue={queue} pipeline={pipeline} setPipeline={setPipeline} />
```

- [ ] **Step 9 : Vérifier le build complet**

```bash
npm run build
```
Attendu : ✓ Compiled successfully, `/studio/agents` listé dans les routes

- [ ] **Step 10 : Commit**

```bash
git add app/studio/agents/page.tsx
git commit -m "feat(agents): pipeline UI — PipelineStatusBar + PipelineValidationCard + bouton Run bloqué si agent locked"
```

---

## Task 6 : Push et déploiement

**Files:**
- Aucun fichier modifié

- [ ] **Step 1 : Vérifier l'état git**

```bash
git log --oneline -6
```
Attendu : 5 commits de ce plan visibles

- [ ] **Step 2 : Push**

```bash
git push origin main
```

- [ ] **Step 3 : Test end-to-end manuel**

Scénario à tester sur `lab.kenomi.eu` :

1. Aller sur `/studio/agents`
2. `PipelineStatusBar` visible avec SCT coloré si pipeline existant, sinon tous gris
3. Sélectionner Scout → bouton "Run mission" actif (unlocked)
4. Cliquer Run → toast "mission complète" → `PipelineValidationCard` apparaît avec l'idée
5. Lire l'idée, cliquer "Valider" → toast "Venture créée" → card disparaît → `PipelineStatusBar` passe SCT ✓
6. Sélectionner Validation → bouton "Run mission" actif → run → `PipelineStatusBar` passe VAL ✓
7. Sélectionner Builder AVANT que Validation soit fini → bouton grisé "🔒 Attendez l'agent précédent"
8. Aller sur `/studio/ventures` → la venture créée par Scout est visible

---

## Self-Review

### Spec coverage

| Exigence | Tâche |
|----------|-------|
| Scout génère idée structurée | Task 2 (`buildSystemPrompt` Scout), Task 4 (insert pipeline) |
| Validation humaine (valider/rejeter) | Task 3 (route POST approve/reject), Task 5 (PipelineValidationCard) |
| Création venture en DB à la validation | Task 3 (insert ventures) |
| Agents suivants bloqués jusqu'à validation | Task 2 (`isAgentUnlocked`), Task 4 (vérif route run), Task 5 (bouton grisé) |
| Chaîne séquentielle (chaque agent attend le précédent) | Task 2 (`isAgentUnlocked`), Task 4 (vérif + update output col) |
| Outputs persistés par agent | Task 4 (`outputCol` map + update) |
| Barre de progression visuelle | Task 5 (`PipelineStatusBar`) |
| Decision = synthèse finale | Task 2 (`buildSystemPrompt` Decision), Task 4 (status → 'done') |
| Venture créée dans `/studio/ventures` | Task 3 (insert ventures) |

### Placeholder scan

Aucun placeholder détecté — tous les system prompts, types, et implémentations sont complets.

### Type consistency

- `PipelineRow` défini en Task 2, utilisé en Task 3, 4, 5 ✓
- `isAgentUnlocked(agentId, pipeline)` — signature identique en Task 2 (impl) et Task 5 (usage) ✓
- `buildSystemPrompt(agentId, pipeline, customPrompt)` — Task 2 (impl) et Task 4 (usage) ✓
- `parsePipelineIdea(raw)` — Task 2 (impl) et Task 4 (usage) ✓
- `AGENT_CHAIN` — Task 2 (impl) et Task 5 (usage dans PipelineStatusBar) ✓
