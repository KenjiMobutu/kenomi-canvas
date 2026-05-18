import { describe, expect, it } from 'vitest'
import { collectPrivacyQueryErrors, redactPrivacyExport } from './privacy-export'

describe('redactPrivacyExport', () => {
  it('remplace les valeurs de secrets par des flags de présence', () => {
    const result = redactPrivacyExport({
      settings: {
        openai_api_key: 'sk-test',
        claude_api_key: null,
        stripe_secret_key: 'sk_live_xxx',
        stripe_webhook_secret: null,
      },
      conversations: [{ id: 'c1', title: 'Nouvelle conversation', created_at: '2026-05-18T00:00:00.000Z' }],
      messages: [{ id: 'm1', conversation_id: 'c1', role: 'user', content: 'hello', created_at: '2026-05-18T00:00:01.000Z' }],
    })

    expect(result.settings).toEqual({
      has_openai_api_key: true,
      has_claude_api_key: false,
      has_stripe_secret_key: true,
      has_stripe_webhook_secret: false,
    })
    expect(result.conversations).toEqual([
      { id: 'c1', title: 'Nouvelle conversation', created_at: '2026-05-18T00:00:00.000Z' },
    ])
    expect(result.messages).toEqual([
      { id: 'm1', conversation_id: 'c1', role: 'user', content: 'hello', created_at: '2026-05-18T00:00:01.000Z' },
    ])
  })

  it('préserve les champs non-settings', () => {
    const result = redactPrivacyExport({
      settings: null,
      user: { id: 'abc', email: 'test@test.com' },
    })

    expect(result.user).toEqual({ id: 'abc', email: 'test@test.com' })
    expect(result.settings).toEqual({
      has_openai_api_key: false,
      has_claude_api_key: false,
      has_stripe_secret_key: false,
      has_stripe_webhook_secret: false,
    })
  })
})

describe('collectPrivacyQueryErrors', () => {
  it('retourne les erreurs Supabase par section sans exposer de secrets', () => {
    const errors = collectPrivacyQueryErrors({
      ventures: { error: null },
      conversations: { error: { message: 'column topic does not exist' } },
      messages: { error: { message: 'permission denied for table messages' } },
    })

    expect(errors).toEqual([
      { section: 'conversations', message: 'column topic does not exist' },
      { section: 'messages', message: 'permission denied for table messages' },
    ])
  })
})
