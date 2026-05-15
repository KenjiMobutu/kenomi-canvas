import { describe, it, expect } from 'vitest'
import { isAllowedWebhookUrl, isAllowedOllamaUrl, isValidEmail } from './security'

describe('isAllowedWebhookUrl', () => {
  it('accepte http://192.168.0.x (réseau local kenomi)', () => {
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(true)
  })
  it('accepte https://n8n.kenomi.eu/webhook/abc', () => {
    expect(isAllowedWebhookUrl('https://n8n.kenomi.eu/webhook/abc')).toBe(true)
  })
  it('rejette les métadonnées cloud 169.254.169.254', () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })
  it('rejette les URLs non-HTTP', () => {
    expect(isAllowedWebhookUrl('ftp://evil.com')).toBe(false)
  })
  it('rejette une URL malformée', () => {
    expect(isAllowedWebhookUrl('not-a-url')).toBe(false)
  })
  it('rejette localhost (SSRF loopback)', () => {
    expect(isAllowedWebhookUrl('http://localhost/admin')).toBe(false)
  })
  it('rejette 127.0.0.1 (SSRF loopback)', () => {
    expect(isAllowedWebhookUrl('http://127.0.0.1:8080/secret')).toBe(false)
  })
  it('rejette [::1] (SSRF IPv6 loopback)', () => {
    expect(isAllowedWebhookUrl('http://[::1]:3000/')).toBe(false)
  })
})

describe('isAllowedOllamaUrl', () => {
  it('délègue à isAllowedWebhookUrl — rejette 169.254.x.x', () => {
    expect(isAllowedOllamaUrl('http://169.254.169.254/')).toBe(false)
  })
  it('accepte http://192.168.0.14:11434', () => {
    expect(isAllowedOllamaUrl('http://192.168.0.14:11434')).toBe(true)
  })
})

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('kenji@kenomi.eu')).toBe(true)
  })
  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
  it('rejette une chaîne vide', () => {
    expect(isValidEmail('')).toBe(false)
  })
  it('rejette un email sans TLD (test@)', () => {
    expect(isValidEmail('test@')).toBe(false)
  })
})
