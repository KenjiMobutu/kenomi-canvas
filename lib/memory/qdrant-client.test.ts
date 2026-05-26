import { describe, expect, it, vi } from 'vitest'
import { createQdrantClient } from './qdrant-client'

describe('createQdrantClient', () => {
  it('writes points with namespace and payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: true }) })
    const client = createQdrantClient({
      url: 'http://qdrant',
      collection: 'prospects',
      apiKey: null,
      fetchImpl,
    })

    await client.upsert([{ id: 'p1', vector: [0.1], payload: { namespace: 'prospects' } }])

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://qdrant/collections/prospects/points?wait=true',
      expect.objectContaining({
        method: 'PUT',
      })
    )
  })

  it('builds a namespaced filter for search', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ id: 'p1', score: 0.9, payload: { text: 'memo' } }] }),
    })
    const client = createQdrantClient({
      url: 'http://qdrant',
      collection: 'prospects',
      apiKey: 'secret',
      fetchImpl,
    })

    await client.search([0.5], { namespace: 'prospects', user_id: 'u1' }, 4)

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://qdrant/collections/prospects/points/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'secret' }),
      })
    )
  })
})
