import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAllowedWebhookUrl } from '@/lib/security'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
