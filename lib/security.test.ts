import { describe, it, expect, afterEach } from 'vitest'
import {
  isAllowedWebhookUrl,
  isAllowedOllamaUrl,
  isAllowedHermesAgentUrl,
  isAllowedInfraServiceUrl,
  isValidEmail,
} from './security'

afterEach(() => {
  delete process.env.TRUSTED_PRIVATE_HOSTS
})

describe('isAllowedWebhookUrl', () => {
  it('rejette 192.168.x.x par défaut', () => {
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(false)
  })

  it('accepte un host privé explicitement autorisé', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.14,n8n.tailnet.ts.net'
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(true)
    expect(isAllowedWebhookUrl('https://n8n.tailnet.ts.net/webhook/abc')).toBe(true)
  })

  it('accepte un domaine public https', () => {
    expect(isAllowedWebhookUrl('https://n8n.kenomi.eu/webhook/abc')).toBe(true)
  })

  it('rejette les métadonnées cloud 169.254.169.254', () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('rejette localhost et loopback', () => {
    expect(isAllowedWebhookUrl('http://localhost/admin')).toBe(false)
    expect(isAllowedWebhookUrl('http://127.0.0.1:8080/secret')).toBe(false)
    expect(isAllowedWebhookUrl('http://[::1]:3000/')).toBe(false)
  })

  it('rejette les plages privées non autorisées', () => {
    expect(isAllowedWebhookUrl('http://10.0.0.1/internal')).toBe(false)
    expect(isAllowedWebhookUrl('http://172.16.0.1/secret')).toBe(false)
    expect(isAllowedWebhookUrl('http://192.168.0.19:8000/api')).toBe(false)
  })
})

describe('isAllowedOllamaUrl', () => {
  it('rejette Ollama privé sans allowlist', () => {
    expect(isAllowedOllamaUrl('http://192.168.0.14:11434')).toBe(false)
  })

  it('accepte Ollama privé avec allowlist', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.14'
    expect(isAllowedOllamaUrl('http://192.168.0.14:11434')).toBe(true)
  })
})

describe('isAllowedHermesAgentUrl', () => {
  it('accepte Hermes Agent public sans allowlist privée', () => {
    expect(isAllowedHermesAgentUrl('https://hermes-api.kenomi.eu/v1/health')).toBe(true)
  })

  it('accepte un host privé explicitement autorisé pour Hermes Agent', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = 'hermes.tailnet.local'
    expect(isAllowedHermesAgentUrl('https://hermes.tailnet.local/v1/health')).toBe(true)
  })
})

describe('isAllowedInfraServiceUrl', () => {
  it('rejects private infra URLs without explicit allowlist', () => {
    expect(isAllowedInfraServiceUrl('coolify', 'http://192.168.0.19:8000/api/v1/version')).toBe(
      false
    )
    expect(
      isAllowedInfraServiceUrl('supabase', 'http://192.168.0.10:8000/internal-rest-probe')
    ).toBe(false)
  })

  it('accepts trusted private infra URLs', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.19,192.168.0.10'
    expect(isAllowedInfraServiceUrl('coolify', 'http://192.168.0.19:8000/api/v1/version')).toBe(
      true
    )
    expect(isAllowedInfraServiceUrl('supabase', 'http://192.168.0.10:54321/rest/v1')).toBe(true)
  })
})

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('kenji@kenomi.eu')).toBe(true)
  })

  it('rejette les emails invalides', () => {
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
  })
})
