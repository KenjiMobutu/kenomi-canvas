import { describe, expect, it } from 'vitest'
import { sanitizeAuditMetadata } from './audit-log'

describe('sanitizeAuditMetadata', () => {
  it('redacte les clés sensibles connues', () => {
    expect(
      sanitizeAuditMetadata({
        api_key: 'sk-test',
        password: 'secret',
        token: 'abc',
        authorization: 'Bearer xyz',
        safe_field: 'ok',
        duration_ms: 42,
      })
    ).toEqual({
      api_key: '[redacted]',
      password: '[redacted]',
      token: '[redacted]',
      authorization: '[redacted]',
      safe_field: 'ok',
      duration_ms: 42,
    })
  })

  it('retourne un objet vide inchangé', () => {
    expect(sanitizeAuditMetadata({})).toEqual({})
  })

  it('ne redacte pas les champs non sensibles', () => {
    expect(sanitizeAuditMetadata({ model: 'qwen3:8b', duration_ms: 1200 })).toEqual({
      model: 'qwen3:8b',
      duration_ms: 1200,
    })
  })
})
