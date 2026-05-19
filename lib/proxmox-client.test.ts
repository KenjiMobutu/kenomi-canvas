import { describe, expect, it } from 'vitest'
import { resolveProxmoxConfig } from './proxmox-client'

describe('resolveProxmoxConfig', () => {
  it('uses saved endpoint and node while keeping tokens server-side', () => {
    const config = resolveProxmoxConfig(
      {
        proxmox_base_url: 'https://proxmox.tailnet.local:8006',
        proxmox_node: 'lab',
      },
      {
        PROXMOX_BASE_URL: 'https://env-proxmox.local:8006',
        PROXMOX_NODE: 'pve',
        PROXMOX_TOKEN_ID: 'monitoring@pve!token',
        PROXMOX_TOKEN_SECRET: 'secret',
      }
    )

    expect(config).toEqual({
      baseUrl: 'https://proxmox.tailnet.local:8006',
      node: 'lab',
      tokenId: 'monitoring@pve!token',
      tokenSecret: 'secret',
    })
  })

  it('falls back to env when saved values are blank', () => {
    const config = resolveProxmoxConfig(
      {
        proxmox_base_url: '',
        proxmox_node: '',
      },
      {
        PROXMOX_BASE_URL: 'https://env-proxmox.local:8006',
        PROXMOX_NODE: 'pve',
      }
    )

    expect(config.baseUrl).toBe('https://env-proxmox.local:8006')
    expect(config.node).toBe('pve')
  })
})
