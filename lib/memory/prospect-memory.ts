import { createHash } from 'crypto'
import { getMemoryConfig } from './config'
import { embedText } from './embeddings'
import { createQdrantClient } from './qdrant-client'
import type { ProspectMemoryKind, ProspectMemoryPoint, ProspectMemorySearchResult } from './types'
import { hasSyntheticBusinessMarker } from '@/lib/revenue/synthetic-data'

type BuildProspectMemoryPointInput = {
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
}

type WriteProspectMemoryResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'disabled' }

type EmbedTextImpl = typeof embedText
type QdrantClient = ReturnType<typeof createQdrantClient>

function nonEmptyStrings(values: string[] | null | undefined) {
  return (values ?? []).filter((value) => value.trim().length > 0)
}

function buildProspectMemoryPointId(input: Pick<BuildProspectMemoryPointInput, 'prospectId' | 'memoryKind' | 'createdAt'>) {
  const hex = createHash('sha256')
    .update(`${input.prospectId}:${input.memoryKind}:${input.createdAt}`)
    .digest('hex')
    .slice(0, 32)

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function buildProspectMemoryText(input: Omit<BuildProspectMemoryPointInput, 'userId' | 'prospectId' | 'createdAt'>) {
  const lines = [
    `${input.companyName} · ${input.memoryKind} · ${input.band} lead from ${input.source}.`,
    input.summary ? `Summary: ${input.summary}` : null,
    input.painPoints?.length ? `Pain points: ${input.painPoints.join(', ')}.` : null,
    input.operatorNote ? `Operator note: ${input.operatorNote}.` : null,
    input.result ? `Result: ${input.result}.` : null,
  ].filter(Boolean)

  return lines.join(' ')
}

export function buildProspectMemoryPoint(input: BuildProspectMemoryPointInput) {
  return {
    id: buildProspectMemoryPointId(input),
    userId: input.userId,
    namespace: 'prospects',
    prospectId: input.prospectId,
    companyName: input.companyName,
    memoryKind: input.memoryKind,
    pipelineStatus: input.pipelineStatus,
    band: input.band,
    source: input.source,
    createdAt: input.createdAt,
    text: buildProspectMemoryText(input),
    metadata: {
      memory_kind: input.memoryKind,
      pipeline_status: input.pipelineStatus,
      tags: nonEmptyStrings(input.tags),
      pain_points: nonEmptyStrings(input.painPoints),
      outreach_kind: input.outreachKind ?? null,
      result: input.result ?? null,
    },
  } satisfies ProspectMemoryPoint
}

export function formatRetrievedProspectMemories(rows: Array<{ text: string }>) {
  if (rows.length === 0) return ''
  return ['Relevant memory:', ...rows.map((row, index) => `${index + 1}. ${row.text}`)].join('\n')
}

function mapPointToPayload(point: ProspectMemoryPoint) {
  return {
    text: point.text,
    namespace: point.namespace,
    user_id: point.userId,
    prospect_id: point.prospectId,
    company_name: point.companyName,
    memory_kind: point.memoryKind,
    pipeline_status: point.pipelineStatus,
    band: point.band,
    source: point.source,
    created_at: point.createdAt,
    ...point.metadata,
  }
}

function toSearchResults(raw: unknown): ProspectMemorySearchResult[] {
  const result = raw && typeof raw === 'object' && 'result' in raw ? raw.result : raw
  if (!Array.isArray(result)) return []

  return result.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const payload =
      'payload' in row && row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {}
    const text = typeof payload.text === 'string' ? payload.text : ''
    const id = 'id' in row && typeof row.id === 'string' ? row.id : ''
    const score = 'score' in row && typeof row.score === 'number' ? row.score : null
    if (!text) return []
    return [{ id, text, score, payload }]
  })
}

function isSyntheticProspectMemoryResult(row: ProspectMemorySearchResult): boolean {
  return hasSyntheticBusinessMarker(row.text) || hasSyntheticBusinessMarker(row.payload)
}

export async function writeProspectMemory(
  input: BuildProspectMemoryPointInput,
  deps: {
    env?: NodeJS.ProcessEnv
    embedTextImpl?: EmbedTextImpl
    createQdrantClientImpl?: typeof createQdrantClient
  } = {}
): Promise<WriteProspectMemoryResult> {
  const config = getMemoryConfig(deps.env ?? process.env)
  if (!config.enabled) return { ok: false, reason: 'disabled' }

  const point = buildProspectMemoryPoint(input)
  const embedTextImpl = deps.embedTextImpl ?? embedText
  const createQdrantClientImpl = deps.createQdrantClientImpl ?? createQdrantClient

  const vector = await embedTextImpl({
    text: point.text,
    model: config.embeddingModel,
    baseUrl: config.embeddingBaseUrl,
  })

  const client = createQdrantClientImpl({
    url: config.url,
    collection: config.collection,
    apiKey: config.apiKey,
  })

  await client.upsert([
    {
      id: point.id,
      vector,
      payload: mapPointToPayload(point),
    },
  ])

  return { ok: true, id: point.id }
}

export async function retrieveProspectMemories(
  input: { userId: string; query: string; limit: number },
  deps: {
    env?: NodeJS.ProcessEnv
    embedTextImpl?: EmbedTextImpl
    createQdrantClientImpl?: typeof createQdrantClient
  } = {}
): Promise<ProspectMemorySearchResult[]> {
  const config = getMemoryConfig(deps.env ?? process.env)
  if (!config.enabled || input.query.trim().length === 0) return []

  try {
    const embedTextImpl = deps.embedTextImpl ?? embedText
    const createQdrantClientImpl = deps.createQdrantClientImpl ?? createQdrantClient
    const vector = await embedTextImpl({
      text: input.query,
      model: config.embeddingModel,
      baseUrl: config.embeddingBaseUrl,
    })
    const client = createQdrantClientImpl({
      url: config.url,
      collection: config.collection,
      apiKey: config.apiKey,
    })

    const response = await client.search(vector, { namespace: 'prospects', user_id: input.userId }, input.limit)
    return toSearchResults(response).filter((row) => !isSyntheticProspectMemoryResult(row))
  } catch {
    return []
  }
}
