import { describe, expect, it } from 'vitest'
import { buildTelegramBriefResponse } from '@/lib/hermes-operator/telegram-read-model'
import { formatTelegramOperatorReply } from '@/lib/hermes-operator/telegram-format'

describe('telegram read model', () => {
  it('returns a concise brief summary', () => {
    const result = buildTelegramBriefResponse({
      brief: {
        headline: 'Cash is blocked by approvals',
        nextAction: { title: 'Clear approvals' },
      },
      alerts: [],
    })

    expect(result.summary).toContain('Cash is blocked by approvals')
    expect(result.summary).toContain('Clear approvals')
  })

  it('formats a summary without requiring lines', () => {
    expect(
      formatTelegramOperatorReply({
        summary: 'Cash is blocked by approvals. Next: Clear approvals.',
      })
    ).toBe('Cash is blocked by approvals. Next: Clear approvals.')
  })
})
