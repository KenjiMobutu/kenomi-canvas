import { resolveHealthServiceUrls, type UserInfraSettings } from '@/lib/infra-config'
import {
  buildInfraDiagnostics,
  resolveSettingSource,
  summarizeRuntime,
  type InfraDiagnostics,
  type ServiceDiagnosticInput,
} from '@/lib/infra-diagnostics'
import {
  getProxmoxMetrics,
  resolveProxmoxConfig,
  type ProxmoxClientSettings,
} from '@/lib/proxmox-client'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'
import { isAllowedInfraServiceUrl } from '@/lib/security'

type QueryResponse<T = unknown> = {
  data: T | null
  error: { message: string } | null
}

type QueryBuilder = {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  maybeSingle<T = unknown>(): Promise<QueryResponse<T>>
}

export type InfraDiagnosticsSupabase = {
  from(table: string): QueryBuilder
}

type ServiceStatus = {
  ok: boolean
  latencyMs: number
  error?: string | null
}

const REACHABLE_CODES = new Set([200, 201, 204, 301, 302, 401, 403, 404, 405])

async function pingDiagnosticUrl(
  serviceId: string,
  url: string,
  timeoutMs = 5000
): Promise<ServiceStatus> {
  const start = Date.now()
  if (!isAllowedInfraServiceUrl(serviceId, url)) {
    return {
      ok: false,
      latencyMs: 0,
      error: 'blocked by url policy',
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const reachable = REACHABLE_CODES.has(res.status)
    return {
      ok: reachable,
      latencyMs: Date.now() - start,
      error: reachable ? null : `HTTP ${res.status}`,
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

export async function collectInfraDiagnostics(input: {
  supabase: InfraDiagnosticsSupabase
  userId: string
}): Promise<InfraDiagnostics> {
  const { data, error } = await input.supabase
    .from('user_settings')
    .select(
      'hermes_agent_url,ollama_base_url,n8n_base_url,supabase_url,coolify_url,proxmox_base_url,proxmox_node'
    )
    .eq('user_id', input.userId)
    .maybeSingle<UserInfraSettings>()

  const settings = unwrapOptionalInfraSettings(data, error)
  const urls = resolveHealthServiceUrls(settings)
  const checkedAt = new Date().toISOString()

  const [hermesAgent, ollama, n8n, supabaseStatus, coolify] = await Promise.all([
    pingDiagnosticUrl('hermesAgent', urls.hermesAgent),
    pingDiagnosticUrl('ollama', urls.ollama),
    pingDiagnosticUrl('n8n', urls.n8n),
    pingDiagnosticUrl('supabase', urls.supabase),
    pingDiagnosticUrl('coolify', urls.coolify),
  ])

  const proxmoxConfig = resolveProxmoxConfig(settings as ProxmoxClientSettings | null)
  const proxmoxStartedAt = Date.now()
  const proxmoxMetrics = await getProxmoxMetrics(proxmoxConfig)
  const proxmoxError = proxmoxMetrics.errors?.map((item) => item.message).join(' · ') ?? null
  const proxmoxOk = proxmoxMetrics.nodes.length > 0 || proxmoxMetrics.vms.length > 0

  const services: ServiceDiagnosticInput[] = [
    {
      id: 'hermesAgent',
      label: 'Hermes Agent',
      url: urls.hermesAgent,
      source: resolveSettingSource(settings?.hermes_agent_url),
      ok: hermesAgent.ok,
      latencyMs: hermesAgent.latencyMs,
      error: hermesAgent.error,
    },
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
      ok: supabaseStatus.ok,
      latencyMs: supabaseStatus.latencyMs,
      error: supabaseStatus.error,
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

  return buildInfraDiagnostics({
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
}
