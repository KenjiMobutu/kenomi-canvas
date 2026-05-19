import { describe, expect, it } from 'vitest'
import { resolveProxmoxConfig, selectGuestRootFilesystem } from './proxmox-client'

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

  it('uses the server node when settings still contain the old pve default', () => {
    const config = resolveProxmoxConfig(
      {
        proxmox_base_url: 'https://192.168.0.10:8006',
        proxmox_node: 'pve',
      },
      {
        PROXMOX_BASE_URL: 'https://192.168.0.10:8006',
        PROXMOX_NODE: 'proxmox',
        PROXMOX_TOKEN_ID: 'monitoring@pve!token',
        PROXMOX_TOKEN_SECRET: 'secret',
      }
    )

    expect(config.node).toBe('proxmox')
  })
})

describe('selectGuestRootFilesystem', () => {
  it('returns the root filesystem usage from qemu guest agent fsinfo', () => {
    const disk = selectGuestRootFilesystem({
      result: [
        {
          mountpoint: '/run',
          type: 'tmpfs',
          'used-bytes': 1024,
          'total-bytes': 4096,
        },
        {
          mountpoint: '/',
          type: 'ext4',
          'used-bytes': 39 * 1024 ** 3,
          'total-bytes': 97 * 1024 ** 3,
        },
      ],
    })

    expect(disk).toEqual({
      used: 39 * 1024 ** 3,
      total: 97 * 1024 ** 3,
      pct: 40,
      mountpoint: '/',
    })
  })

  it('falls back to the largest usable filesystem when root is not explicit', () => {
    const disk = selectGuestRootFilesystem([
      {
        mountpoint: '/boot',
        type: 'ext4',
        'used-bytes': 512,
        'total-bytes': 2048,
      },
      {
        mountpoint: '/var',
        type: 'ext4',
        'used-bytes': 8_000,
        'total-bytes': 10_000,
      },
    ])

    expect(disk?.mountpoint).toBe('/var')
    expect(disk?.pct).toBe(80)
  })
})
