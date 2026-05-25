import type { ProspectOutreachDraft, ProspectOutreachInput } from './types'

function firstPainPoint(painPoints: string[]): string {
  return painPoints.find((painPoint) => painPoint.trim().length > 0) ?? 'lead follow-up delays'
}

export function buildProspectOutreach(input: ProspectOutreachInput): ProspectOutreachDraft {
  const opener = input.contactName ? `Hi ${input.contactName},` : `Hi ${input.companyName},`
  const painPoint = firstPainPoint(input.painPoints)
  const subject =
    input.band === 'hot'
      ? `${input.companyName} — quick follow-up on your pipeline`
      : `${input.companyName} — a faster way to handle ${painPoint}`

  const body = [
    opener,
    '',
    `I found ${input.companyName} via ${input.source} and noticed the score is ${input.score}/100.`,
    `The main issue I picked up is ${painPoint}.`,
    `I think this can be tightened up without adding overhead to your current workflow.`,
    '',
    input.band === 'hot'
      ? 'If it helps, I can send a short fit summary and a concrete next step.'
      : 'If this is relevant, I can share a concise idea on how to improve response speed.',
  ].join('\n')

  return {
    subject,
    body,
    cta:
      input.band === 'hot'
        ? 'Reply and I will send the short fit summary.'
        : 'Reply if this is worth a quick follow-up.',
  }
}
