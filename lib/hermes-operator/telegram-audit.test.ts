import { describe, expect, it } from 'vitest'
import { buildTelegramAuditInsert } from '@/lib/hermes-operator/telegram-audit'

describe('telegram audit', () => {
  it('records executed and blocked details', () => {
    expect(
      buildTelegramAuditInsert({
        userId: 'u1',
        remoteActor: 'chat-1',
        rawText: 'run prospect',
        intentKind: 'run_prospect',
        executed: true,
      })
    ).toMatchObject({
      user_id: 'u1',
      channel: 'telegram',
      remote_actor: 'chat-1',
      raw_text: 'run prospect',
      intent_kind: 'run_prospect',
      executed: true,
      blocked_reason: null,
      response_summary: '',
      metadata: {},
    })

    expect(
      buildTelegramAuditInsert({
        userId: 'u1',
        remoteActor: 'chat-1',
        rawText: 'run scout',
        intentKind: 'refuse',
        executed: false,
        blockedReason: 'unsupported_command',
        responseSummary: 'Unsupported command.',
        metadata: {
          normalizedText: 'run scout',
        },
      })
    ).toMatchObject({
      user_id: 'u1',
      channel: 'telegram',
      remote_actor: 'chat-1',
      raw_text: 'run scout',
      intent_kind: 'refuse',
      executed: false,
      blocked_reason: 'unsupported_command',
      response_summary: 'Unsupported command.',
      metadata: {
        normalizedText: 'run scout',
      },
    })
  })
})
