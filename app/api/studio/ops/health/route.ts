import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildOpsHealthSummary, type OpsHealthInput } from '@/lib/ops/ops-health'
import { logError } from '@/lib/logger'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
import { getProxmoxMetrics, resolveProxmoxConfig } from '@/lib/proxmox-client'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'
import type { ProxmoxClientSettings } from '@/lib/proxmox-client'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const now = new Date()
  const since24h = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const startOfDayIso = startOfDay.toISOString()
  const { data: ventures, error: venturesError } = await supabase
    .from('ventures')
    .select('id')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (venturesError) {
    logError('ops-health.ventures', venturesError.message)
    return NextResponse.json({ error: venturesError.message }, { status: 500 })
  }

  const ventureIds = (ventures ?? [])
    .map((venture) => venture.id)
    .filter((value): value is string => typeof value === 'string')

  // 1. autonomy_jobs.status = 'failed' updated_at > now - 24h
  const jobsFailedPromise = supabase
    .from('autonomy_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('status', 'failed')
    .gte('updated_at', since24h)

  // 2. human_approvals.status = 'pending'
  const approvalsPendingPromise = supabase
    .from('human_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('status', 'pending')

  // 3. infra diagnostics (commit + status)
  const diagnosticsPromise = collectInfraDiagnostics({
    supabase: supabase as unknown as InfraDiagnosticsSupabase,
    userId: user!.id,
  }).catch((err) => {
    logError('ops-health.diagnostics', err)
    return null
  })

  // 3b. Disque root Proxmox (via le client direct, gérer l'absence de creds gracieusement)
  const diskPromise = (async (): Promise<number | null> => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('proxmox_base_url,proxmox_node')
        .eq('user_id', user!.id)
        .maybeSingle()
      const config = resolveProxmoxConfig(
        unwrapOptionalInfraSettings(data as ProxmoxClientSettings | null, null)
      )
      if (!config.tokenSecret) return null
      const metrics = await getProxmoxMetrics(config)
      const node = metrics.nodes[0]
      return node?.disk_pct ?? null
    } catch (err) {
      logError('ops-health.proxmox', err)
      return null
    }
  })()

  // 4. payments completed today
  const paymentsTodayPromise =
    ventureIds.length > 0
      ? supabase
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .in('venture_id', ventureIds)
          .eq('status', 'completed')
          .gte('updated_at', startOfDayIso)
      : Promise.resolve({ data: null, error: null, count: 0 })

  // 5. venture_events today
  const eventsTodayPromise = supabase
    .from('venture_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .gte('occurred_at', startOfDayIso)

  const [jobsFailed, approvalsPending, diagnostics, diskRootPct, paymentsToday, eventsToday] =
    await Promise.all([
      jobsFailedPromise,
      approvalsPendingPromise,
      diagnosticsPromise,
      diskPromise,
      paymentsTodayPromise,
      eventsTodayPromise,
    ])

  const firstError = [
    jobsFailed.error,
    approvalsPending.error,
    paymentsToday.error,
    eventsToday.error,
  ].find(Boolean)

  if (firstError) {
    logError('ops-health.query', firstError.message)
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  const servicesSummary = diagnostics?.summary
  const lastDeployStatus: OpsHealthInput['lastDeployStatus'] = servicesSummary
    ? servicesSummary.ok
      ? 'ok'
      : 'degraded'
    : null

  const summary = buildOpsHealthSummary({
    jobsFailed24h: jobsFailed.count ?? 0,
    approvalsPending: approvalsPending.count ?? 0,
    lastDeployCommit: diagnostics?.runtime.sourceCommit ?? null,
    lastDeployStatus,
    lastDeployAt: diagnostics?.checkedAt ?? null,
    diskRootPct,
    paymentsCompletedToday: paymentsToday.count ?? 0,
    ventureEventsToday: eventsToday.count ?? 0,
    now,
  })

  return NextResponse.json({ ok: true, summary })
}
