import { describe, expect, it } from 'vitest'
import { getMemoryConfig } from './config'

describe('getMemoryConfig', () => {
  it('returns disabled config when Qdrant vars are missing', () => {
    expect(getMemoryConfig({} as NodeJS.ProcessEnv)).toMatchObject({ enabled: false })
  })

  it('returns enabled config when required vars are present', () => {
    expect(
      getMemoryConfig({
        QDRANT_URL: 'http://qdrant:6333',
        QDRANT_COLLECTION_PROSPECTS: 'prospects',
        EMBEDDING_MODEL: 'nomic-embed-text:latest',
        QDRANT_API_KEY: 'secret',
        OLLAMA_BASE_URL: 'http://ollama:11434/',
      } as unknown as NodeJS.ProcessEnv)
    ).toMatchObject({
      enabled: true,
      url: 'http://qdrant:6333',
      collection: 'prospects',
      embeddingModel: 'nomic-embed-text:latest',
      apiKey: 'secret',
      embeddingBaseUrl: 'http://ollama:11434',
    })
  })
})
