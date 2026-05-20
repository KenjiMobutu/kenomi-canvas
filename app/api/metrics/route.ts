import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  approvalBacklogGauge,
  buildBusinessGaugeSnapshot,
  dailyCycleAgeHoursGauge,
  deployFailures24hGauge,
  jobsFailed24hGauge,
  register,
} from '@/lib/metrics/prometheus'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

async function collectBusinessGaugeSnapshot() {
  const now = new Date()
  const since24hIso = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString()

  const [approvals, failedJobs, deployFailures, lastCycle] = await Promise.all([
    supabaseAdmin
      .from('human_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('autonomy_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', since24hIso),
    supabaseAdmin
      .from('agent_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'deployment.failed')
      .gte('created_at', since24hIso),
    supabaseAdmin
      .from('agent_events')
      .select('created_at')
      .eq('event_type', 'revenue.daily_cycle.completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const firstError = [
    approvals.error,
    failedJobs.error,
    deployFailures.error,
    lastCycle.error,
  ].find(Boolean)
  if (firstError) throw new Error(firstError.message)

  const lastCycleIso =
    typeof (lastCycle.data as { created_at?: unknown } | null)?.created_at === 'string'
      ? ((lastCycle.data as { created_at: string }).created_at ?? null)
      : null
  const dailyCycleAgeHours = lastCycleIso
    ? Math.max(
        0,
        Math.round(((now.getTime() - new Date(lastCycleIso).getTime()) / 3_600_000) * 100) / 100
      )
    : 0

  return buildBusinessGaugeSnapshot({
    approvalsPending: approvals.count ?? 0,
    jobsFailed24h: failedJobs.count ?? 0,
    deployFailures24h: deployFailures.count ?? 0,
    dailyCycleAgeHours,
  })
}

export async function GET(req: Request): Promise<Response> {
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${token}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const snapshot = await collectBusinessGaugeSnapshot()
  for (const gauge of snapshot) {
    if (gauge.name === 'kenomi_approval_backlog') approvalBacklogGauge.set(gauge.value)
    if (gauge.name === 'kenomi_jobs_failed_24h') jobsFailed24hGauge.set(gauge.value)
    if (gauge.name === 'kenomi_deploy_failures_24h') deployFailures24hGauge.set(gauge.value)
    if (gauge.name === 'kenomi_daily_cycle_age_hours') dailyCycleAgeHoursGauge.set(gauge.value)
  }

  const metrics = await register.metrics()
  return new Response(metrics, {
    headers: { 'Content-Type': register.contentType },
  })
}
