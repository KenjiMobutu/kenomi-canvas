import {
  DEFAULT_INFRA_SERVICES,
  getSanitizedInfraServices,
} from '@/lib/infra-config'

export type InfrastructureFallbackService = {
  id: string
  vmid: number | null
  label: string
  short: string
  color: string
  role: string
  endpointLabel: string
  healthKey: 'hermesAgent' | 'ollama' | 'n8n' | 'supabase' | 'coolify' | null
  kind: 'host' | 'service' | 'edge' | 'external'
  checkedAt?: string | null
  repairHref?: string
}

export const INFRA_FALLBACK_SERVICES: InfrastructureFallbackService[] = getSanitizedInfraServices(
  DEFAULT_INFRA_SERVICES
) as InfrastructureFallbackService[]

export const INFRA_TOPOLOGY_POSITIONS: Record<string, { x: number; y: number; kind: string }> = {
  proxmox: { x: 200, y: 240, kind: 'host' },
  coolify: { x: 360, y: 100, kind: 'service' },
  hermesAgent: { x: 520, y: 80, kind: 'service' },
  nginx: { x: 660, y: 150, kind: 'edge' },
  uptime: { x: 560, y: 250, kind: 'service' },
  vault: { x: 360, y: 250, kind: 'service' },
  n8n: { x: 360, y: 380, kind: 'service' },
  supabase: { x: 760, y: 320, kind: 'external' },
  ollama: { x: 760, y: 120, kind: 'external' },
}
