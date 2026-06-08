import type { ProspectOutreachDraft, ProspectOutreachInput } from './types'
import { DIAGNOSTIC_CASH_LANE, getDiagnosticCashLaneUrl } from '@/lib/revenue/diagnostic-cash-lane'

function firstPainPoint(painPoints: string[]): string {
  return painPoints.find((painPoint) => painPoint.trim().length > 0) ?? 'lead follow-up delays'
}

export function buildProspectOutreach(input: ProspectOutreachInput): ProspectOutreachDraft {
  const opener = input.contactName ? `Hi ${input.contactName},` : `Hi ${input.companyName},`
  const painPoint = firstPainPoint(input.painPoints)
  const laneUrl = getDiagnosticCashLaneUrl()
  const subject =
    input.band === 'hot'
      ? `${input.companyName} — ${DIAGNOSTIC_CASH_LANE.offer.title} for follow-up drag`
      : `${input.companyName} — ${DIAGNOSTIC_CASH_LANE.offer.title} to tighten ${painPoint}`

  const body = [
    opener,
    '',
    `I found ${input.companyName} via ${input.source} and picked up a likely sales leak: ${painPoint}.`,
    `I run a fixed-scope ${DIAGNOSTIC_CASH_LANE.offer.title} for ${DIAGNOSTIC_CASH_LANE.segment.title.toLowerCase()}.`,
    'It is built to tighten lead-response flow, follow-up discipline, and the path from reply to paid without adding process overhead.',
    '',
    'What is included:',
    '- one short diagnostic call',
    '- a written action plan within 48h',
    '- the next fixes that should move cash first',
    '',
    `Exact scope: ${laneUrl}`,
    '',
    input.band === 'hot'
      ? `If the timing is right, you can book the ${DIAGNOSTIC_CASH_LANE.offer.title.toLowerCase()} directly or reply and I will point to the right angle.`
      : `If this maps to what you are seeing, you can book the ${DIAGNOSTIC_CASH_LANE.offer.title.toLowerCase()} directly or reply and I will tell you if the fit is real.`,
  ].join('\n')

  return {
    subject,
    body,
    cta: `Book the ${DIAGNOSTIC_CASH_LANE.offer.title}: ${laneUrl}`,
  }
}
