import { describe, expect, it } from 'vitest'
import { normalizeUserSettings } from './user-settings-normalization'

describe('normalizeUserSettings', () => {
  it('keeps controlled form fields non-null when database values are null', () => {
    const settings = normalizeUserSettings({
      ollama_base_url: null,
      ollama_model: null,
      n8n_base_url: null,
      n8n_api_key: null,
      claude_api_key: null,
      openai_api_key: null,
      stripe_secret_key: null,
      stripe_webhook_secret: null,
      supabase_url: null,
      proxmox_base_url: null,
      proxmox_node: null,
      coolify_url: null,
      nginx_pm_url: null,
      uptime_kuma_url: null,
      vaultwarden_url: null,
      display_name: null,
      studio_timezone: null,
      budget_cap_euros: null,
    })

    expect(settings).toEqual({
      ollama_base_url: 'http://192.168.0.14:11434',
      ollama_model: 'qwen3:8b',
      n8n_base_url: '',
      n8n_api_key: '',
      claude_api_key: '',
      openai_api_key: '',
      stripe_secret_key: '',
      stripe_webhook_secret: '',
      supabase_url: 'https://supabase.kenomi.eu',
      proxmox_base_url: 'https://192.168.0.10:8006',
      proxmox_node: 'pve',
      coolify_url: 'http://192.168.0.19:8000',
      nginx_pm_url: 'https://npm.tailnet.local',
      uptime_kuma_url: 'https://uptime.tailnet.local',
      vaultwarden_url: 'https://vault.tailnet.local',
      display_name: 'Kenomi Operator',
      studio_timezone: 'Europe/Paris',
      budget_cap_euros: 50,
    })
  })

  it('preserves valid persisted settings', () => {
    const settings = normalizeUserSettings({
      ollama_base_url: 'http://localhost:11434',
      ollama_model: 'mistral:7b',
      n8n_base_url: '',
      proxmox_base_url: 'https://proxmox.tailnet.local:8006',
      proxmox_node: 'lab',
      coolify_url: 'https://coolify.tailnet.local',
      nginx_pm_url: 'https://npm.tailnet.local',
      uptime_kuma_url: 'https://uptime.tailnet.local',
      vaultwarden_url: 'https://vault.tailnet.local',
      display_name: 'Ops',
      studio_timezone: 'UTC',
      budget_cap_euros: 125,
    })

    expect(settings.ollama_base_url).toBe('http://localhost:11434')
    expect(settings.ollama_model).toBe('mistral:7b')
    expect(settings.n8n_base_url).toBe('')
    expect(settings.proxmox_base_url).toBe('https://proxmox.tailnet.local:8006')
    expect(settings.proxmox_node).toBe('lab')
    expect(settings.coolify_url).toBe('https://coolify.tailnet.local')
    expect(settings.nginx_pm_url).toBe('https://npm.tailnet.local')
    expect(settings.uptime_kuma_url).toBe('https://uptime.tailnet.local')
    expect(settings.vaultwarden_url).toBe('https://vault.tailnet.local')
    expect(settings.display_name).toBe('Ops')
    expect(settings.studio_timezone).toBe('UTC')
    expect(settings.budget_cap_euros).toBe(125)
  })
})
