import { describe, expect, it } from 'vitest'
import { buildTelegramBriefResponse } from '@/lib/hermes-operator/telegram-read-model'
import { formatTelegramOperatorReply } from '@/lib/hermes-operator/telegram-format'

describe('telegram read model', () => {
  it('returns a concise brief summary', () => {
    const result = buildTelegramBriefResponse({
      brief: {
        headline: 'Cash is blocked by approvals',
        topBlocker: '2 approvals are blocking outbound',
        mainLeak: 'Meeting to close · pricing friction',
        nextAction: { title: 'Clear approvals' },
      },
      alerts: [],
    })

    expect(result.summary).toContain('300EUR Diagnostic')
    expect(result.summary).toContain('Cash is blocked by approvals')
    expect(result.summary).toContain('Clear approvals')
    expect(result.lines).toEqual([
      '- Blocker: 2 approvals are blocking outbound',
      '- Leak: Meeting to close · pricing friction',
    ])
  })

  it('formats a summary without requiring lines', () => {
    expect(
      formatTelegramOperatorReply({
        summary: 'Cash is blocked by approvals. Next: Clear approvals.',
      })
    ).toBe('Cash is blocked by approvals. Next: Clear approvals.')
  })
})
