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
  display_name: 'Kenomi Operator',
  studio_timezone: 'Europe/Paris',
  budget_cap_euros: 50,
}

type RawUserSettings = Partial<Record<keyof UserSettings, string | number | null | undefined>>

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function validNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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
    display_name: stringOrDefault(raw?.display_name, DEFAULT_USER_SETTINGS.display_name),
    studio_timezone: stringOrDefault(raw?.studio_timezone, DEFAULT_USER_SETTINGS.studio_timezone),
    budget_cap_euros: validNumber(raw?.budget_cap_euros, DEFAULT_USER_SETTINGS.budget_cap_euros),
  }
}
