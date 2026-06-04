import { describe, expect, it } from 'vitest'
import { normalizeTelegramUpdate } from './telegram-types'

describe('telegram bot service', () => {
  it('extracts chat id and text from a message update', () => {
    expect(
      normalizeTelegramUpdate({
        message: { chat: { id: 42 }, text: '/brief' },
      })
    ).toMatchObject({ chatId: '42', text: '/brief' })
  })
})
