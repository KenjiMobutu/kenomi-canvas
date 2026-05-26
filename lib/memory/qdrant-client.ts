function buildFilter(filter: Record<string, unknown>) {
  return {
    must: Object.entries(filter).map(([key, value]) => ({
      key,
      match: { value },
    })),
  }
}

export function createQdrantClient(input: {
  url: string
  collection: string
  apiKey: string | null
  fetchImpl?: typeof fetch
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const baseHeaders = {
    'content-type': 'application/json',
    ...(input.apiKey ? { 'api-key': input.apiKey } : {}),
  }

  return {
    async upsert(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>) {
      const response = await fetchImpl(`${input.url}/collections/${input.collection}/points?wait=true`, {
        method: 'PUT',
        headers: baseHeaders,
        body: JSON.stringify({ points }),
      })
      if (!response.ok) throw new Error('Qdrant upsert failed')
      return response.json()
    },
    async search(vector: number[], filter: Record<string, unknown>, limit: number) {
      const response = await fetchImpl(`${input.url}/collections/${input.collection}/points/search`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          vector,
          filter: buildFilter(filter),
          limit,
          with_payload: true,
        }),
      })
      if (!response.ok) throw new Error('Qdrant search failed')
      return response.json()
    },
  }
}
