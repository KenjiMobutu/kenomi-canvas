export interface InfraServiceConfig {
  id: string
  label: string
  endpoint: string
  role: string
  healthKey: string | null
}

export interface SanitizedInfraService {
  id: string
  label: string
  role: string
  healthKey: string | null
  endpointLabel: string
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc00:|fd[0-9a-f]{2}:)/i

export function parseInfraServices(services: InfraServiceConfig[]): InfraServiceConfig[] {
  return services.map((service) => ({
    id: service.id,
    label: service.label,
    endpoint: service.endpoint,
    role: service.role,
    healthKey: service.healthKey,
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
  }))
}

export const DEFAULT_INFRA_SERVICES: InfraServiceConfig[] = parseInfraServices([
  { id: 'proxmox', label: 'Proxmox VE', endpoint: process.env.PROXMOX_BASE_URL ?? 'https://192.168.0.1:8006', role: 'Compute cluster', healthKey: null },
  { id: 'coolify', label: 'Coolify', endpoint: process.env.COOLIFY_URL ?? 'http://192.168.0.19:8000', role: 'Deployments', healthKey: 'coolify' },
  { id: 'n8n', label: 'n8n', endpoint: process.env.N8N_BASE_URL ?? 'https://n8n.kenomi.eu', role: 'Automation', healthKey: 'n8n' },
  { id: 'supabase', label: 'Supabase', endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.kenomi.eu', role: 'Auth et base de données', healthKey: 'supabase' },
  { id: 'ollama', label: 'Ollama', endpoint: process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434', role: 'Inférence locale', healthKey: 'ollama' },
])
