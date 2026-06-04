import { describe, expect, it } from 'vitest'

import {
  buildHermesOperatorSettingsUpsert,
  mapHermesOperatorSettingsRecord,
} from '@/lib/hermes-operator/settings'

describe('hermes operator settings telegram mapping', () => {
  it('hydrates telegram settings from a persisted row', () => {
    expect(
      mapHermesOperatorSettingsRecord({
        operator_mode: 'act',
        notify_in_studio: true,
        notification_mode: 'webhook',
        max_auto_actions_per_day: 8,
        max_auto_prospect_runs_per_day: 5,
        max_auto_follow_up_scans_per_day: 4,
        max_auto_devops_runs_per_day: 3,
        telegram_enabled: true,
        telegram_allowed_chat_id: '12345',
        telegram_notifications_enabled: true,
        telegram_bot_label: 'Ops Hermes',
      })
    ).toMatchObject({
      operatorMode: 'act',
      notificationMode: 'webhook',
      telegramEnabled: true,
      telegramAllowedChatId: '12345',
      telegramNotificationsEnabled: true,
      telegramBotLabel: 'Ops Hermes',
    })
  })

  it('serializes telegram settings for upsert and normalizes blank bot labels to Hermes', () => {
    expect(
      buildHermesOperatorSettingsUpsert({
        userId: 'user-1',
        nowIso: '2026-06-04T12:00:00.000Z',
        settings: {
          telegramEnabled: true,
          telegramAllowedChatId: '999',
          telegramNotificationsEnabled: true,
          telegramBotLabel: '',
        },
      })
    ).toMatchObject({
      user_id: 'user-1',
      telegram_enabled: true,
      telegram_allowed_chat_id: '999',
      telegram_notifications_enabled: true,
      telegram_bot_label: 'Hermes',
    })
  })
})
