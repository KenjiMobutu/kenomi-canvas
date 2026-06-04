import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TELEGRAM_OPERATOR_SETTINGS,
  normalizeTelegramCommandKind,
} from '@/lib/hermes-operator/telegram-types'

describe('telegram operator types', () => {
  it('defaults to disabled single-chat mode', () => {
    expect(DEFAULT_TELEGRAM_OPERATOR_SETTINGS).toMatchObject({
      enabled: false,
      allowedChatId: '',
      notificationsEnabled: false,
    })
  })

  it('normalizes unknown command kinds to refuse', () => {
    expect(normalizeTelegramCommandKind('nope')).toBe('refuse')
  })
})
