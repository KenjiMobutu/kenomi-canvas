import type { ProspectMemoryInput, ProspectMemoryRecord } from './types'

export function buildProspectMemoryRecord(input: ProspectMemoryInput): ProspectMemoryRecord {
  return {
    namespace: 'prospects',
    id: input.id,
    text: `${input.companyName} :: ${input.summary}`,
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
