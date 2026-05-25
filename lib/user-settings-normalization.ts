export interface UserSettings {
  ollama_base_url: string
  ollama_model: string
  n8n_base_url: string
  n8n_api_key: string
  claude_api_key: string
  openai_api_key: string
  stripe_secret_key: string
  stripe_webhook_secret: string
  supabase_url: string
  proxmox_base_url: string
  proxmox_node: string
  coolify_url: string
  hermes_agent_url: string
  prospect_sources: string[]
  prospect_outreach_email: string
  prospect_crm_provider: string
  nginx_pm_url: string
  uptime_kuma_url: string
  vaultwarden_url: string
  display_name: string
  studio_timezone: string
  budget_cap_euros: number
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
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
  hermes_agent_url: 'https://hermes.kenomi.eu',
  prospect_sources: [],
  prospect_outreach_email: '',
  prospect_crm_provider: 'supabase',
  nginx_pm_url: 'https://npm.tailnet.local',
  uptime_kuma_url: 'https://uptime.tailnet.local',
  vaultwarden_url: 'https://vault.tailnet.local',
  display_name: 'Kenomi Operator',
  studio_timezone: 'Europe/Paris',
  budget_cap_euros: 50,
}

type RawUserSettings = Partial<
  Record<keyof UserSettings, string | string[] | number | null | undefined>
>
type SettingsErrorLike = { code?: string; message?: string }

const INFRA_SETTINGS_KEYS = [
  'proxmox_base_url',
  'proxmox_node',
  'coolify_url',
  'hermes_agent_url',
  'prospect_sources',
  'prospect_outreach_email',
  'prospect_crm_provider',
  'nginx_pm_url',
  'uptime_kuma_url',
  'vaultwarden_url',
] as const

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function validNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export function normalizeUserSettings(raw: RawUserSettings | null | undefined): UserSettings {
  return {
    ollama_base_url: stringOrDefault(raw?.ollama_base_url, DEFAULT_USER_SETTINGS.ollama_base_url),
    ollama_model: stringOrDefault(raw?.ollama_model, DEFAULT_USER_SETTINGS.ollama_model),
    n8n_base_url: stringOrDefault(raw?.n8n_base_url, DEFAULT_USER_SETTINGS.n8n_base_url),
    n8n_api_key: stringOrDefault(raw?.n8n_api_key, DEFAULT_USER_SETTINGS.n8n_api_key),
    claude_api_key: stringOrDefault(raw?.claude_api_key, DEFAULT_USER_SETTINGS.claude_api_key),
    openai_api_key: stringOrDefault(raw?.openai_api_key, DEFAULT_USER_SETTINGS.openai_api_key),
    stripe_secret_key: stringOrDefault(
      raw?.stripe_secret_key,
      DEFAULT_USER_SETTINGS.stripe_secret_key
    ),
    stripe_webhook_secret: stringOrDefault(
      raw?.stripe_webhook_secret,
      DEFAULT_USER_SETTINGS.stripe_webhook_secret
    ),
    supabase_url: stringOrDefault(raw?.supabase_url, DEFAULT_USER_SETTINGS.supabase_url),
    proxmox_base_url: stringOrDefault(
      raw?.proxmox_base_url,
      DEFAULT_USER_SETTINGS.proxmox_base_url
    ),
    proxmox_node: stringOrDefault(raw?.proxmox_node, DEFAULT_USER_SETTINGS.proxmox_node),
    coolify_url: stringOrDefault(raw?.coolify_url, DEFAULT_USER_SETTINGS.coolify_url),
    hermes_agent_url: stringOrDefault(
      raw?.hermes_agent_url,
      DEFAULT_USER_SETTINGS.hermes_agent_url
    ),
    prospect_sources: stringArrayOrDefault(
      raw?.prospect_sources,
      DEFAULT_USER_SETTINGS.prospect_sources
    ),
    prospect_outreach_email: stringOrDefault(
      raw?.prospect_outreach_email,
      DEFAULT_USER_SETTINGS.prospect_outreach_email
    ),
    prospect_crm_provider: stringOrDefault(
      raw?.prospect_crm_provider,
      DEFAULT_USER_SETTINGS.prospect_crm_provider
    ),
    nginx_pm_url: stringOrDefault(raw?.nginx_pm_url, DEFAULT_USER_SETTINGS.nginx_pm_url),
    uptime_kuma_url: stringOrDefault(raw?.uptime_kuma_url, DEFAULT_USER_SETTINGS.uptime_kuma_url),
    vaultwarden_url: stringOrDefault(raw?.vaultwarden_url, DEFAULT_USER_SETTINGS.vaultwarden_url),
    display_name: stringOrDefault(raw?.display_name, DEFAULT_USER_SETTINGS.display_name),
    studio_timezone: stringOrDefault(raw?.studio_timezone, DEFAULT_USER_SETTINGS.studio_timezone),
    budget_cap_euros: validNumber(raw?.budget_cap_euros, DEFAULT_USER_SETTINGS.budget_cap_euros),
  }
}

export function omitInfraSettings(
  settings: UserSettings
): Omit<UserSettings, (typeof INFRA_SETTINGS_KEYS)[number]> {
  const copy = { ...settings }
  for (const key of INFRA_SETTINGS_KEYS) {
    delete copy[key]
  }
  return copy
}

export function isMissingInfraSettingsColumnError(error: SettingsErrorLike | null | undefined) {
  if (!error) return false
  const message = error.message ?? ''
  return error.code === 'PGRST204' && INFRA_SETTINGS_KEYS.some((key) => message.includes(key))
}

export function unwrapOptionalInfraSettings<T>(
  data: T | null,
  error: SettingsErrorLike | null | undefined
): T | null {
  if (!error) return data
  if (isMissingInfraSettingsColumnError(error)) return null
  throw new Error(error.message ?? 'Erreur Supabase lors du chargement des paramètres infra')
}
