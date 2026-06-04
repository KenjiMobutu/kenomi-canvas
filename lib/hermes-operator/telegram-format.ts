export function formatTelegramOperatorReply(input: {
  summary: string
  lines?: string[]
}): string {
  return [input.summary, ...(input.lines ?? [])].join('\n').trim()
}
