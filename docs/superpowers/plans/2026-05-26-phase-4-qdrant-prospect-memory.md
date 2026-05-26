# Phase 4 Qdrant Prospect Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Qdrant-backed long-term memory for `Prospect`, with best-effort writes on Prospect lifecycle events and bounded retrieval injected into Prospect generation prompts.

**Architecture:** Keep Supabase as the transactional source of truth and add a server-only memory layer that formats Prospect events into compact memory documents, embeds them, writes them to a Qdrant collection, and retrieves top-k memories for new drafts and follow-ups. Retrieval remains Prospect-only in this phase, filtered by `user_id` and namespace `prospects`, and every Qdrant failure falls back without blocking Prospect execution.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgREST, Qdrant HTTP API, local/server embedding provider, existing Prospect worker and CRM pipeline.

---

### Task 1: Add configuration and type-safe memory primitives

**Files:**
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/config.ts`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/types.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/README.md`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/config.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/types.test.ts`

- [ ] **Step 1: Write failing tests for Phase 4 memory configuration and types**

```ts
import { describe, expect, it } from 'vitest'
import { getMemoryConfig } from './config'
import type { ProspectMemoryKind } from './types'

describe('getMemoryConfig', () => {
  it('returns disabled config when Qdrant vars are missing', () => {
    expect(getMemoryConfig({})).toMatchObject({ enabled: false })
  })
})

it('accepts prospect memory kinds', () => {
  const kinds: ProspectMemoryKind[] = [
    'prospect_created',
    'outreach_draft_created',
    'follow_up_generated',
    'reply_recorded',
    'prospect_won',
    'prospect_lost',
    'operator_note',
  ]
  expect(kinds).toHaveLength(7)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/memory/config.test.ts lib/memory/types.test.ts
```

Expected: FAIL with module-not-found errors for `lib/memory/config.ts` and `lib/memory/types.ts`.

- [ ] **Step 3: Add memory config and primitive types**

```ts
// lib/memory/types.ts
export type ProspectMemoryKind =
  | 'prospect_created'
  | 'outreach_draft_created'
  | 'follow_up_generated'
  | 'reply_recorded'
  | 'prospect_won'
  | 'prospect_lost'
  | 'operator_note'

export interface ProspectMemoryPoint {
  id: string
  userId: string
  namespace: 'prospects'
  prospectId: string
  companyName: string
  memoryKind: ProspectMemoryKind
  pipelineStatus: string
  band: string
  source: string
  createdAt: string
  text: string
  metadata: Record<string, unknown>
}
```

```ts
// lib/memory/config.ts
export function getMemoryConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.QDRANT_URL?.trim() ?? ''
  const collection = env.QDRANT_COLLECTION_PROSPECTS?.trim() ?? ''
  const embeddingModel = env.EMBEDDING_MODEL?.trim() ?? ''
  return {
    enabled: Boolean(url && collection && embeddingModel),
    url,
    apiKey: env.QDRANT_API_KEY?.trim() || null,
    collection,
    embeddingModel,
  }
}
```

- [ ] **Step 4: Update README environment docs**

Add these variables to the environment table in `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/README.md`:

```md
| `QDRANT_URL`                 | Base URL of the self-hosted Qdrant instance                       |
| `QDRANT_API_KEY`             | Optional API key for Qdrant                                       |
| `QDRANT_COLLECTION_PROSPECTS`| Prospect memory collection name                                   |
| `EMBEDDING_MODEL`            | Embedding model identifier used by the server memory layer        |
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/memory/config.test.ts lib/memory/types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md lib/memory/config.ts lib/memory/config.test.ts lib/memory/types.ts lib/memory/types.test.ts
git commit -m "feat(memory): add qdrant config primitives"
```

### Task 2: Build embedding and Qdrant client adapters

**Files:**
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/embeddings.ts`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/qdrant-client.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/embeddings.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/qdrant-client.test.ts`

- [ ] **Step 1: Write failing tests for embedding and Qdrant adapters**

```ts
import { describe, expect, it, vi } from 'vitest'
import { embedText } from './embeddings'
import { createQdrantClient } from './qdrant-client'

describe('embedText', () => {
  it('returns a numeric vector', async () => {
    const vector = await embedText({ text: 'hello', model: 'embed-test' }, {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2] }),
      }),
    })
    expect(vector).toEqual([0.1, 0.2])
  })
})

describe('createQdrantClient', () => {
  it('writes points with namespace and payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: true }) })
    const client = createQdrantClient({ url: 'http://qdrant', collection: 'prospects', apiKey: null, fetchImpl })
    await client.upsert([{ id: 'p1', vector: [0.1], payload: { namespace: 'prospects' } }])
    expect(fetchImpl).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/memory/embeddings.test.ts lib/memory/qdrant-client.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement minimal embedding adapter**

```ts
// lib/memory/embeddings.ts
export async function embedText(
  input: { text: string; model: string },
  deps: { fetchImpl?: typeof fetch } = {}
) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const response = await fetchImpl('http://localhost/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('Embedding request failed')
  const json = (await response.json()) as { embedding?: number[] }
  if (!Array.isArray(json.embedding)) throw new Error('Embedding vector missing')
  return json.embedding
}
```

- [ ] **Step 4: Implement minimal Qdrant adapter**

```ts
// lib/memory/qdrant-client.ts
export function createQdrantClient(input: {
  url: string
  collection: string
  apiKey: string | null
  fetchImpl?: typeof fetch
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  return {
    async upsert(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>) {
      const response = await fetchImpl(
        `${input.url}/collections/${input.collection}/points?wait=true`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            ...(input.apiKey ? { apiKey: input.apiKey } : {}),
          },
          body: JSON.stringify({ points }),
        }
      )
      if (!response.ok) throw new Error('Qdrant upsert failed')
      return response.json()
    },
    async search(vector: number[], filter: Record<string, unknown>, limit: number) {
      const response = await fetchImpl(
        `${input.url}/collections/${input.collection}/points/search`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(input.apiKey ? { apiKey: input.apiKey } : {}),
          },
          body: JSON.stringify({ vector, filter, limit, with_payload: true }),
        }
      )
      if (!response.ok) throw new Error('Qdrant search failed')
      return response.json()
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/memory/embeddings.test.ts lib/memory/qdrant-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/memory/embeddings.ts lib/memory/embeddings.test.ts lib/memory/qdrant-client.ts lib/memory/qdrant-client.test.ts
git commit -m "feat(memory): add embedding and qdrant adapters"
```

### Task 3: Format Prospect events into memory points

**Files:**
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/prospect-memory.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/memory.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/prospect-memory.test.ts`

- [ ] **Step 1: Write failing tests for memory formatting**

```ts
import { describe, expect, it } from 'vitest'
import { buildProspectMemoryPoint, formatRetrievedProspectMemories } from './prospect-memory'

describe('buildProspectMemoryPoint', () => {
  it('formats a concise memory text and payload', () => {
    const point = buildProspectMemoryPoint({
      userId: 'u1',
      prospectId: 'p1',
      companyName: 'Acme',
      memoryKind: 'prospect_created',
      pipelineStatus: 'new',
      band: 'warm',
      source: 'linkedin',
      createdAt: '2026-05-26T10:00:00.000Z',
      summary: 'Needs better campaign visibility',
      painPoints: ['manual triage'],
      tags: ['saas'],
    })
    expect(point.text).toContain('Acme')
    expect(point.metadata).toMatchObject({ memory_kind: 'prospect_created', tags: ['saas'] })
  })
})

describe('formatRetrievedProspectMemories', () => {
  it('formats top-k memory snippets for prompting', () => {
    const text = formatRetrievedProspectMemories([{ text: 'Memory 1' }, { text: 'Memory 2' }])
    expect(text).toContain('Relevant memory:')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/memory/prospect-memory.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement Prospect memory formatting**

```ts
// lib/memory/prospect-memory.ts
import type { ProspectMemoryKind, ProspectMemoryPoint } from './types'

export function buildProspectMemoryPoint(input: {
  userId: string
  prospectId: string
  companyName: string
  memoryKind: ProspectMemoryKind
  pipelineStatus: string
  band: string
  source: string
  createdAt: string
  summary?: string | null
  painPoints?: string[]
  tags?: string[]
  operatorNote?: string | null
  outreachKind?: string | null
  result?: string | null
}) {
  const lines = [
    `${input.companyName} · ${input.memoryKind} · ${input.band} lead from ${input.source}.`,
    input.summary ? `Summary: ${input.summary}` : null,
    input.painPoints?.length ? `Pain points: ${input.painPoints.join(', ')}.` : null,
    input.operatorNote ? `Operator note: ${input.operatorNote}.` : null,
    input.result ? `Result: ${input.result}.` : null,
  ].filter(Boolean)
  return {
    id: `${input.prospectId}:${input.memoryKind}:${input.createdAt}`,
    userId: input.userId,
    namespace: 'prospects',
    prospectId: input.prospectId,
    companyName: input.companyName,
    memoryKind: input.memoryKind,
    pipelineStatus: input.pipelineStatus,
    band: input.band,
    source: input.source,
    createdAt: input.createdAt,
    text: lines.join(' '),
    metadata: {
      memory_kind: input.memoryKind,
      pipeline_status: input.pipelineStatus,
      tags: input.tags ?? [],
      pain_points: input.painPoints ?? [],
      outreach_kind: input.outreachKind ?? null,
      result: input.result ?? null,
    },
  } satisfies ProspectMemoryPoint
}

export function formatRetrievedProspectMemories(rows: Array<{ text: string }>) {
  if (rows.length === 0) return ''
  return ['Relevant memory:', ...rows.map((row, index) => `${index + 1}. ${row.text}`)].join('\n')
}
```

- [ ] **Step 4: Bridge existing `lib/prospect/memory.ts` to the new layer**

Update `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/prospect/memory.ts` so its existing record builder stays intact, but the new Qdrant formatter can reuse the same canonical Prospect fields instead of duplicating ad hoc shaping.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/memory/prospect-memory.test.ts lib/prospect/memory.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/memory/prospect-memory.ts lib/memory/prospect-memory.test.ts lib/prospect/memory.ts
git commit -m "feat(memory): format prospect events for qdrant"
```

### Task 4: Add best-effort writes on Prospect lifecycle events

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/approval-executor.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/prospects/route.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/approval-executor.test.ts`

- [ ] **Step 1: Write failing tests for memory writes on key Prospect events**

Add focused tests that assert a memory writer dependency is invoked for:

- Prospect creation in `run-agent-step`
- initial draft creation in `approval-executor`
- follow-up generation in `/api/studio/prospects`
- CRM note write
- `won` / `lost` transitions

Use a test double pattern like:

```ts
const memoryWrites: unknown[] = []
const writeProspectMemory = async (row: unknown) => {
  memoryWrites.push(row)
}
```

- [ ] **Step 2: Run those tests to verify they fail**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts lib/autonomy/approval-executor.test.ts
```

Expected: FAIL because the memory writer is not yet wired.

- [ ] **Step 3: Add best-effort memory writes**

Wire a `writeProspectMemory` helper into the existing lifecycle points:

- Prospect inserted in `run-agent-step` -> `prospect_created`
- initial Gmail draft materialized -> `outreach_draft_created`
- follow-up draft generated -> `follow_up_generated`
- non-empty operator note updates -> `operator_note`
- `replied` -> `reply_recorded`
- `won` -> `prospect_won`
- `lost` -> `prospect_lost`

Wrap every write in a best-effort boundary:

```ts
try {
  await writeProspectMemory(...)
} catch (error) {
  console.error('prospect memory write failed', error)
}
```

- [ ] **Step 4: Run the event tests to verify they pass**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts lib/autonomy/approval-executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/prospects/route.ts lib/autonomy/approval-executor.ts lib/autonomy/approval-executor.test.ts lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(memory): write prospect memories on lifecycle events"
```

### Task 5: Add retrieval and inject memory into Prospect generation

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/prospect-memory.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/prospects/route.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/prospect-memory.test.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.test.ts`

- [ ] **Step 1: Write failing tests for bounded retrieval**

Add tests for:

- filtering by `user_id` and namespace `prospects`
- limiting to top `k`
- formatting retrieved rows into prompt text
- graceful empty fallback

Add a Prospect runtime test that expects retrieved memory text to appear in the generated Prospect prompt context.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/memory/prospect-memory.test.ts lib/autonomy/run-agent-step.test.ts
```

Expected: FAIL because retrieval is not implemented or not injected.

- [ ] **Step 3: Implement retrieval and prompt injection**

Add:

```ts
const retrieved = await retrieveProspectMemories({
  userId,
  query: `${prospect.company_name} ${prospect.summary ?? ''}`.trim(),
  limit: 4,
})
const memoryContext = formatRetrievedProspectMemories(retrieved)
```

Inject `memoryContext` only in:

- new Prospect draft generation
- follow-up generation

If retrieval fails or returns nothing:

```ts
const memoryContext = ''
```

- [ ] **Step 4: Run retrieval tests to verify they pass**

Run:

```bash
npm test -- lib/memory/prospect-memory.test.ts lib/autonomy/run-agent-step.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/prospect-memory.ts lib/memory/prospect-memory.test.ts lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts app/api/studio/prospects/route.ts
git commit -m "feat(memory): retrieve prospect memories for prompt context"
```

### Task 6: Verify fallback behavior and live validation hooks

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/scripts/smoke-prospect-outbound.mjs`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/docs/runbooks/coolify-deploy.md`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/memory/prospect-memory.test.ts`

- [ ] **Step 1: Add failing tests for fallback behavior**

Add tests that assert:

- failed Qdrant write does not throw through Prospect lifecycle code;
- failed retrieval returns empty memory context;
- the smoke helper remains runnable without a live Qdrant dependency if memory is disabled.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/memory/prospect-memory.test.ts
```

Expected: FAIL until fallback behavior is implemented.

- [ ] **Step 3: Implement smoke/docs updates**

Document and encode the live validation path:

- enable Qdrant env vars;
- run `npm run smoke:prospect`;
- confirm memory writes and retrieval logging or inspection path;
- confirm Prospect still runs if Qdrant is disabled.

Update the smoke script only as needed to avoid forcing a hard dependency on Qdrant when the env is absent.

- [ ] **Step 4: Run final verification**

Run:

```bash
npm test -- lib/memory/config.test.ts lib/memory/types.test.ts lib/memory/embeddings.test.ts lib/memory/qdrant-client.test.ts lib/memory/prospect-memory.test.ts lib/autonomy/run-agent-step.test.ts lib/autonomy/approval-executor.test.ts
npm run typecheck
npm run build
node --check scripts/smoke-prospect-outbound.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/coolify-deploy.md scripts/smoke-prospect-outbound.mjs lib/memory/prospect-memory.test.ts
git commit -m "test(memory): verify qdrant fallback and live validation flow"
```
