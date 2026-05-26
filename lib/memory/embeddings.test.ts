import { describe, expect, it, vi } from 'vitest'
import { embedText } from './embeddings'

describe('embedText', () => {
  it('returns a numeric vector', async () => {
    const vector = await embedText(
      {
        text: 'hello',
        model: 'embed-test',
        baseUrl: 'http://ollama:11434',
      },
      {
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ embeddings: [[0.1, 0.2]] }),
        }),
      }
    )

    expect(vector).toEqual([0.1, 0.2])
  })
})
