import { describe, expect, it } from 'vitest'
import { INFRA_FALLBACK_SERVICES, INFRA_TOPOLOGY_POSITIONS } from './infrastructure-fallback'

describe('infra fallback services', () => {
  it('matches the full topology surface exposed by infra services API', () => {
    expect(INFRA_FALLBACK_SERVICES.map((service) => service.id)).toEqual([
      'proxmox',
      'coolify',
      'hermesAgent',
      'nginx',
      'uptime',
      'vault',
      'supabase',
      'n8n',
      'ollama',
    ])
  })

  it('keeps Hermes and Nginx visually separated in the topology map', () => {
    const hermes = INFRA_TOPOLOGY_POSITIONS.hermesAgent
    const nginx = INFRA_TOPOLOGY_POSITIONS.nginx

    expect(Math.abs(hermes.x - nginx.x)).toBeGreaterThanOrEqual(80)
    expect(Math.abs(hermes.y - nginx.y)).toBeGreaterThanOrEqual(40)
  })
})
