export type HermesNotificationMode = 'studio_only' | 'email' | 'webhook'

import { DEFAULT_TELEGRAM_OPERATOR_SETTINGS } from '@/lib/hermes-operator/telegram-types'

export type HermesOperatorSettings = {
  operatorMode: 'observe' | 'recommend' | 'act'
  notifyInStudio: boolean
  notificationMode: HermesNotificationMode
  maxAutoActionsPerDay: number
  maxAutoProspectRunsPerDay: number
  maxAutoFollowUpScansPerDay: number
  maxAutoDevopsRunsPerDay: number
  telegramEnabled: boolean
  telegramAllowedChatId: string
  telegramNotificationsEnabled: boolean
  telegramBotLabel: string
}

export const DEFAULT_HERMES_OPERATOR_SETTINGS: HermesOperatorSettings = {
  operatorMode: 'observe',
  notifyInStudio: true,
  notificationMode: 'studio_only',
  maxAutoActionsPerDay: 6,
  maxAutoProspectRunsPerDay: 3,
  maxAutoFollowUpScansPerDay: 2,
  maxAutoDevopsRunsPerDay: 1,
  telegramEnabled: DEFAULT_TELEGRAM_OPERATOR_SETTINGS.enabled,
  telegramAllowedChatId: DEFAULT_TELEGRAM_OPERATOR_SETTINGS.allowedChatId,
  telegramNotificationsEnabled: DEFAULT_TELEGRAM_OPERATOR_SETTINGS.notificationsEnabled,
  telegramBotLabel: DEFAULT_TELEGRAM_OPERATOR_SETTINGS.botLabel,
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeTelegramBotLabel(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : DEFAULT_HERMES_OPERATOR_SETTINGS.telegramBotLabel
}

export function normalizeHermesNotificationMode(value: unknown): HermesNotificationMode {
  return value === 'email' || value === 'webhook' ? value : 'studio_only'
}

export function mapHermesOperatorSettingsRecord(
  row: Record<string, unknown> | null | undefined
): HermesOperatorSettings {
  if (!row) return { ...DEFAULT_HERMES_OPERATOR_SETTINGS }

  return {
    operatorMode:
      row.operator_mode === 'recommend' || row.operator_mode === 'act' ? row.operator_mode : 'observe',
    notifyInStudio: row.notify_in_studio !== false,
    notificationMode: normalizeHermesNotificationMode(row.notification_mode),
    maxAutoActionsPerDay: positiveInt(
      row.max_auto_actions_per_day,
      DEFAULT_HERMES_OPERATOR_SETTINGS.maxAutoActionsPerDay
    ),
    maxAutoProspectRunsPerDay: positiveInt(
      row.max_auto_prospect_runs_per_day,
      DEFAULT_HERMES_OPERATOR_SETTINGS.maxAutoProspectRunsPerDay
    ),
    maxAutoFollowUpScansPerDay: positiveInt(
      row.max_auto_follow_up_scans_per_day,
      DEFAULT_HERMES_OPERATOR_SETTINGS.maxAutoFollowUpScansPerDay
    ),
    maxAutoDevopsRunsPerDay: positiveInt(
      row.max_auto_devops_runs_per_day,
      DEFAULT_HERMES_OPERATOR_SETTINGS.maxAutoDevopsRunsPerDay
    ),
    telegramEnabled: row.telegram_enabled === true,
    telegramAllowedChatId:
      typeof row.telegram_allowed_chat_id === 'string'
        ? row.telegram_allowed_chat_id
        : DEFAULT_HERMES_OPERATOR_SETTINGS.telegramAllowedChatId,
    telegramNotificationsEnabled: row.telegram_notifications_enabled === true,
    telegramBotLabel: normalizeTelegramBotLabel(row.telegram_bot_label),
  }
}

export function buildHermesOperatorSettingsUpsert(input: {
  userId: string
  nowIso: string
  settings?: Partial<HermesOperatorSettings>
}) {
  const settings = {
    ...DEFAULT_HERMES_OPERATOR_SETTINGS,
    ...(input.settings ?? {}),
  }

  return {
    user_id: input.userId,
    operator_mode: settings.operatorMode,
    notify_in_studio: settings.notifyInStudio,
    notify_email: settings.notificationMode === 'email',
    notify_webhook: settings.notificationMode === 'webhook',
    notification_mode: settings.notificationMode,
    notification_webhook_url: '',
    quiet_hours: {},
    max_auto_actions_per_day: settings.maxAutoActionsPerDay,
    max_auto_prospect_runs_per_day: settings.maxAutoProspectRunsPerDay,
    max_auto_follow_up_scans_per_day: settings.maxAutoFollowUpScansPerDay,
    max_auto_devops_runs_per_day: settings.maxAutoDevopsRunsPerDay,
    telegram_enabled: settings.telegramEnabled,
    telegram_allowed_chat_id: settings.telegramAllowedChatId,
    telegram_notifications_enabled: settings.telegramNotificationsEnabled,
    telegram_bot_label: normalizeTelegramBotLabel(settings.telegramBotLabel),
    updated_at: input.nowIso,
  }
}
