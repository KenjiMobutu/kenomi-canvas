import { describe, expect, it, vi } from 'vitest'
import {
  buildProspectMemoryPoint,
  formatRetrievedProspectMemories,
  retrieveProspectMemories,
  writeProspectMemory,
} from './prospect-memory'

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

  it('returns empty text for empty retrievals', () => {
    expect(formatRetrievedProspectMemories([])).toBe('')
  })
})

describe('writeProspectMemory', () => {
  it('returns disabled when memory config is absent', async () => {
    const result = await writeProspectMemory(
      {
        userId: 'u1',
        prospectId: 'p1',
        companyName: 'Acme',
        memoryKind: 'prospect_created',
        pipelineStatus: 'new',
        band: 'warm',
        source: 'linkedin',
        createdAt: '2026-05-26T10:00:00.000Z',
      },
      { env: {} as NodeJS.ProcessEnv }
    )

    expect(result).toMatchObject({ ok: false, reason: 'disabled' })
  })
})

describe('retrieveProspectMemories', () => {
  it('filters by user and namespace and limits top-k', async () => {
    const search = vi.fn().mockResolvedValue({
      result: [{ id: 'p1', score: 0.9, payload: { text: 'Memory 1' } }],
    })
    const memories = await retrieveProspectMemories(
      {
        userId: 'u1',
        query: 'Acme outbound',
        limit: 4,
      },
      {
        env: {
          QDRANT_URL: 'http://qdrant',
          QDRANT_COLLECTION_PROSPECTS: 'prospects',
          EMBEDDING_MODEL: 'nomic-embed-text:latest',
          OLLAMA_BASE_URL: 'http://ollama:11434',
        } as unknown as NodeJS.ProcessEnv,
        embedTextImpl: vi.fn().mockResolvedValue([0.1, 0.2]),
        createQdrantClientImpl: () =>
          ({
            upsert: vi.fn(),
            search,
          }) as never,
      }
    )

    expect(memories).toEqual([
      expect.objectContaining({
        id: 'p1',
        text: 'Memory 1',
      }),
    ])
    expect(search).toHaveBeenCalledWith([0.1, 0.2], { namespace: 'prospects', user_id: 'u1' }, 4)
  })

  it('returns an empty list when retrieval fails', async () => {
    const memories = await retrieveProspectMemories(
      {
        userId: 'u1',
        query: 'Acme outbound',
        limit: 4,
      },
      {
        env: {
          QDRANT_URL: 'http://qdrant',
          QDRANT_COLLECTION_PROSPECTS: 'prospects',
          EMBEDDING_MODEL: 'nomic-embed-text:latest',
          OLLAMA_BASE_URL: 'http://ollama:11434',
        } as unknown as NodeJS.ProcessEnv,
        embedTextImpl: vi.fn().mockRejectedValue(new Error('embedding failed')),
      }
    )

    expect(memories).toEqual([])
  })
})
