export type TelegramCommandKind =
  | 'read_brief'
  | 'read_revenue'
  | 'read_alerts'
  | 'read_approvals'
  | 'read_prospects'
  | 'run_prospect'
  | 'run_devops'
  | 'scan_followups'
  | 'refuse'

export type TelegramOperatorSettings = {
  enabled: boolean
  allowedChatId: string
  notificationsEnabled: boolean
  botLabel: string
}

export const DEFAULT_TELEGRAM_OPERATOR_SETTINGS: TelegramOperatorSettings = {
  enabled: false,
  allowedChatId: '',
  notificationsEnabled: false,
  botLabel: 'Hermes',
}

export function normalizeTelegramCommandKind(value: unknown): TelegramCommandKind {
  switch (value) {
    case 'read_brief':
    case 'read_revenue':
    case 'read_alerts':
    case 'read_approvals':
    case 'read_prospects':
    case 'run_prospect':
    case 'run_devops':
    case 'scan_followups':
      return value
    default:
      return 'refuse'
  }
}
