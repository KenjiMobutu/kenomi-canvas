export type HermesNotificationMode = 'studio_only' | 'email' | 'webhook'

export type HermesOperatorSettings = {
  operatorMode: 'observe' | 'recommend' | 'act'
  notifyInStudio: boolean
  notificationMode: HermesNotificationMode
  maxAutoActionsPerDay: number
  maxAutoProspectRunsPerDay: number
  maxAutoFollowUpScansPerDay: number
  maxAutoDevopsRunsPerDay: number
}

export const DEFAULT_HERMES_OPERATOR_SETTINGS: HermesOperatorSettings = {
  operatorMode: 'observe',
  notifyInStudio: true,
  notificationMode: 'studio_only',
  maxAutoActionsPerDay: 6,
  maxAutoProspectRunsPerDay: 3,
  maxAutoFollowUpScansPerDay: 2,
  maxAutoDevopsRunsPerDay: 1,
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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
    updated_at: input.nowIso,
  }
}
