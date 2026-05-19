import { describe, expect, it } from 'vitest'
import {
  isMissingInfraSettingsColumnError,
  normalizeUserSettings,
  omitInfraSettings,
  unwrapOptionalInfraSettings,
} from './user-settings-normalization'

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
      proxmox_node: 'proxmox',
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

  it('can omit infra fields for databases that have not run the latest migration yet', () => {
    const settings = normalizeUserSettings({
      coolify_url: 'https://coolify.tailnet.local',
      proxmox_base_url: 'https://proxmox.tailnet.local:8006',
    })

    expect(omitInfraSettings(settings)).not.toHaveProperty('coolify_url')
    expect(omitInfraSettings(settings)).not.toHaveProperty('proxmox_base_url')
    expect(omitInfraSettings(settings)).toHaveProperty('ollama_base_url')
  })

  it('detects Supabase missing-column errors for infra settings', () => {
    expect(
      isMissingInfraSettingsColumnError({
        code: 'PGRST204',
        message: "Could not find the 'coolify_url' column of 'user_settings'",
      })
    ).toBe(true)

    expect(isMissingInfraSettingsColumnError({ message: 'duplicate key value' })).toBe(false)
  })

  it('unwraps optional infra settings when the migration is present', () => {
    expect(unwrapOptionalInfraSettings({ coolify_url: 'https://coolify.local' }, null)).toEqual({
      coolify_url: 'https://coolify.local',
    })
  })

  it('falls back to null when optional infra columns are not migrated yet', () => {
    expect(
      unwrapOptionalInfraSettings(null, {
        code: 'PGRST204',
        message: "Could not find the 'proxmox_base_url' column of 'user_settings'",
      })
    ).toBeNull()
  })

  it('throws non-migration Supabase errors for optional infra settings', () => {
    expect(() =>
      unwrapOptionalInfraSettings(null, {
        code: '42501',
        message: 'permission denied for table user_settings',
      })
    ).toThrow('permission denied for table user_settings')
  })
})
