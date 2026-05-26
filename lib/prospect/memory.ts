import type { ProspectMemoryInput, ProspectMemoryRecord } from './types'
import { buildProspectMemoryText } from '@/lib/memory/prospect-memory'

export function buildProspectMemoryRecord(input: ProspectMemoryInput): ProspectMemoryRecord {
  return {
    namespace: 'prospects',
    id: input.id,
    text: buildProspectMemoryText({
      companyName: input.companyName,
      memoryKind: 'prospect_created',
      pipelineStatus: 'new',
      band: input.band,
      source: input.source,
      summary: input.summary,
      painPoints: input.tags,
    }),
    metadata: {
      companyName: input.companyName,
      source: input.source,
      score: input.score,
      band: input.band,
      summary: input.summary,
      tags: input.tags,
      contactName: input.contactName ?? null,
      contactRole: input.contactRole ?? null,
      contactEmail: input.contactEmail ?? null,
    },
  }
}
