import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { resolveHealthServiceUrls, type UserInfraSettings } from '@/lib/infra-config'
import {
  buildInfraDiagnostics,
  resolveSettingSource,
  summarizeRuntime,
  type ServiceDiagnosticInput,
} from '@/lib/infra-diagnostics'
import {
  getProxmoxMetrics,
  resolveProxmoxConfig,
  type ProxmoxClientSettings,
} from '@/lib/proxmox-client'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'

type ServiceStatus = {
  ok: boolean
  latencyMs: number
  error?: string | null
}

const REACHABLE_CODES = new Set([200, 201, 204, 301, 302, 401, 403, 404, 405])

async function ping(url: string, timeoutMs = 5000): Promise<ServiceStatus> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return {
      ok: REACHABLE_CODES.has(res.status),
      latencyMs: Date.now() - start,
      error: REACHABLE_CODES.has(res.status) ? null : `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'unreachable',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('user_settings')
    .select('ollama_base_url,n8n_base_url,supabase_url,coolify_url,proxmox_base_url,proxmox_node')
    .eq('user_id', user!.id)
    .maybeSingle()

  const settings = unwrapOptionalInfraSettings(data as UserInfraSettings | null, error)
  const urls = resolveHealthServiceUrls(settings)
  const checkedAt = new Date().toISOString()

  const [ollama, n8n, supabaseHealth, coolify] = await Promise.all([
    ping(urls.ollama),
    ping(urls.n8n),
    ping(urls.supabase),
    ping(urls.coolify),
  ])

  const proxmoxConfig = resolveProxmoxConfig(settings as ProxmoxClientSettings | null)
  const proxmoxStartedAt = Date.now()
  const proxmoxMetrics = await getProxmoxMetrics(proxmoxConfig)
  const proxmoxError = proxmoxMetrics.errors?.map((item) => item.message).join(' · ') ?? null
  const proxmoxOk = proxmoxMetrics.nodes.length > 0 || proxmoxMetrics.vms.length > 0

  const services: ServiceDiagnosticInput[] = [
    {
      id: 'ollama',
      label: 'Ollama',
      url: urls.ollama,
      source: resolveSettingSource(settings?.ollama_base_url),
      ok: ollama.ok,
      latencyMs: ollama.latencyMs,
      error: ollama.error,
    },
    {
      id: 'n8n',
      label: 'n8n',
      url: urls.n8n,
      source: resolveSettingSource(settings?.n8n_base_url),
      ok: n8n.ok,
      latencyMs: n8n.latencyMs,
      error: n8n.error,
    },
    {
      id: 'supabase',
      label: 'Supabase',
      url: urls.supabase,
      source: resolveSettingSource(settings?.supabase_url),
      ok: supabaseHealth.ok,
      latencyMs: supabaseHealth.latencyMs,
      error: supabaseHealth.error,
    },
    {
      id: 'coolify',
      label: 'Coolify',
      url: urls.coolify,
      source: resolveSettingSource(settings?.coolify_url),
      ok: coolify.ok,
      latencyMs: coolify.latencyMs,
      error: coolify.error,
    },
  ]

  const diagnostics = buildInfraDiagnostics({
    checkedAt,
    runtime: summarizeRuntime(),
    services,
    proxmox: {
      ok: proxmoxOk,
      url: `${proxmoxConfig.baseUrl}/api2/json/nodes/${proxmoxConfig.node}/status`,
      source: resolveSettingSource(settings?.proxmox_base_url ?? settings?.proxmox_node),
      latencyMs: Date.now() - proxmoxStartedAt,
      error: proxmoxError,
      vmCount: proxmoxMetrics.vms.length,
      nodeCount: proxmoxMetrics.nodes.length,
    },
  })

  return NextResponse.json(diagnostics, { status: diagnostics.summary.ok ? 200 : 207 })
}
