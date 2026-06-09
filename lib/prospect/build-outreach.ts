import type { ProspectOutreachDraft, ProspectOutreachInput } from './types'
import {
  DIAGNOSTIC_CASH_LANE,
  getDiagnosticCashLaneUrl,
  getTrackedDiagnosticCashLaneUrl,
} from '@/lib/revenue/diagnostic-cash-lane'

function firstPainPoint(painPoints: string[]): string {
  return painPoints.find((painPoint) => painPoint.trim().length > 0) ?? 'lead follow-up delays'
}

export function summarizePainPointForSubject(painPoint: string): string {
  const normalized = painPoint.trim().toLowerCase()
  if (!normalized) return 'slower lead response'

  if (normalized.includes('follow-up') || normalized.includes('follow up')) {
    if (normalized.includes('delivery')) return 'lead follow-up drag'
    if (normalized.includes('response')) return 'slower lead response'
    if (normalized.includes('discipline')) return 'follow-up drift'
    return 'lead follow-up drag'
  }

  if (
    normalized.includes('lead qualification') ||
    normalized.includes('lead triage') ||
    normalized.includes('manual triage')
  ) {
    return 'manual lead qualification'
  }

  if (normalized.includes('response time')) return 'slower lead response'
  if (normalized.includes('reply')) return 'reply-to-paid drag'
  if (normalized.includes('sales admin')) return 'sales admin overhead'
  if (normalized.includes('new business')) return 'new-business drag'

  return painPoint.trim()
}

function buildTeardownPoints(input: {
  companyName: string
  painPoint: string
  focus: ProspectOutreachInput['focus']
}) {
  const subjectPainPoint = summarizePainPointForSubject(input.painPoint)

  if (input.focus === 'reply') {
    return [
      `Your first-response path likely loses momentum because ${subjectPainPoint} is still treated like an internal ops problem rather than a conversion step.`,
      `The handoff between interest and human follow-up looks heavier than it needs to be, which usually leaks intent before a real conversation starts.`,
      `A tighter reply path with one clearer next step would likely convert more of the demand you already create into live sales conversations.`,
    ]
  }

  if (input.focus === 'crm') {
    return [
      `${input.companyName} likely has enough signal already, but ${subjectPainPoint} still forces too much manual judgment before a lead gets a clear next step.`,
      `The current qualification path probably asks the team to interpret interest manually instead of routing obvious opportunities fast.`,
      `A simpler cash-first queue would usually recover more pipeline without adding another CRM ritual.`,
    ]
  }

  return [
    `${input.companyName} likely leaks intent because ${subjectPainPoint} still sits between interest and a concrete next step.`,
    `The current path probably makes a qualified lead work too hard to move from curiosity to conversation.`,
    `A shorter response layer tied to one immediate outcome would usually convert more existing demand into pipeline.`,
  ]
}

export function buildProspectOutreach(input: ProspectOutreachInput): ProspectOutreachDraft {
  const firstName = input.contactName?.trim()?.split(/\s+/)[0] ?? null
  const opener = firstName ? `Hi ${firstName},` : `Hi ${input.companyName},`
  const painPoint = firstPainPoint(input.painPoints)
  const subjectPainPoint = summarizePainPointForSubject(painPoint)
  const laneUrl =
    input.prospectId || input.contactEmail || input.outreachAngle
      ? getTrackedDiagnosticCashLaneUrl({
          prospectId: input.prospectId,
          email: input.contactEmail,
          outreachAngle: input.outreachAngle,
          utmSource: 'outbound_email',
          utmMedium: 'email',
          utmCampaign: input.outreachAngle ?? DIAGNOSTIC_CASH_LANE.messageFamily.slug,
          utmContent: input.prospectId ?? null,
        })
      : getDiagnosticCashLaneUrl()
  const subject = firstName
    ? `${firstName}, I wrote this 3-point teardown for ${input.companyName}`
    : `${input.companyName} — 3-point teardown for ${subjectPainPoint}`
  const teardown = buildTeardownPoints({
    companyName: input.companyName,
    painPoint,
    focus: input.focus,
  })

  const body = [
    opener,
    '',
    `I found ${input.companyName} via ${input.source} and picked up a likely leak around ${painPoint}.`,
    '',
    'Rather than tease a teardown, here it is directly:',
    `1. ${teardown[0]}`,
    `2. ${teardown[1]}`,
    `3. ${teardown[2]}`,
    '',
    `If this maps to what you are seeing, the paid next step is a fixed-scope ${DIAGNOSTIC_CASH_LANE.offer.title}.`,
    'It includes one short diagnostic call and a written action plan within 48h.',
    `Scope: ${laneUrl}`,
    '',
    'If useful, reply yes and I will send the next 3 fixes I would test first.',
  ].join('\n')

  return {
    subject,
    body,
    cta: `Reply yes for the next 3 fixes or book the ${DIAGNOSTIC_CASH_LANE.offer.title}: ${laneUrl}`,
  }
}
