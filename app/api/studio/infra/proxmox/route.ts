import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  getProxmoxMetrics,
  formatBytes,
  formatUptime,
  resolveProxmoxConfig,
  type ProxmoxClientSettings,
} from '@/lib/proxmox-client'
import { logError } from '@/lib/logger'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'

function sanitizeGuestDiskError(error: string | null | undefined): string | null {
  if (!error) return null
  if (error.includes('VM.Monitor')) return 'Permission Proxmox VM.Monitor requise'
  if (error.includes('guest agent') || error.includes('QEMU guest agent')) {
    return 'QEMU guest agent indisponible'
  }
  return 'Disque guest indisponible'
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('proxmox_base_url,proxmox_node')
      .eq('user_id', user!.id)
      .maybeSingle()
    const metrics = await getProxmoxMetrics(
      resolveProxmoxConfig(unwrapOptionalInfraSettings(data as ProxmoxClientSettings | null, error))
    )

    const result = {
      ...metrics,
      nodes: metrics.nodes.map((n) => ({
        ...n,
        mem_used_fmt: formatBytes(n.mem_used),
        mem_total_fmt: formatBytes(n.mem_total),
        disk_used_fmt: formatBytes(n.disk_used),
        disk_total_fmt: formatBytes(n.disk_total),
        uptime_fmt: formatUptime(n.uptime),
      })),
      vms: metrics.vms.map((vm) => {
        const guestDiskError = sanitizeGuestDiskError(vm.guest_disk_error)
        return {
          ...vm,
          guest_disk_error: guestDiskError,
          mem_fmt: formatBytes(vm.mem),
          maxmem_fmt: formatBytes(vm.maxmem),
          disk_used_fmt:
            vm.type === 'qemu' && vm.guest_disk_used != null
              ? formatBytes(vm.guest_disk_used)
              : formatBytes(vm.disk),
          maxdisk_fmt:
            vm.type === 'qemu' && vm.guest_disk_total != null
              ? formatBytes(vm.guest_disk_total)
              : formatBytes(vm.maxdisk),
          uptime_fmt: formatUptime(vm.uptime),
          cpu_pct: Math.round(vm.cpu * 100),
          mem_pct: vm.maxmem > 0 ? Math.round((vm.mem / vm.maxmem) * 100) : 0,
          disk_pct:
            vm.type === 'qemu'
              ? vm.guest_disk_pct
              : vm.maxdisk > 0
                ? Math.round((vm.disk / vm.maxdisk) * 100)
                : null,
          disk_source:
            vm.type === 'qemu'
              ? vm.guest_disk_pct != null
                ? 'qemu_guest_agent'
                : 'unavailable'
              : 'proxmox_lxc',
          disk_error: vm.type === 'qemu' ? guestDiskError : null,
          netin: vm.netin ?? 0,
          netout: vm.netout ?? 0,
        }
      }),
    }

    if (metrics.nodes.length === 0 && metrics.vms.length === 0 && metrics.errors?.length) {
      return NextResponse.json(
        {
          ...result,
          error: `Proxmox indisponible: ${metrics.errors.map((item) => item.message).join(' · ')}`,
        },
        { status: 503 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    logError('proxmox.metrics', err)
    return NextResponse.json({ error: `Proxmox indisponible: ${message}` }, { status: 503 })
  }
}
