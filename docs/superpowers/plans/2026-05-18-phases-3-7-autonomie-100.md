# Phases 3-7 — Finalisation Autonomie 100% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter les phases 3 à 7 du plan d'autonomie pour atteindre l'état "100% autonome supervisé" : marketing avec publication n8n, analytics ROI réels, kill switch global + dry-run + budget caps, test E2E full-loop, dashboard d'observabilité Studio et runbooks d'incident.

**Architecture:** S'appuyer sur les briques déjà en place — `autonomy_actions`, `human_approvals`, `venture_events`, `decisions`, `agent_runs`, schémas Zod par agent — et compléter les chaînons manquants. Tous les effets de bord externes (publication n8n, déploiement Coolify, checkout Stripe) doivent passer par les mêmes mécanismes : action `blocked` en production → approbation humaine → exécution via adapter mockable. Le kill switch et le dry-run rendent toutes les phases testables sans provider live.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase/Postgres/RLS, Zod, Stripe SDK, Coolify API, n8n webhooks, Vitest, existing `CkShell` studio UI.

---

## Pre-flight Check

- [ ] **Step 1: Vérifier état de la base**

```bash
git status
git log --oneline -3
npx tsc --noEmit
npx vitest run
```

Expected: branche `codex-finalisation-alignement-kenomi` à jour avec origin, 191 tests OK, typecheck OK.

- [ ] **Step 2: Vérifier env vars locales**

```bash
test -n "$STRIPE_SECRET_KEY" && echo "stripe ok" || echo "stripe missing"
test -n "$COOLIFY_API_TOKEN" && echo "coolify ok" || echo "coolify missing"
```

Si manquant: ajouter dans `.env.local` avant de continuer.

---

## Phase 3 — Autonomie Marketing

### Task 3.1: Schéma campaign_drafts

**Files:**
- Create: `supabase/migrations/20260518_marketing_drafts.sql`
- Modify: `lib/autonomy/types.ts`
- Test: `lib/migration-order.test.ts:1-100` (étendre)

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260518_marketing_drafts.sql
CREATE TABLE IF NOT EXISTS public.campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  channel text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'blocked', 'approved', 'published', 'failed', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_drafts_own" ON public.campaign_drafts;
CREATE POLICY "campaign_drafts_own" ON public.campaign_drafts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS campaign_drafts_venture_status_idx
  ON public.campaign_drafts(venture_id, status, created_at DESC);
```

- [ ] **Step 2: Étendre types**

Modifier `lib/autonomy/types.ts` pour ajouter :

```ts
export type CampaignDraftStatus = 'draft' | 'blocked' | 'approved' | 'published' | 'failed' | 'rejected'

export interface CampaignDraft {
  id: string
  user_id: string
  venture_id: string | null
  channel: string
  content: string
  status: CampaignDraftStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Appliquer la migration**

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < supabase/migrations/20260518_marketing_drafts.sql)"
```

Expected: réponse `[]` (succès).

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518_marketing_drafts.sql lib/autonomy/types.ts
git commit -m "feat(marketing): table campaign_drafts + types CampaignDraft"
```

---

### Task 3.2: Builder de drafts depuis output Marketing

**Files:**
- Create: `lib/marketing/campaign-drafts.ts`
- Create: `lib/marketing/campaign-drafts.test.ts`

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// lib/marketing/campaign-drafts.test.ts
import { describe, it, expect } from 'vitest'
import { buildCampaignDrafts } from './campaign-drafts'

describe('buildCampaignDrafts', () => {
  it('crée un draft par channel/content pair', () => {
    const drafts = buildCampaignDrafts({
      userId: 'user-1',
      ventureId: 'venture-1',
      output: {
        channels: [
          { channel: 'email', content: 'Hello world', budget_eur: 0 },
          { channel: 'twitter', content: 'Launch tweet', budget_eur: 50 },
        ],
      },
    })
    expect(drafts).toHaveLength(2)
    expect(drafts[0].channel).toBe('email')
    expect(drafts[0].status).toBe('draft')
    expect(drafts[1].metadata).toEqual({ budget_eur: 50 })
  })

  it('retourne [] si output sans channels', () => {
    const drafts = buildCampaignDrafts({
      userId: 'user-1',
      ventureId: 'venture-1',
      output: { channels: [] },
    })
    expect(drafts).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests pour échec**

```bash
npx vitest run lib/marketing/campaign-drafts.test.ts
```

Expected: FAIL (`buildCampaignDrafts is not a function`).

- [ ] **Step 3: Implémenter**

```ts
// lib/marketing/campaign-drafts.ts
export interface MarketingChannelOutput {
  channel: string
  content: string
  budget_eur?: number
}

export interface MarketingOutput {
  channels: MarketingChannelOutput[]
}

export interface DraftToCreate {
  user_id: string
  venture_id: string | null
  channel: string
  content: string
  status: 'draft'
  metadata: Record<string, unknown>
}

export function buildCampaignDrafts(input: {
  userId: string
  ventureId: string | null
  output: MarketingOutput
}): DraftToCreate[] {
  return input.output.channels.map(c => ({
    user_id: input.userId,
    venture_id: input.ventureId,
    channel: c.channel,
    content: c.content,
    status: 'draft' as const,
    metadata: c.budget_eur !== undefined ? { budget_eur: c.budget_eur } : {},
  }))
}
```

- [ ] **Step 4: Run tests pour succès**

```bash
npx vitest run lib/marketing/campaign-drafts.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/campaign-drafts.ts lib/marketing/campaign-drafts.test.ts
git commit -m "feat(marketing): buildCampaignDrafts() depuis output Marketing"
```

---

### Task 3.3: Insertion des drafts après step Marketing

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`

- [ ] **Step 1: Localiser le hook**

Lire `lib/autonomy/run-agent-step.ts` pour trouver où l'output Marketing est persisté. Identifier la fonction qui gère `agentId === 'marketing'` ou l'output type `marketing_output`.

- [ ] **Step 2: Ajouter test pour insertion drafts**

Étendre `lib/autonomy/run-agent-step.test.ts` :

```ts
it('insère des campaign_drafts après step Marketing', async () => {
  const { fakeSupabase, result } = await runAgentStepWithFakes({
    agentId: 'marketing',
    output: {
      channels: [
        { channel: 'email', content: 'Hello', budget_eur: 0 },
      ],
    },
    userId: 'user-1',
    ventureId: 'venture-1',
  })
  const drafts = fakeSupabase.tables.campaign_drafts
  expect(drafts).toHaveLength(1)
  expect(drafts[0].channel).toBe('email')
  expect(result.success).toBe(true)
})
```

- [ ] **Step 3: Run test pour échec**

```bash
npx vitest run lib/autonomy/run-agent-step.test.ts
```

Expected: FAIL (campaign_drafts vide).

- [ ] **Step 4: Implémenter**

Dans `lib/autonomy/run-agent-step.ts`, après l'insertion dans `agent_runs`, si `agentId === 'marketing'` et output validé :

```ts
import { buildCampaignDrafts } from '@/lib/marketing/campaign-drafts'
// ...

if (agentId === 'marketing' && parsedOutput) {
  const drafts = buildCampaignDrafts({
    userId: input.userId,
    ventureId: input.ventureId ?? null,
    output: parsedOutput as MarketingOutput,
  })
  if (drafts.length > 0) {
    await supabase.from('campaign_drafts').insert(drafts)
  }
}
```

- [ ] **Step 5: Run test pour succès**

```bash
npx vitest run lib/autonomy/run-agent-step.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(marketing): insère campaign_drafts après step Marketing"
```

---

### Task 3.4: Adapter interface + mock + n8n

**Files:**
- Create: `lib/marketing/adapters/types.ts`
- Create: `lib/marketing/adapters/mock.ts`
- Create: `lib/marketing/adapters/mock.test.ts`
- Create: `lib/marketing/adapters/n8n.ts`
- Create: `lib/marketing/adapters/n8n.test.ts`
- Create: `lib/marketing/adapters/index.ts`

- [ ] **Step 1: Définir l'interface**

```ts
// lib/marketing/adapters/types.ts
export interface PublishInput {
  channel: string
  content: string
  ventureId: string
  metadata?: Record<string, unknown>
}

export interface PublishResult {
  externalId: string
  url?: string
  metadata?: Record<string, unknown>
}

export interface MarketingPublisher {
  publish(input: PublishInput): Promise<PublishResult>
}
```

- [ ] **Step 2: Test mock adapter**

```ts
// lib/marketing/adapters/mock.test.ts
import { describe, it, expect } from 'vitest'
import { createMockPublisher } from './mock'

describe('createMockPublisher', () => {
  it('retourne un externalId généré', async () => {
    const pub = createMockPublisher()
    const result = await pub.publish({
      channel: 'email',
      content: 'Hello',
      ventureId: 'venture-1',
    })
    expect(result.externalId).toMatch(/^mock-/)
  })
})
```

- [ ] **Step 3: Implémenter mock**

```ts
// lib/marketing/adapters/mock.ts
import type { MarketingPublisher } from './types'

export function createMockPublisher(): MarketingPublisher {
  return {
    async publish(input) {
      return {
        externalId: `mock-${Date.now()}-${input.channel}`,
        url: `https://mock.local/${input.ventureId}/${input.channel}`,
        metadata: { adapter: 'mock' },
      }
    },
  }
}
```

- [ ] **Step 4: Test n8n adapter**

```ts
// lib/marketing/adapters/n8n.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createN8nPublisher } from './n8n'

afterEach(() => { vi.restoreAllMocks() })

describe('createN8nPublisher', () => {
  it('rejette si N8N_PUBLISH_WEBHOOK_URL absente', () => {
    expect(() => createN8nPublisher({})).toThrow(/N8N_PUBLISH_WEBHOOK_URL/)
  })

  it('rejette URL non autorisée (SSRF)', () => {
    expect(() => createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'http://127.0.0.1/webhook',
    })).toThrow(/non autorisée/i)
  })

  it('POST au webhook avec payload signé', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ executionId: 'exec-123' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const pub = createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/publish',
      N8N_PUBLISH_TOKEN: 'secret',
    })
    const result = await pub.publish({
      channel: 'twitter',
      content: 'Launch!',
      ventureId: 'v1',
    })
    expect(result.externalId).toBe('exec-123')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://n8n.kenomi.eu/webhook/publish',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Kenomi-Token': 'secret' }),
      }),
    )
  })

  it('throw si le webhook retourne non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'oops',
    }) as unknown as typeof fetch
    const pub = createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/publish',
    })
    await expect(pub.publish({
      channel: 'email',
      content: 'x',
      ventureId: 'v1',
    })).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 5: Implémenter n8n adapter**

```ts
// lib/marketing/adapters/n8n.ts
import { isAllowedWebhookUrl } from '@/lib/security'
import type { MarketingPublisher, PublishResult } from './types'

export function createN8nPublisher(env: NodeJS.ProcessEnv): MarketingPublisher {
  const url = env.N8N_PUBLISH_WEBHOOK_URL
  if (!url) throw new Error('N8N_PUBLISH_WEBHOOK_URL missing')
  if (!isAllowedWebhookUrl(url)) {
    throw new Error(`N8N webhook URL non autorisée: ${url}`)
  }
  const token = env.N8N_PUBLISH_TOKEN

  return {
    async publish(input) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Kenomi-Token': token } : {}),
        },
        body: JSON.stringify({
          venture_id: input.ventureId,
          channel: input.channel,
          content: input.content,
          metadata: input.metadata ?? {},
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`n8n publish ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = await res.json() as { executionId?: string; url?: string }
      return {
        externalId: data.executionId ?? `n8n-${Date.now()}`,
        url: data.url,
        metadata: { adapter: 'n8n' },
      } satisfies PublishResult
    },
  }
}
```

- [ ] **Step 6: Index avec sélecteur**

```ts
// lib/marketing/adapters/index.ts
import { createMockPublisher } from './mock'
import { createN8nPublisher } from './n8n'
import type { MarketingPublisher } from './types'

export type { MarketingPublisher, PublishInput, PublishResult } from './types'

export function getMarketingPublisher(
  channel: string,
  env: NodeJS.ProcessEnv = process.env,
): MarketingPublisher {
  if (env.MARKETING_ADAPTER === 'mock') return createMockPublisher()
  if (channel === 'email' || channel === 'twitter' || channel === 'linkedin') {
    return createN8nPublisher(env)
  }
  return createMockPublisher()
}
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run lib/marketing/
```

Expected: PASS (>=5 tests).

- [ ] **Step 8: Commit**

```bash
git add lib/marketing/adapters/
git commit -m "feat(marketing): adapters publish — types + mock + n8n avec SSRF guard"
```

---

### Task 3.5: Action publish_campaign + approval gate

**Files:**
- Create: `lib/marketing/publish-action.ts`
- Create: `lib/marketing/publish-action.test.ts`
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `lib/autonomy/approval-executor.test.ts`

- [ ] **Step 1: Test publish action**

```ts
// lib/marketing/publish-action.test.ts
import { describe, it, expect, vi } from 'vitest'
import { executePublishCampaign } from './publish-action'

describe('executePublishCampaign', () => {
  it('appelle le publisher et insère venture_events campaign_published', async () => {
    const tables: Record<string, unknown[]> = {
      venture_events: [],
      campaign_drafts: [{ id: 'd1', channel: 'email', content: 'Hi', venture_id: 'v1' }],
    }
    const fakeSupabase = makeFakeSupabase(tables)
    const fakePublisher = {
      publish: vi.fn().mockResolvedValue({ externalId: 'ext-1', url: 'https://x' }),
    }
    const result = await executePublishCampaign({
      supabase: fakeSupabase,
      publisher: fakePublisher,
      draftId: 'd1',
      userId: 'u1',
    })
    expect(result.success).toBe(true)
    expect(tables.venture_events).toHaveLength(1)
    expect(tables.venture_events[0]).toMatchObject({
      event_type: 'campaign_published',
      venture_id: 'v1',
    })
  })

  it('insère campaign_spend si budget_eur > 0', async () => {
    const tables: Record<string, unknown[]> = {
      venture_events: [],
      campaign_drafts: [{
        id: 'd1', channel: 'twitter', content: 'go', venture_id: 'v1',
        metadata: { budget_eur: 50 },
      }],
    }
    const fakeSupabase = makeFakeSupabase(tables)
    const fakePublisher = { publish: vi.fn().mockResolvedValue({ externalId: 'ext-2' }) }
    await executePublishCampaign({
      supabase: fakeSupabase,
      publisher: fakePublisher,
      draftId: 'd1',
      userId: 'u1',
    })
    expect(tables.venture_events).toHaveLength(2)
    expect(tables.venture_events[1]).toMatchObject({
      event_type: 'campaign_spend',
      amount_eur: 50,
    })
  })

  it('marque le draft failed si publisher throw', async () => {
    const tables: Record<string, unknown[]> = {
      campaign_drafts: [{ id: 'd1', channel: 'email', content: 'x', venture_id: 'v1' }],
      venture_events: [],
    }
    const fakeSupabase = makeFakeSupabase(tables)
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('boom')) }
    const result = await executePublishCampaign({
      supabase: fakeSupabase,
      publisher,
      draftId: 'd1',
      userId: 'u1',
    })
    expect(result.success).toBe(false)
    expect(tables.campaign_drafts[0]).toMatchObject({ status: 'failed' })
  })
})

// helper makeFakeSupabase à factoriser depuis les tests existants
```

- [ ] **Step 2: Run test pour échec**

```bash
npx vitest run lib/marketing/publish-action.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implémenter publish-action**

```ts
// lib/marketing/publish-action.ts
import type { MarketingPublisher } from './adapters/types'

export interface ExecutePublishInput {
  supabase: SupabaseLike
  publisher: MarketingPublisher
  draftId: string
  userId: string
}

export async function executePublishCampaign(input: ExecutePublishInput): Promise<{ success: boolean; error?: string }> {
  const { data: draft } = await input.supabase
    .from('campaign_drafts')
    .select('id, venture_id, channel, content, metadata')
    .eq('id', input.draftId)
    .maybeSingle()

  if (!draft) return { success: false, error: 'draft introuvable' }

  try {
    const result = await input.publisher.publish({
      channel: draft.channel,
      content: draft.content,
      ventureId: draft.venture_id,
      metadata: draft.metadata,
    })

    await input.supabase.from('venture_events').insert({
      user_id: input.userId,
      venture_id: draft.venture_id,
      event_type: 'campaign_published',
      payload: { external_id: result.externalId, url: result.url, channel: draft.channel },
    })

    const budgetEur = Number(draft.metadata?.budget_eur ?? 0)
    if (budgetEur > 0) {
      await input.supabase.from('venture_events').insert({
        user_id: input.userId,
        venture_id: draft.venture_id,
        event_type: 'campaign_spend',
        amount_eur: budgetEur,
        payload: { channel: draft.channel, external_id: result.externalId },
      })
    }

    await input.supabase
      .from('campaign_drafts')
      .update({ status: 'published', metadata: { ...draft.metadata, external_id: result.externalId } })
      .eq('id', input.draftId)

    return { success: true }
  } catch (err) {
    await input.supabase
      .from('campaign_drafts')
      .update({ status: 'failed', metadata: { ...draft.metadata, error: (err as Error).message } })
      .eq('id', input.draftId)
    return { success: false, error: (err as Error).message }
  }
}
```

- [ ] **Step 4: Brancher dans approval-executor**

Modifier `lib/autonomy/approval-executor.ts` pour qu'une action approuvée de type `publish_campaign` invoque `executePublishCampaign` avec le bon adapter via `getMarketingPublisher`. Ajouter un test correspondant dans `approval-executor.test.ts`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run lib/marketing/ lib/autonomy/approval-executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/marketing/publish-action.ts lib/marketing/publish-action.test.ts \
  lib/autonomy/approval-executor.ts lib/autonomy/approval-executor.test.ts
git commit -m "feat(marketing): executePublishCampaign + branchement approval-executor"
```

---

### Task 3.6: Création action publish_campaign après step Marketing

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`

- [ ] **Step 1: Test création action**

Ajouter dans `run-agent-step.test.ts` :

```ts
it('crée une action publish_campaign blocked par draft en production', async () => {
  const { fakeSupabase } = await runAgentStepWithFakes({
    agentId: 'marketing',
    env: 'production',
    output: { channels: [{ channel: 'email', content: 'x', budget_eur: 0 }] },
    userId: 'u1',
    ventureId: 'v1',
  })
  const actions = fakeSupabase.tables.autonomy_actions
  expect(actions).toHaveLength(1)
  expect(actions[0]).toMatchObject({
    action_type: 'publish_campaign',
    status: 'blocked',
  })
  const approvals = fakeSupabase.tables.human_approvals
  expect(approvals).toHaveLength(1)
})
```

- [ ] **Step 2: Run pour échec**

```bash
npx vitest run lib/autonomy/run-agent-step.test.ts
```

- [ ] **Step 3: Implémenter**

Dans `run-agent-step.ts`, après l'insertion des drafts, créer une `autonomy_action` `publish_campaign` par draft et un `human_approval` `pending` en production.

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/autonomy/
```

- [ ] **Step 5: Commit**

```bash
git add lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(marketing): action publish_campaign + approval gate après step Marketing"
```

---

### Task 3.7: UI Marketing — drafts + approvals

**Files:**
- Modify: `app/studio/marketing/page.tsx`
- Create: `app/api/studio/marketing/drafts/route.ts`

- [ ] **Step 1: Route GET drafts**

```ts
// app/api/studio/marketing/drafts/route.ts
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('campaign_drafts')
    .select('id, venture_id, channel, content, status, metadata, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return apiError(error.message, 500)
  return apiOk({ drafts: data ?? [] })
}
```

- [ ] **Step 2: UI Marketing page**

Étendre `app/studio/marketing/page.tsx` pour afficher trois zones :
- Drafts en attente (status: draft, blocked)
- Approbations pending (depuis `/api/studio/autonomy/jobs?type=publish_campaign`)
- Drafts publiés/échoués (historique)

Boutons Approve/Reject appellent `PATCH /api/studio/autonomy/jobs` avec `approvalId` + `decision`.

- [ ] **Step 3: Smoke test browser**

```bash
npm run dev
```

Visiter `/studio/marketing`, vérifier que la page charge sans erreur console (auth déjà fait dans une session précédente).

- [ ] **Step 4: Commit**

```bash
git add app/studio/marketing/page.tsx app/api/studio/marketing/drafts/route.ts
git commit -m "feat(marketing): UI drafts + approbations publish_campaign"
```

---

## Phase 4 — Analytics & ROI réels

### Task 4.1: Vérifier endpoint analytics

**Files:**
- Read: `app/api/studio/analytics/ventures/route.ts`
- Read: `lib/metrics/venture-metrics.ts`

- [ ] **Step 1: Lire l'existant**

```bash
cat app/api/studio/analytics/ventures/route.ts
cat lib/metrics/venture-metrics.ts
```

- [ ] **Step 2: Vérifier les tests**

```bash
npx vitest run lib/metrics/venture-metrics.test.ts
```

S'assurer que `aggregateVentureMetrics()` calcule bien visits/signups/revenue/spend/profit/ROI depuis `venture_events`. Sinon, étendre.

---

### Task 4.2: Remplacer KPIs décoratifs

**Files:**
- Modify: `app/studio/analytics/page.tsx`

- [ ] **Step 1: Lire la page**

```bash
cat app/studio/analytics/page.tsx | head -80
```

- [ ] **Step 2: Identifier les valeurs hardcodées**

Repérer tout `1234`, `+12%`, mocks, etc. qui ne viennent pas d'un fetch.

- [ ] **Step 3: Remplacer par fetch /api/studio/analytics/ventures**

```ts
const [metrics, setMetrics] = useState<VentureMetrics | null>(null)
useEffect(() => {
  fetch('/api/studio/analytics/ventures')
    .then(r => r.json())
    .then(d => setMetrics(d.metrics))
}, [])
```

Afficher : visits, waitlist signups, signup rate (signups/visits), revenue €, campaign spend €, profit €, ROI %.

Empty state explicite : "Aucun événement capturé pour l'instant. Lancez un agent Marketing ou laissez tomber une preview."

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Visiter `/studio/analytics`.

- [ ] **Step 5: Commit**

```bash
git add app/studio/analytics/page.tsx
git commit -m "feat(analytics): remplace KPIs décoratifs par /api/studio/analytics/ventures"
```

---

### Task 4.3: Snapshot complet dans decisions

**Files:**
- Modify: `lib/autonomy/run-agent-step.ts`
- Modify: `lib/autonomy/run-agent-step.test.ts`

- [ ] **Step 1: Test snapshot**

```ts
it('Decision stocke un metrics_snapshot complet', async () => {
  const { fakeSupabase } = await runAgentStepWithFakes({
    agentId: 'decision',
    ventureEvents: [
      { event_type: 'page_view', venture_id: 'v1' },
      { event_type: 'page_view', venture_id: 'v1' },
      { event_type: 'payment_succeeded', venture_id: 'v1', amount_eur: 100 },
      { event_type: 'campaign_spend', venture_id: 'v1', amount_eur: 30 },
    ],
    ventureId: 'v1',
    userId: 'u1',
  })
  const decisions = fakeSupabase.tables.decisions
  expect(decisions).toHaveLength(1)
  expect(decisions[0].metrics_snapshot).toMatchObject({
    visits: 2,
    revenue_eur: 100,
    spend_eur: 30,
    profit_eur: 70,
    roi_percent: expect.any(Number),
  })
})
```

- [ ] **Step 2: Implémenter**

Dans `run-agent-step.ts`, branche `agentId === 'decision'` : avant d'insérer la décision, appeler `aggregateVentureMetrics(events)` et stocker le résultat complet dans `decisions.metrics_snapshot`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run lib/autonomy/run-agent-step.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(analytics): snapshot complet visits/revenue/spend/profit/ROI dans decisions"
```

---

## Phase 5 — Budget caps, dry-run, kill switch

### Task 5.1: Config globale autonomy

**Files:**
- Create: `lib/autonomy/config.ts`
- Create: `lib/autonomy/config.test.ts`
- Modify: `app/api/studio/agents/orchestrate/route.ts`

- [ ] **Step 1: Tests config**

```ts
// lib/autonomy/config.test.ts
import { describe, it, expect } from 'vitest'
import { getAutonomyConfig } from './config'

describe('getAutonomyConfig', () => {
  it('defaults: enabled, dryRun false, cap 100', () => {
    expect(getAutonomyConfig({})).toEqual({
      enabled: true,
      dryRun: false,
      globalBudgetCapEur: 100,
    })
  })

  it('respecte AUTONOMY_ENABLED=false', () => {
    expect(getAutonomyConfig({ AUTONOMY_ENABLED: 'false' }).enabled).toBe(false)
  })

  it('respecte AUTONOMY_DRY_RUN=true', () => {
    expect(getAutonomyConfig({ AUTONOMY_DRY_RUN: 'true' }).dryRun).toBe(true)
  })

  it('respecte AUTONOMY_GLOBAL_BUDGET_CAP_EUR=250', () => {
    expect(getAutonomyConfig({ AUTONOMY_GLOBAL_BUDGET_CAP_EUR: '250' }).globalBudgetCapEur).toBe(250)
  })
})
```

- [ ] **Step 2: Implémenter**

```ts
// lib/autonomy/config.ts
export interface AutonomyConfig {
  enabled: boolean
  dryRun: boolean
  globalBudgetCapEur: number
}

export function getAutonomyConfig(env: NodeJS.ProcessEnv = process.env): AutonomyConfig {
  return {
    enabled: env.AUTONOMY_ENABLED !== 'false',
    dryRun: env.AUTONOMY_DRY_RUN === 'true',
    globalBudgetCapEur: Number(env.AUTONOMY_GLOBAL_BUDGET_CAP_EUR ?? 100),
  }
}
```

- [ ] **Step 3: Brancher dans orchestrate**

Modifier `app/api/studio/agents/orchestrate/route.ts` :

```ts
const config = getAutonomyConfig()
if (!config.enabled) {
  return apiOk({ executed: [], blocked: 'autonomy_disabled', config })
}
```

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run lib/autonomy/config.test.ts
git add lib/autonomy/config.ts lib/autonomy/config.test.ts app/api/studio/agents/orchestrate/route.ts
git commit -m "feat(autonomy): config globale enabled/dryRun/budget — kill switch dans orchestrate"
```

---

### Task 5.2: Dry-run dans approval-executor

**Files:**
- Modify: `lib/autonomy/approval-executor.ts`
- Modify: `lib/autonomy/approval-executor.test.ts`

- [ ] **Step 1: Test dry-run**

```ts
it('dry-run: action approuvée marque output dry_run sans appeler Stripe/Coolify/n8n', async () => {
  process.env.AUTONOMY_DRY_RUN = 'true'
  const stripeMock = vi.fn()
  const { fakeSupabase, result } = await executeApprovedActionWithFakes({
    actionType: 'create_checkout',
    stripeClient: { checkout: { sessions: { create: stripeMock } } },
  })
  expect(stripeMock).not.toHaveBeenCalled()
  expect(result.output).toMatchObject({ dry_run: true })
})
```

- [ ] **Step 2: Implémenter**

Dans `approval-executor.ts`, avant d'invoquer l'adapter externe :

```ts
const config = getAutonomyConfig()
if (config.dryRun) {
  await supabase.from('autonomy_actions').update({
    status: 'completed',
    output: { dry_run: true, action_type: action.action_type },
  }).eq('id', action.id)
  return { success: true, output: { dry_run: true } }
}
```

- [ ] **Step 3: Tests + commit**

```bash
npx vitest run lib/autonomy/approval-executor.test.ts
git add lib/autonomy/approval-executor.ts lib/autonomy/approval-executor.test.ts
git commit -m "feat(autonomy): dry-run global — actions approuvées simulées sans effets de bord"
```

---

### Task 5.3: Budget policy

**Files:**
- Modify: `lib/autonomy/policy.ts`
- Modify: `lib/autonomy/policy.test.ts`
- Modify: `lib/autonomy/approval-executor.ts`

- [ ] **Step 1: Tests budget**

```ts
describe('checkBudgetPolicy', () => {
  it('pass si tout sous les caps', () => {
    expect(checkBudgetPolicy({
      action: { estimated_cost_eur: 10, budget_cap_eur: 50 },
      ventureSpentEur: 20,
      ventureSpendCapEur: 100,
      globalSpentEur: 50,
      globalCapEur: 500,
    })).toEqual({ ok: true })
  })

  it('fail action cap', () => {
    const result = checkBudgetPolicy({
      action: { estimated_cost_eur: 100, budget_cap_eur: 50 },
      ventureSpentEur: 0, ventureSpendCapEur: 1000,
      globalSpentEur: 0, globalCapEur: 1000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'action_cap_exceeded' })
  })

  it('fail global cap', () => {
    const result = checkBudgetPolicy({
      action: { estimated_cost_eur: 10, budget_cap_eur: 50 },
      ventureSpentEur: 0, ventureSpendCapEur: 1000,
      globalSpentEur: 950, globalCapEur: 1000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'global_cap_exceeded' })
  })

  it('fail venture cap', () => {
    const result = checkBudgetPolicy({
      action: { estimated_cost_eur: 60, budget_cap_eur: 100 },
      ventureSpentEur: 950, ventureSpendCapEur: 1000,
      globalSpentEur: 0, globalCapEur: 10000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'venture_cap_exceeded' })
  })
})
```

- [ ] **Step 2: Implémenter**

```ts
// lib/autonomy/policy.ts (étendre)
export interface BudgetPolicyInput {
  action: { estimated_cost_eur?: number; budget_cap_eur?: number }
  ventureSpentEur: number
  ventureSpendCapEur: number
  globalSpentEur: number
  globalCapEur: number
}

export type BudgetReason = 'action_cap_exceeded' | 'venture_cap_exceeded' | 'global_cap_exceeded'

export function checkBudgetPolicy(input: BudgetPolicyInput):
  | { ok: true }
  | { ok: false; reason: BudgetReason; detail: string }
{
  const cost = input.action.estimated_cost_eur ?? 0
  const actionCap = input.action.budget_cap_eur ?? Infinity
  if (cost > actionCap) {
    return { ok: false, reason: 'action_cap_exceeded', detail: `${cost} > ${actionCap}` }
  }
  if (input.ventureSpentEur + cost > input.ventureSpendCapEur) {
    return { ok: false, reason: 'venture_cap_exceeded', detail: `${input.ventureSpentEur + cost} > ${input.ventureSpendCapEur}` }
  }
  if (input.globalSpentEur + cost > input.globalCapEur) {
    return { ok: false, reason: 'global_cap_exceeded', detail: `${input.globalSpentEur + cost} > ${input.globalCapEur}` }
  }
  return { ok: true }
}
```

- [ ] **Step 3: Brancher dans approval-executor**

Avant d'exécuter une action approuvée avec coût, agréger `venture_events.campaign_spend` pour la venture et globalement, appeler `checkBudgetPolicy`, marquer l'action `blocked` avec `output: { budget_breach: reason }` si fail.

- [ ] **Step 4: Run tests + commit**

```bash
npx vitest run lib/autonomy/policy.test.ts lib/autonomy/approval-executor.test.ts
git add lib/autonomy/policy.ts lib/autonomy/policy.test.ts lib/autonomy/approval-executor.ts lib/autonomy/approval-executor.test.ts
git commit -m "feat(autonomy): budget policy — action/venture/global caps + blocage"
```

---

### Task 5.4: UI Approval Gates — afficher breach

**Files:**
- Modify: `app/studio/agents/page.tsx`
- Modify: `lib/autonomy/approval-view-model.ts`

- [ ] **Step 1: Étendre view-model**

Dans `approval-view-model.ts`, exposer `budget_breach_reason: BudgetReason | null` calculé depuis `action.output`.

- [ ] **Step 2: UI badge**

Dans `app/studio/agents/page.tsx`, dans la liste des approbations pending, afficher un badge rouge "Budget cap: <reason>" si présent.

- [ ] **Step 3: Smoke + commit**

```bash
npm run dev
# vérifier visuellement /studio/agents
git add app/studio/agents/page.tsx lib/autonomy/approval-view-model.ts
git commit -m "feat(autonomy): UI affiche budget_breach_reason dans Approval Gates"
```

---

## Phase 6 — Tests E2E full-loop + smoke script

### Task 6.1: Fake Supabase helper

**Files:**
- Create: `lib/test-utils/fake-supabase.ts`

- [ ] **Step 1: Implémenter helper réutilisable**

Factoriser le pattern utilisé dans les tests existants. Doit supporter `from(table).select/insert/update/delete/eq/maybeSingle/order/limit`.

```ts
// lib/test-utils/fake-supabase.ts
export type FakeTables = Record<string, Record<string, unknown>[]>

export function makeFakeSupabase(initial: FakeTables = {}) {
  const tables: FakeTables = JSON.parse(JSON.stringify(initial))
  // ... builder fluent qui mute tables[name]
  return { tables, from(name: string) { /* ... */ } }
}
```

- [ ] **Step 2: Vérifier que les tests existants peuvent migrer**

Au moins `lib/marketing/publish-action.test.ts` et `lib/autonomy/run-agent-step.test.ts` doivent pouvoir l'importer.

- [ ] **Step 3: Commit**

```bash
git add lib/test-utils/fake-supabase.ts
git commit -m "test: helper makeFakeSupabase réutilisable pour tests E2E"
```

---

### Task 6.2: Test full-loop autonomy

**Files:**
- Create: `lib/autonomy/full-loop.test.ts`

- [ ] **Step 1: Écrire le test**

```ts
// lib/autonomy/full-loop.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { makeFakeSupabase } from '@/lib/test-utils/fake-supabase'
import { runAgentStep } from './run-agent-step'
import { executeApprovedAction } from './approval-executor'

describe('Full autonomy loop (dry-run)', () => {
  beforeEach(() => {
    process.env.AUTONOMY_DRY_RUN = 'true'
    process.env.AUTONOMY_ENABLED = 'true'
  })

  it('Scout → Validation → Builder → Payment → Marketing → Decision → scale', async () => {
    const supabase = makeFakeSupabase({
      agent_configs: [/* config Scout, Validation, Builder, Payment, Marketing, Decision */],
      user_settings: [{ user_id: 'u1', /* keys etc */ }],
    })

    // 1. Scout crée idée
    await runAgentStep({ supabase, agentId: 'scout', userId: 'u1' })
    expect(supabase.tables.venture_pipeline).toHaveLength(1)

    // 2. Approve idée → crée venture
    const ideaApproval = supabase.tables.human_approvals[0]
    await /* approve */
    expect(supabase.tables.ventures).toHaveLength(1)
    const ventureId = supabase.tables.ventures[0].id

    // 3. Validation
    await runAgentStep({ supabase, agentId: 'validation', userId: 'u1', ventureId })
    expect(supabase.tables.agent_runs.filter(r => r.agent_id === 'validation')).toHaveLength(1)

    // 4. Builder
    await runAgentStep({ supabase, agentId: 'builder', userId: 'u1', ventureId })
    expect(supabase.tables.landing_pages).toHaveLength(1)

    // 5. Payment → action create_checkout blocked
    await runAgentStep({ supabase, agentId: 'payment', userId: 'u1', ventureId })
    const checkoutAction = supabase.tables.autonomy_actions.find(a => a.action_type === 'create_checkout')
    expect(checkoutAction?.status).toBe('blocked')

    // 6. Approve checkout → dry-run, output { dry_run: true }
    await executeApprovedAction({ supabase, actionId: checkoutAction!.id })
    expect(supabase.tables.autonomy_actions[/* idx */].output).toMatchObject({ dry_run: true })

    // 7. Marketing → drafts + publish actions
    await runAgentStep({ supabase, agentId: 'marketing', userId: 'u1', ventureId })
    expect(supabase.tables.campaign_drafts.length).toBeGreaterThan(0)

    // 8. Approve publish → événements campaign_published, campaign_spend
    const publishAction = supabase.tables.autonomy_actions.find(a => a.action_type === 'publish_campaign')
    await executeApprovedAction({ supabase, actionId: publishAction!.id })

    // 9. Simuler événements page_view, payment_succeeded
    supabase.tables.venture_events.push(
      { user_id: 'u1', venture_id: ventureId, event_type: 'page_view' },
      { user_id: 'u1', venture_id: ventureId, event_type: 'payment_succeeded', amount_eur: 50 },
    )

    // 10. Decision → snapshot ROI + action scale_budget
    await runAgentStep({ supabase, agentId: 'decision', userId: 'u1', ventureId })
    const decision = supabase.tables.decisions[0]
    expect(decision.metrics_snapshot).toMatchObject({ revenue_eur: 50 })
    expect(decision.recommendation).toMatch(/continue|scale|pivot|stop/)

    // 11. Approve scale_budget → dry-run output
    const scaleAction = supabase.tables.autonomy_actions.find(a => a.action_type === 'scale_budget')
    if (scaleAction) {
      await executeApprovedAction({ supabase, actionId: scaleAction.id })
      expect(scaleAction.output).toMatchObject({ dry_run: true })
    }
  })
})
```

- [ ] **Step 2: Itérer jusqu'à PASS**

Le test révèlera les chaînons manquants (fields oubliés, FK, ordre d'opérations). Corriger code de prod, pas le test.

- [ ] **Step 3: Commit**

```bash
git add lib/autonomy/full-loop.test.ts
git commit -m "test(autonomy): E2E full-loop Scout→Decision en dry-run avec fake supabase"
```

---

### Task 6.3: Script smoke HTTP

**Files:**
- Create: `scripts/smoke-app.mjs`
- Modify: `package.json`

- [ ] **Step 1: Écrire le script**

```js
// scripts/smoke-app.mjs
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

const checks = [
  { method: 'GET', path: '/login', expect: [200] },
  { method: 'GET', path: '/dashboard/login', expect: [200] },
  { method: 'GET', path: '/studio/agents', expect: [200, 302, 307] }, // redirect unauth
  { method: 'GET', path: '/api/studio/autonomy/jobs', expect: [401] },
  { method: 'GET', path: '/api/health', expect: [200, 503] },
  { method: 'POST', path: '/api/events', body: '{}', expect: [400] },
  { method: 'POST', path: '/api/waitlist', body: '{}', expect: [400] },
]

let failed = 0
for (const c of checks) {
  const res = await fetch(`${BASE}${c.path}`, {
    method: c.method,
    headers: c.body ? { 'Content-Type': 'application/json' } : undefined,
    body: c.body,
    redirect: 'manual',
  })
  const ok = c.expect.includes(res.status)
  console.log(`${ok ? 'OK' : 'FAIL'} ${c.method} ${c.path} → ${res.status} (expected ${c.expect.join('|')})`)
  if (!ok) failed++
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll smoke checks passed')
```

- [ ] **Step 2: Ajouter script package.json**

```json
{
  "scripts": {
    "smoke": "node scripts/smoke-app.mjs"
  }
}
```

- [ ] **Step 3: Lancer**

Dans un terminal :

```bash
npm run dev
```

Dans un autre :

```bash
npm run smoke
```

Expected: 7/7 OK.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-app.mjs package.json
git commit -m "test: script smoke HTTP — login, health, autonomy 401, events/waitlist 400"
```

---

## Phase 7 — Observabilité Studio + runbooks

### Task 7.1: Dashboard Jobs/Actions/Approvals dans Studio Agents

**Files:**
- Modify: `app/studio/agents/page.tsx`
- Create: `lib/autonomy/action-view-model.ts`
- Create: `lib/autonomy/action-view-model.test.ts`

- [ ] **Step 1: Tests action-view-model**

```ts
// lib/autonomy/action-view-model.test.ts
import { describe, it, expect } from 'vitest'
import { mapAction } from './action-view-model'

describe('mapAction', () => {
  it('expose duration_ms et provider', () => {
    const vm = mapAction({
      id: 'a1',
      action_type: 'create_checkout',
      status: 'completed',
      created_at: '2026-05-18T10:00:00Z',
      updated_at: '2026-05-18T10:00:05Z',
      output: { provider: 'stripe', model: null, retries: 0 },
    })
    expect(vm.durationMs).toBe(5000)
    expect(vm.provider).toBe('stripe')
  })

  it('expose lastError si failed', () => {
    const vm = mapAction({
      id: 'a2', action_type: 'deploy', status: 'failed',
      created_at: '2026-05-18T10:00:00Z', updated_at: '2026-05-18T10:00:02Z',
      output: { error: 'coolify 500' },
    })
    expect(vm.lastError).toBe('coolify 500')
  })
})
```

- [ ] **Step 2: Implémenter**

```ts
// lib/autonomy/action-view-model.ts
export interface ActionVM {
  id: string
  actionType: string
  status: 'blocked' | 'running' | 'completed' | 'failed'
  durationMs: number | null
  provider: string | null
  model: string | null
  retries: number
  lastError: string | null
  createdAt: string
}

export function mapAction(row: {
  id: string; action_type: string; status: string;
  created_at: string; updated_at: string;
  output: Record<string, unknown> | null;
}): ActionVM {
  const out = row.output ?? {}
  return {
    id: row.id,
    actionType: row.action_type,
    status: row.status as ActionVM['status'],
    durationMs: row.updated_at ? new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() : null,
    provider: (out.provider as string) ?? null,
    model: (out.model as string) ?? null,
    retries: Number(out.retries ?? 0),
    lastError: (out.error as string) ?? null,
    createdAt: row.created_at,
  }
}
```

- [ ] **Step 3: 3 tabs dans la page**

Modifier `app/studio/agents/page.tsx` :
- Tab "Jobs" : `autonomy_jobs` (queued/running/failed/completed)
- Tab "Actions" : `autonomy_actions` via `mapAction` (montre duration, provider, retries, error)
- Tab "Approvals" : pending uniquement, avec Approve/Reject

- [ ] **Step 4: Smoke + commit**

```bash
npm run dev
# /studio/agents → vérifier 3 tabs
npx vitest run lib/autonomy/action-view-model.test.ts
git add app/studio/agents/page.tsx lib/autonomy/action-view-model.ts lib/autonomy/action-view-model.test.ts
git commit -m "feat(observability): dashboard Jobs/Actions/Approvals dans /studio/agents"
```

---

### Task 7.2: Runbooks d'incident

**Files:**
- Create: `docs/runbooks/autonomy-incident.md`
- Create: `docs/runbooks/stripe-webhook.md`
- Create: `docs/runbooks/coolify-deploy.md`
- Modify: `docs/security.md`
- Modify: `docs/agents.md`
- Modify: `README.md`

- [ ] **Step 1: Runbook autonomy-incident**

Contenu :
- Kill switch immédiat : `AUTONOMY_ENABLED=false` dans Coolify, redéployer
- Dry-run : `AUTONOMY_DRY_RUN=true` pour neutraliser effets externes
- Rejet approbations stuck : `PATCH /api/studio/autonomy/jobs` avec `decision: 'rejected'`
- Replay job failed : depuis Studio Agents, bouton "Retry" (à implémenter si pas présent)

- [ ] **Step 2: Runbook stripe-webhook**

- Vérification signature : `STRIPE_WEBHOOK_SECRET` doit matcher dashboard Stripe
- Test local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Logs : Sentry / Vercel logs / `console.error` dans `lib/stripe/webhook-handler.ts`
- Replay : depuis Stripe dashboard, onglet Events, "Resend"

- [ ] **Step 3: Runbook coolify-deploy**

- Token Coolify : `$COOLIFY_API_TOKEN` dans `.env.local` et Coolify env
- UUID app : `yup6hpmw0fcowrkkf2o3bzl1`
- Rollback : Coolify UI > Deployments > sélectionner précédent > Rollback
- Stuck deploy : DELETE `/api/v1/deployments/<id>` via Coolify API

- [ ] **Step 4: MAJ docs/security.md**

Ajouter section "Kill switch et budgets" pointant vers runbooks.

- [ ] **Step 5: MAJ docs/agents.md**

Documenter quelles actions requièrent approbation humaine (`create_checkout`, `deploy`, `publish_campaign`, `scale_budget`).

- [ ] **Step 6: MAJ README**

Section "Runbooks" pointant vers `docs/runbooks/`.

- [ ] **Step 7: Commit**

```bash
git add docs/runbooks/autonomy-incident.md docs/runbooks/stripe-webhook.md docs/runbooks/coolify-deploy.md \
  docs/security.md docs/agents.md README.md
git commit -m "docs(runbooks): autonomy incident, stripe webhook, coolify deploy + maj README"
```

---

## Final Release Gate

- [ ] **Step 1: Lancer tous les checks**

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run smoke   # nécessite npm run dev dans un autre terminal
```

Expected:
- typecheck: 0 erreurs
- tests: ~210+ tests passants (191 actuels + ~20 nouveaux)
- lint: 0 errors, warnings ≤ 47 existants
- build: succès
- smoke: 7/7 OK

- [ ] **Step 2: Vérifier acceptance criteria**

- [ ] `/api/health` renvoie 200 en local (ou 503 documenté si `HEALTH_DATABASE_REQUIRED=false`)
- [ ] Full-loop test passe
- [ ] Stripe checkout fonctionne en test mode (clé test)
- [ ] Coolify deploy fonctionne en dry-run
- [ ] Marketing publish via mock adapter passe
- [ ] `/studio/agents` montre Jobs/Actions/Approvals
- [ ] `AUTONOMY_ENABLED=false` bloque l'orchestrateur
- [ ] `AUTONOMY_DRY_RUN=true` neutralise tous les effets externes
- [ ] Budget caps déclenchent un blocage visible dans UI
- [ ] Runbooks présents pour incident, stripe, coolify

- [ ] **Step 3: Push final**

```bash
git push origin codex-finalisation-alignement-kenomi
```

- [ ] **Step 4: PR vers main**

```bash
gh pr create --title "feat: finalisation autonomie 100% — phases 3 à 7" --body "$(cat <<'EOF'
## Summary
- Phase 3 : marketing autonomy avec adapter n8n + mock + UI drafts
- Phase 4 : analytics ROI réels + snapshot decisions
- Phase 5 : kill switch + dry-run + budget caps
- Phase 6 : test E2E full-loop + smoke HTTP script
- Phase 7 : dashboard observabilité + 3 runbooks d'incident

## Test plan
- [ ] `npm test` — 210+ tests
- [ ] `npm run typecheck` — 0 erreur
- [ ] `npm run build` — succès
- [ ] `npm run dev && npm run smoke` — 7/7 OK
- [ ] Manuel : `/studio/agents` montre Jobs/Actions/Approvals
- [ ] Manuel : `AUTONOMY_ENABLED=false` bloque orchestrate
- [ ] Manuel : `/studio/marketing` montre drafts

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes d'exécution

- **Ordre conseillé** : Phase 5 d'abord (kill switch + dry-run) pour rendre toutes les autres phases testables sans risque, puis 3 → 4 → 6 → 7.
- **Quand bloqué** : si une migration échoue en prod, voir `docs/runbooks/database-migrations.md`. Si un adapter externe est down, basculer `MARKETING_ADAPTER=mock` ou `AUTONOMY_DRY_RUN=true`.
- **Tests** : chaque task crée ou étend un fichier `.test.ts`. Pas de PR sans tests verts.
- **Commits** : un par task, message en français, ≤ 70 char pour le titre.
