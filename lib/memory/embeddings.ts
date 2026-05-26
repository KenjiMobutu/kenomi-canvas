export async function embedText(
  input: { text: string; model: string; baseUrl: string },
  deps: { fetchImpl?: typeof fetch } = {}
) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const response = await fetchImpl(`${input.baseUrl.replace(/\/+$/, '')}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: input.model, input: input.text }),
  })

  if (!response.ok) throw new Error('Embedding request failed')

  const json = (await response.json()) as { embeddings?: number[][]; embedding?: number[] }
  const embedding = Array.isArray(json.embedding)
    ? json.embedding
    : Array.isArray(json.embeddings?.[0])
      ? json.embeddings[0]
      : null

  if (!embedding) throw new Error('Embedding vector missing')
  return embedding
}
