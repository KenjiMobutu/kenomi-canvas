/**
 * lib/proxmox-client.ts
 * Client API Proxmox REST — lecture seule (PVEAuditor)
 * Token : monitoring@pve!kenomi-canvas
 */
import { logError } from './logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProxmoxNodeStatus = {
  node: string
  cpu: number // 0.0 → 1.0
  cpu_pct: number // 0 → 100
  mem_used: number // bytes
  mem_total: number // bytes
  mem_pct: number // 0 → 100
  disk_used: number // bytes
  disk_total: number // bytes
  disk_pct: number // 0 → 100
  uptime: number // secondes
  status: 'online' | 'offline' | 'unknown'
}

export type ProxmoxVM = {
  vmid: number
  name: string
  status: 'running' | 'stopped' | 'paused'
  type: 'qemu' | 'lxc'
  cpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  uptime: number
  node: string
  netin: number
  netout: number
  guest_disk_used?: number | null
  guest_disk_total?: number | null
  guest_disk_pct?: number | null
  guest_disk_mountpoint?: string | null
  guest_disk_error?: string | null
}

export type ProxmoxMetrics = {
  nodes: ProxmoxNodeStatus[]
  vms: ProxmoxVM[]
  fetched_at: string
  errors?: ProxmoxMetricsError[]
}

export type ProxmoxMetricsError = {
  scope: 'node-status' | 'vms'
  message: string
}

export type ProxmoxClientSettings = {
  proxmox_base_url?: string | null
  proxmox_node?: string | null
}

export type ProxmoxClientConfig = {
  baseUrl: string
  tokenId: string
  tokenSecret: string
  node: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

function configuredString(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function configuredNode(value: string | null | undefined, envNode: string | undefined): string {
  const fallback = envNode ?? 'proxmox'
  const configured = configuredString(value, fallback)
  if (configured === 'pve' && fallback !== 'pve') return fallback
  return configured
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function resolveProxmoxConfig(
  settings: ProxmoxClientSettings | null | undefined = null,
  env: Partial<NodeJS.ProcessEnv> = process.env
): ProxmoxClientConfig {
  return {
    baseUrl: configuredString(
      settings?.proxmox_base_url,
      env.PROXMOX_BASE_URL ?? 'https://192.168.0.10:8006'
    ),
    tokenId: env.PROXMOX_TOKEN_ID ?? 'monitoring@pve!kenomi-canvas',
    tokenSecret: env.PROXMOX_TOKEN_SECRET ?? '',
    node: configuredNode(settings?.proxmox_node, env.PROXMOX_NODE),
  }
}

// ─── Fetch avec auth token ────────────────────────────────────────────────────

async function proxmoxFetch<T>(
  path: string,
  config: ProxmoxClientConfig,
  timeoutMs = 10_000
): Promise<T> {
  const https = await import('https')
  const url = new URL(`${config.baseUrl}/api2/json${path}`)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 8006,
        path: url.pathname + url.search,
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
          Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Proxmox API ${res.statusCode} sur ${path}: ${data}`))
            return
          }
          try {
            resolve(JSON.parse(data).data as T)
          } catch {
            reject(new Error(`Proxmox JSON invalide sur ${path}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Proxmox timeout'))
    })
    req.end()
  })
}

type ProxmoxGuestFilesystem = {
  name?: string
  mountpoint?: string
  type?: string
  'used-bytes'?: number
  'total-bytes'?: number
}

type ProxmoxGuestFsInfoResponse =
  | ProxmoxGuestFilesystem[]
  | {
      result?: ProxmoxGuestFilesystem[]
    }

export type ProxmoxGuestDiskUsage = {
  used: number
  total: number
  pct: number
  mountpoint: string
}

export function selectGuestRootFilesystem(
  response: ProxmoxGuestFsInfoResponse
): ProxmoxGuestDiskUsage | null {
  const filesystems = Array.isArray(response) ? response : (response.result ?? [])
  const usable = filesystems.filter((fs) => {
    const total = fs['total-bytes']
    const used = fs['used-bytes']
    if (typeof total !== 'number' || typeof used !== 'number' || total <= 0 || used < 0) return false
    return !['devtmpfs', 'tmpfs', 'squashfs', 'overlay'].includes(fs.type ?? '')
  })
  const root =
    usable.find((fs) => fs.mountpoint === '/') ??
    usable.find((fs) => fs.name === '/') ??
    usable.sort((a, b) => (b['total-bytes'] ?? 0) - (a['total-bytes'] ?? 0))[0]

  if (!root) return null
  const used = root['used-bytes']!
  const total = root['total-bytes']!
  return {
    used,
    total,
    pct: Math.round((used / total) * 100),
    mountpoint: root.mountpoint ?? root.name ?? 'guest',
  }
}

export async function getProxmoxQemuGuestDiskUsage(
  config = resolveProxmoxConfig(),
  vmid: number,
  node = config.node
): Promise<ProxmoxGuestDiskUsage | null> {
  const data = await proxmoxFetch<ProxmoxGuestFsInfoResponse>(
    `/nodes/${node}/qemu/${vmid}/agent/get-fsinfo`,
    config,
    3_000
  )
  return selectGuestRootFilesystem(data)
}

// ─── Métriques nœud ──────────────────────────────────────────────────────────

export async function getProxmoxNodeStatus(
  config = resolveProxmoxConfig(),
  node = config.node
): Promise<ProxmoxNodeStatus> {
  const data = await proxmoxFetch<{
    cpu: number
    memory: { used: number; total: number }
    rootfs: { used: number; total: number }
    uptime: number
  }>(`/nodes/${node}/status`, config)

  const mem_pct = Math.round((data.memory.used / data.memory.total) * 100)
  const disk_pct = Math.round((data.rootfs.used / data.rootfs.total) * 100)

  return {
    node,
    cpu: data.cpu,
    cpu_pct: Math.round(data.cpu * 100),
    mem_used: data.memory.used,
    mem_total: data.memory.total,
    mem_pct,
    disk_used: data.rootfs.used,
    disk_total: data.rootfs.total,
    disk_pct,
    uptime: data.uptime,
    status: 'online',
  }
}

// ─── Liste VMs + LXC ─────────────────────────────────────────────────────────

export async function getProxmoxVMs(
  config = resolveProxmoxConfig(),
  node = config.node
): Promise<ProxmoxVM[]> {
  const [qemus, lxcs] = await Promise.all([
    proxmoxFetch<ProxmoxVM[]>(`/nodes/${node}/qemu`, config),
    proxmoxFetch<ProxmoxVM[]>(`/nodes/${node}/lxc`, config),
  ])

  return [
    ...qemus.map((v) => ({ ...v, type: 'qemu' as const, node })),
    ...lxcs.map((v) => ({ ...v, type: 'lxc' as const, node })),
  ].sort((a, b) => a.vmid - b.vmid)
}

// ─── Métriques complètes ──────────────────────────────────────────────────────

export async function getProxmoxMetrics(config = resolveProxmoxConfig()): Promise<ProxmoxMetrics> {
  const errors: ProxmoxMetricsError[] = []
  const [nodeStatus, vms] = await Promise.all([
    getProxmoxNodeStatus(config).catch((err) => {
      logError('proxmox.node-status', err)
      errors.push({ scope: 'node-status', message: errorMessage(err) })
      return null
    }),
    getProxmoxVMs(config).catch((err) => {
      logError('proxmox.vms', err)
      errors.push({ scope: 'vms', message: errorMessage(err) })
      return []
    }),
  ])
  const vmsWithGuestDisk = await Promise.all(
    vms.map(async (vm) => {
      if (vm.type !== 'qemu') return vm
      try {
        const guestDisk = await getProxmoxQemuGuestDiskUsage(config, vm.vmid, vm.node)
        return {
          ...vm,
          guest_disk_used: guestDisk?.used ?? null,
          guest_disk_total: guestDisk?.total ?? null,
          guest_disk_pct: guestDisk?.pct ?? null,
          guest_disk_mountpoint: guestDisk?.mountpoint ?? null,
          guest_disk_error: guestDisk ? null : 'QEMU guest agent ne retourne pas de filesystem utilisable',
        }
      } catch (err) {
        return {
          ...vm,
          guest_disk_used: null,
          guest_disk_total: null,
          guest_disk_pct: null,
          guest_disk_mountpoint: null,
          guest_disk_error: errorMessage(err),
        }
      }
    })
  )

  return {
    nodes: nodeStatus ? [nodeStatus] : [],
    vms: vmsWithGuestDisk,
    fetched_at: new Date().toISOString(),
    ...(errors.length > 0 ? { errors } : {}),
  }
}

// ─── Helpers formatage ────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} Go`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} Mo`
  return `${bytes} o`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}j ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
