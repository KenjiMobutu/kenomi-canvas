import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: wf } = await supabase.from('automation_workflows')
    .select('webhook_url, run_count').eq('id', id).eq('user_id', user.id).maybeSingle()

  if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (wf.webhook_url) {
    try {
      await fetch(wf.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'kenomi-studio', trigger: 'manual', timestamp: new Date().toISOString() }),
      })
    } catch {
      return NextResponse.json({ error: 'Webhook unreachable' }, { status: 502 })
    }
  }

  await supabase.from('automation_workflows')
    .update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
