import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedWebhookUrl } from '@/lib/security'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let id: string
  try {
    const body = await req.json()
    id = body.id ?? ''
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('webhook_url, run_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (wf.webhook_url) {
    if (!isAllowedWebhookUrl(wf.webhook_url)) {
      return NextResponse.json({ error: 'URL webhook non autorisée' }, { status: 400 })
    }
    try {
      const resp = await fetch(wf.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: 'kenomi-studio', trigger: 'manual', timestamp: new Date().toISOString() }),
        signal:  AbortSignal.timeout(8000),
      })
      if (!resp.ok) {
        return NextResponse.json({ error: `Webhook erreur HTTP ${resp.status}` }, { status: 502 })
      }
    } catch (e) {
      const msg = e instanceof Error && e.name === 'TimeoutError'
        ? 'Webhook timeout (8s)'
        : 'Webhook injoignable'
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  await supabase
    .from('automation_workflows')
    .update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
