import { DIAGNOSTIC_CASH_LANE } from '@/lib/revenue/diagnostic-cash-lane'

type TelegramBriefResponseInput = {
  brief: {
    headline: string
    topBlocker?: string
    mainLeak?: string
    nextAction: {
      title: string
    }
  }
  alerts: Array<{
    headline: string
  }>
}

type TelegramRevenueResponseInput = {
  paidCashEur: number
  blockedCashEur: number
  pendingApprovals: number
}

export function buildTelegramBriefResponse(input: TelegramBriefResponseInput) {
  return {
    kind: 'read_brief' as const,
    summary: `${DIAGNOSTIC_CASH_LANE.offer.title}: ${input.brief.headline}. Next: ${input.brief.nextAction.title}.`,
    lines: [
      ...(input.brief.topBlocker ? [`- Blocker: ${input.brief.topBlocker}`] : []),
      ...(input.brief.mainLeak ? [`- Leak: ${input.brief.mainLeak}`] : []),
      ...input.alerts.slice(0, 1).map((alert) => `- ${alert.headline}`),
    ],
  }
}

export function buildTelegramRevenueResponse(input: TelegramRevenueResponseInput) {
  return {
    kind: 'read_revenue' as const,
    summary: `Paid cash ${input.paidCashEur} EUR. Blocked cash ${input.blockedCashEur} EUR.`,
    lines: [`- Pending approvals: ${input.pendingApprovals}`],
  }
}

export function buildTelegramBlockedResponse(input: {
  blockedReason: string
  summary?: string
}) {
  return {
    kind: 'refuse' as const,
    summary: input.summary ?? 'Blocked: request refused by policy.',
    blockedReason: input.blockedReason,
  }
}
