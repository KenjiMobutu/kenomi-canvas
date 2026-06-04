import { describe, expect, it } from 'vitest'
import { routeTelegramCommand } from '@/lib/hermes-operator/telegram-router'

describe('telegram router', () => {
  it('maps /brief to read_brief', () => {
    expect(routeTelegramCommand('/brief').kind).toBe('read_brief')
  })

  it('maps natural-language run prospect to run_prospect', () => {
    expect(routeTelegramCommand('run prospect').kind).toBe('run_prospect')
  })

  it('refuses unsupported scout requests', () => {
    const result = routeTelegramCommand('run scout')

    expect(result.kind).toBe('refuse')
    expect(result.blockedReason).toBe('unsupported_command')
  })
})
