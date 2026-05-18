import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedWebhookUrl } from '@/lib/security'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
import { buildRunResult } from '@/lib/automation-run-status'
import { insertAuditEvent } from '@/lib/audit-log'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`automation-trigger:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de triggers. Réessayez dans une minute.', 429)
  }

  let id: string
  try {
    const body = await req.json()
    id = body.id ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!id) return apiError('id required', 400)

  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('webhook_url, run_count')
    .eq('id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!wf) return apiError('Not found', 404)

  const startMs = Date.now()

  let fetchError: Error | null = null
  let fetchStatus: number | null = null

  if (wf.webhook_url) {
    if (!isAllowedWebhookUrl(wf.webhook_url)) {
      return apiError('URL webhook non autorisée', 400)
    }
    try {
      const resp = await fetch(wf.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'kenomi-studio',
          trigger: 'manual',
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      })
      fetchStatus = resp.status
    } catch (e) {
      fetchError = e as Error
    }
  }

  const { status, httpStatus, errorMessage } = buildRunResult({
    webhookUrl: wf.webhook_url,
    fetchError,
    fetchStatus,
  })

  const durationMs = Date.now() - startMs

  const runInsert = supabase.from('automation_runs').insert({
    user_id: user!.id,
    workflow_id: id,
    status,
    http_status: httpStatus,
    duration_ms: durationMs,
    error_message: errorMessage,
  })

  const wfUpdate = supabase
    .from('automation_workflows')
    .update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user!.id)

  const [runRes, wfRes] = await Promise.all([runInsert, wfUpdate])
  if (runRes.error) console.error('[trigger] automation_runs insert failed:', runRes.error.message)
  if (wfRes.error) console.error('[trigger] workflow update failed:', wfRes.error.message)

  await insertAuditEvent(supabase, {
    user_id: user!.id,
    event_type: 'automation.trigger.completed',
    severity: status === 'success' ? 'info' : 'warn',
    metadata: {
      workflow_id: id,
      status,
      http_status: httpStatus,
      duration_ms: durationMs,
    },
  })

  if (status !== 'success') {
    return NextResponse.json({ error: errorMessage }, { status: status === 'timeout' ? 504 : 502 })
  }

  return NextResponse.json({ ok: true, durationMs })
}
