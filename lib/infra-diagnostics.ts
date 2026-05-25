export type DiagnosticStatus = 'ok' | 'degraded' | 'down'
export type DiagnosticSource = 'settings' | 'env' | 'runtime'

export type RuntimeDiagnostic = {
  environment: string
  sourceCommit: string
  commitShort: string
}

export type ServiceDiagnosticInput = {
  id: string
  label: string
  url: string
  source: DiagnosticSource
  ok: boolean
  latencyMs: number
  error?: string | null
}

export type ProxmoxDiagnosticInput = {
  ok: boolean
  url: string
  source: DiagnosticSource
  latencyMs: number
  error?: string | null
  vmCount: number
  nodeCount: number
}

export type InfraDiagnosticLine = {
  id: string
  label: string
  status: DiagnosticStatus
  source: DiagnosticSource
  urlLabel: string
  latencyMs: number
  lastError: string | null
  repairAction: string
  checkedAt: string
}

export type ProxmoxDiagnosticLine = InfraDiagnosticLine & {
  detail: string
}

export type InfraDiagnostics = {
  checkedAt: string
  runtime: RuntimeDiagnostic
  summary: {
    ok: boolean
    checksOk: number
    checksTotal: number
  }
  services: InfraDiagnosticLine[]
  proxmox: ProxmoxDiagnosticLine
}

export function maskDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname}`
  } catch {
    return value.replace(/\?.*$/, '')
  }
}

export function resolveSettingSource(value: string | null | undefined): DiagnosticSource {
  return typeof value === 'string' && value.trim().length > 0 ? 'settings' : 'env'
}

export function summarizeRuntime(env: Partial<NodeJS.ProcessEnv> = process.env): RuntimeDiagnostic {
  const sourceCommit =
    env.SOURCE_COMMIT ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? 'local-dev'
  return {
    environment: env.NODE_ENV ?? 'development',
    sourceCommit,
    commitShort: sourceCommit.slice(0, 7),
  }
}

function serviceRepairAction(id: string, ok: boolean): string {
  if (ok) return 'Aucune action'
  if (id === 'hermesAgent') return 'Verifier le reverse proxy Coolify, l auth et le backend Ollama'
  if (id === 'ollama') return 'Verifier URL Ollama settings/env et port 11434'
  if (id === 'n8n') return 'Verifier URL n8n / DNS / container Coolify'
  if (id === 'supabase') return 'Verifier Supabase via VM Coolify et REST API'
  if (id === 'coolify') return 'Verifier Coolify URL, API token et container'
  return 'Verifier URL, DNS et service cible'
}

function toStatus(ok: boolean, error?: string | null): DiagnosticStatus {
  if (ok) return 'ok'
  return error ? 'down' : 'degraded'
}

function serviceLine(input: ServiceDiagnosticInput, checkedAt: string): InfraDiagnosticLine {
  return {
    id: input.id,
    label: input.label,
    status: toStatus(input.ok, input.error),
    source: input.source,
    urlLabel: maskDiagnosticUrl(input.url),
    latencyMs: input.latencyMs,
    lastError: input.error ?? null,
    repairAction: serviceRepairAction(input.id, input.ok),
    checkedAt,
  }
}

function proxmoxLine(input: ProxmoxDiagnosticInput, checkedAt: string): ProxmoxDiagnosticLine {
  const detail = input.ok
    ? `${input.nodeCount} node · ${input.vmCount} VMs`
    : 'Métriques Proxmox indisponibles'
  return {
    id: 'proxmox',
    label: 'Proxmox',
    status: toStatus(input.ok, input.error),
    source: input.source,
    urlLabel: maskDiagnosticUrl(input.url),
    latencyMs: input.latencyMs,
    lastError: input.error ?? null,
    repairAction: input.ok ? 'Aucune action' : 'Verifier node Proxmox, token et reachability LAN',
    checkedAt,
    detail,
  }
}

export function buildInfraDiagnostics(input: {
  checkedAt: string
  runtime: RuntimeDiagnostic
  services: ServiceDiagnosticInput[]
  proxmox: ProxmoxDiagnosticInput
}): InfraDiagnostics {
  const services = input.services.map((service) => serviceLine(service, input.checkedAt))
  const proxmox = proxmoxLine(input.proxmox, input.checkedAt)
  const checks = [...services, proxmox]
  const checksOk = checks.filter((check) => check.status === 'ok').length

  return {
    checkedAt: input.checkedAt,
    runtime: input.runtime,
    summary: {
      ok: checksOk === checks.length,
      checksOk,
      checksTotal: checks.length,
    },
    services,
    proxmox,
  }
}
