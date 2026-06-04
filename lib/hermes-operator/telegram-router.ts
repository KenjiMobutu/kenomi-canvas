import type { TelegramCommandKind } from '@/lib/hermes-operator/telegram-types'

type TelegramRouteResult = {
  kind: TelegramCommandKind
  normalizedText: string
  blockedReason?: string
}

export function routeTelegramCommand(rawText: string): TelegramRouteResult {
  const normalizedText = rawText.trim().toLowerCase()

  if (normalizedText === '/brief' || normalizedText.includes('what should i do now')) {
    return {
      kind: 'read_brief',
      normalizedText,
    }
  }

  if (normalizedText === '/revenue' || normalizedText.includes('cash blocked')) {
    return {
      kind: 'read_revenue',
      normalizedText,
    }
  }

  if (normalizedText === '/run_prospect' || normalizedText === 'run prospect') {
    return {
      kind: 'run_prospect',
      normalizedText,
    }
  }

  if (
    normalizedText === '/run_devops' ||
    normalizedText === 'run devops' ||
    normalizedText === 'launch devops'
  ) {
    return {
      kind: 'run_devops',
      normalizedText,
    }
  }

  if (normalizedText === '/scan_followups' || normalizedText === 'scan followups') {
    return {
      kind: 'scan_followups',
      normalizedText,
    }
  }

  return {
    kind: 'refuse',
    normalizedText,
    blockedReason: 'unsupported_command',
  }
}
