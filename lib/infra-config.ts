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
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc00:|fd[0-9a-f]{2}:)/i

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

export const DEFAULT_INFRA_SERVICES: InfraServiceConfig[] = parseInfraServices([
  { id: 'proxmox', label: 'Proxmox VE', endpoint: process.env.PROXMOX_BASE_URL ?? 'https://192.168.0.1:8006', role: 'Compute cluster', healthKey: null, short: 'PROX', color: '#34d399', vmid: null, kind: 'host' },
  { id: 'coolify', label: 'Coolify', endpoint: process.env.COOLIFY_URL ?? 'http://192.168.0.19:8000', role: 'Deployments', healthKey: 'coolify', short: 'COOL', color: '#34d399', vmid: 102, kind: 'service' },
  { id: 'nginx', label: 'Nginx PM', endpoint: process.env.NGINX_PM_URL ?? 'https://npm.tailnet.local', role: 'Proxy and SSL', healthKey: null, short: 'NPM', color: '#22d3ee', vmid: 101, kind: 'edge' },
  { id: 'uptime', label: 'Uptime Kuma', endpoint: process.env.UPTIME_KUMA_URL ?? 'https://uptime.tailnet.local', role: 'Monitoring', healthKey: null, short: 'UPT', color: '#a78bfa', vmid: null, kind: 'service' },
  { id: 'vault', label: 'Vaultwarden', endpoint: process.env.VAULTWARDEN_URL ?? 'https://vault.tailnet.local', role: 'Secrets and credentials', healthKey: null, short: 'VLT', color: '#fbbf24', vmid: 100, kind: 'service' },
  { id: 'supabase', label: 'Supabase', endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.kenomi.eu', role: 'Auth and database', healthKey: 'supabase', short: 'SUP', color: '#34d399', vmid: null, kind: 'external' },
  { id: 'n8n', label: 'n8n', endpoint: process.env.N8N_BASE_URL ?? 'https://n8n.kenomi.eu', role: 'Automation', healthKey: 'n8n', short: 'N8N', color: '#e879f9', vmid: null, kind: 'service' },
  { id: 'ollama', label: 'Ollama', endpoint: process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434', role: 'Local inference', healthKey: 'ollama', short: 'OLL', color: '#fb923c', vmid: null, kind: 'external' },
])
