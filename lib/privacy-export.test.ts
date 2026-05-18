import { describe, expect, it } from 'vitest'
import { redactPrivacyExport } from './privacy-export'

describe('redactPrivacyExport', () => {
  it('remplace les valeurs de secrets par des flags de présence', () => {
    const result = redactPrivacyExport({
      settings: {
        openai_api_key: 'sk-test',
        claude_api_key: null,
        stripe_secret_key: 'sk_live_xxx',
        stripe_webhook_secret: null,
      },
    })

    expect(result.settings).toEqual({
      has_openai_api_key: true,
      has_claude_api_key: false,
      has_stripe_secret_key: true,
      has_stripe_webhook_secret: false,
    })
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
