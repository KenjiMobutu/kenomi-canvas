export interface InfraServiceConfig {
  id: string
  label: string
  endpoint: string
  role: string
  healthKey: string | null
  short: string
  color: string
  vmid: number | null
  kind: 'host' | 'service' | 'edge' | 'external'
}

export interface SanitizedInfraService {
  id: string
  label: string
  role: string
  healthKey: string | null
  endpointLabel: string
  short: string
  color: string
  vmid: number | null
  kind: 'host' | 'service' | 'edge' | 'external'
  checkedAt?: string | null
  repairHref?: string
}

export interface UserInfraSettings {
  proxmox_base_url?: string | null
  proxmox_node?: string | null
  coolify_url?: string | null
  nginx_pm_url?: string | null
  uptime_kuma_url?: string | null
  vaultwarden_url?: string | null
  supabase_url?: string | null
  n8n_base_url?: string | null
  ollama_base_url?: string | null
}

export interface HealthServiceUrls {
  ollama: string
  n8n: string
  supabase: string
  coolify: string
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc00:|fd[0-9a-f]{2}:)/i

const SERVICE_ENDPOINT_KEYS: Record<string, keyof UserInfraSettings> = {
  proxmox: 'proxmox_base_url',
  coolify: 'coolify_url',
  nginx: 'nginx_pm_url',
  uptime: 'uptime_kuma_url',
  vault: 'vaultwarden_url',
  supabase: 'supabase_url',
  n8n: 'n8n_base_url',
  ollama: 'ollama_base_url',
}

export function parseInfraServices(services: InfraServiceConfig[]): InfraServiceConfig[] {
  return services.map((service) => ({
    id: service.id,
    label: service.label,
    endpoint: service.endpoint,
    role: service.role,
    healthKey: service.healthKey,
    short: service.short,
    color: service.color,
    vmid: service.vmid,
    kind: service.kind,
  }))
}

function endpointLabel(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname
    return PRIVATE_HOST.test(host) ? 'private' : host
  } catch {
    return 'private'
  }
}

export function getSanitizedInfraServices(services: InfraServiceConfig[]): SanitizedInfraService[] {
  return services.map((service) => ({
    id: service.id,
    label: service.label,
    role: service.role,
    healthKey: service.healthKey,
    endpointLabel: endpointLabel(service.endpoint),
    short: service.short,
    color: service.color,
    vmid: service.vmid,
    kind: service.kind,
  }))
}

export function applyUserInfraSettings(
  services: InfraServiceConfig[],
  settings: UserInfraSettings | null | undefined
): InfraServiceConfig[] {
  return services.map((service) => {
    const settingsKey = SERVICE_ENDPOINT_KEYS[service.id]
    const configuredEndpoint = settingsKey ? settings?.[settingsKey] : null
    return {
      ...service,
      endpoint:
        typeof configuredEndpoint === 'string' && configuredEndpoint.length > 0
          ? configuredEndpoint
          : service.endpoint,
    }
  })
}

function configuredString(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveHealthServiceUrls(
  settings: UserInfraSettings | null | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env
): HealthServiceUrls {
  const ollamaBase = trimTrailingSlash(
    configuredString(settings?.ollama_base_url, env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434')
  )
  const n8nBase = trimTrailingSlash(
    configuredString(settings?.n8n_base_url, env.N8N_BASE_URL ?? 'https://n8n.kenomi.eu')
  )
  const supabaseBase = trimTrailingSlash(
    configuredString(
      settings?.supabase_url,
      env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.kenomi.eu'
    )
  )
  const coolifyBase = trimTrailingSlash(
    configuredString(settings?.coolify_url, env.COOLIFY_URL ?? 'http://192.168.0.19:8000')
  )

  return {
    ollama: `${ollamaBase}/api/tags`,
    n8n: `${n8nBase}/healthz`,
    supabase: `${supabaseBase}/rest/v1/`,
    coolify: `${coolifyBase}/api/v1/version`,
  }
}

export const DEFAULT_INFRA_SERVICES: InfraServiceConfig[] = parseInfraServices([
  {
    id: 'proxmox',
    label: 'Proxmox VE',
    endpoint: process.env.PROXMOX_BASE_URL ?? 'https://192.168.0.1:8006',
    role: 'Compute cluster',
    healthKey: null,
    short: 'PROX',
    color: '#34d399',
    vmid: null,
    kind: 'host',
  },
  {
    id: 'coolify',
    label: 'Coolify',
    endpoint: process.env.COOLIFY_URL ?? 'http://192.168.0.19:8000',
    role: 'Deployments',
    healthKey: 'coolify',
    short: 'COOL',
    color: '#34d399',
    vmid: 102,
    kind: 'service',
  },
  {
    id: 'nginx',
    label: 'Nginx PM',
    endpoint: process.env.NGINX_PM_URL ?? 'https://npm.tailnet.local',
    role: 'Proxy and SSL',
    healthKey: null,
    short: 'NPM',
    color: '#22d3ee',
    vmid: 101,
    kind: 'edge',
  },
  {
    id: 'uptime',
    label: 'Uptime Kuma',
    endpoint: process.env.UPTIME_KUMA_URL ?? 'https://uptime.tailnet.local',
    role: 'Monitoring',
    healthKey: null,
    short: 'UPT',
    color: '#a78bfa',
    vmid: null,
    kind: 'service',
  },
  {
    id: 'vault',
    label: 'Vaultwarden',
    endpoint: process.env.VAULTWARDEN_URL ?? 'https://vault.tailnet.local',
    role: 'Secrets and credentials',
    healthKey: null,
    short: 'VLT',
    color: '#fbbf24',
    vmid: 100,
    kind: 'service',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.kenomi.eu',
    role: 'Auth and database',
    healthKey: 'supabase',
    short: 'SUP',
    color: '#34d399',
    vmid: null,
    kind: 'external',
  },
  {
    id: 'n8n',
    label: 'n8n',
    endpoint: process.env.N8N_BASE_URL ?? 'https://n8n.kenomi.eu',
    role: 'Automation',
    healthKey: 'n8n',
    short: 'N8N',
    color: '#e879f9',
    vmid: null,
    kind: 'service',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    endpoint: process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434',
    role: 'Local inference',
    healthKey: 'ollama',
    short: 'OLL',
    color: '#fb923c',
    vmid: null,
    kind: 'external',
  },
])
