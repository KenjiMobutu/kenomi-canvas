type TelegramBriefResponseInput = {
  brief: {
    headline: string
    nextAction: {
      title: string
    }
  }
  alerts: Array<{
    headline: string
  }>
}

export function buildTelegramBriefResponse(input: TelegramBriefResponseInput) {
  return {
    kind: 'read_brief' as const,
    summary: `${input.brief.headline}. Next: ${input.brief.nextAction.title}.`,
    lines: input.alerts.slice(0, 2).map((alert) => `- ${alert.headline}`),
  }
}
