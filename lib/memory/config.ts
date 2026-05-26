export interface MemoryConfig {
  enabled: boolean
  url: string
  apiKey: string | null
  collection: string
  embeddingModel: string
  embeddingBaseUrl: string
}

export function getMemoryConfig(env: NodeJS.ProcessEnv = process.env): MemoryConfig {
  const url = env.QDRANT_URL?.trim() ?? ''
  const collection = env.QDRANT_COLLECTION_PROSPECTS?.trim() ?? ''
  const embeddingModel = env.EMBEDDING_MODEL?.trim() ?? ''
  const embeddingBaseUrl = (env.OLLAMA_BASE_URL?.trim() || 'http://192.168.0.14:11434').replace(
    /\/+$/,
    ''
  )

  return {
    enabled: Boolean(url && collection && embeddingModel),
    url,
    apiKey: env.QDRANT_API_KEY?.trim() || null,
    collection,
    embeddingModel,
    embeddingBaseUrl,
  }
}
