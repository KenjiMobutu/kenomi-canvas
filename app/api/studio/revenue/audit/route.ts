import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'

export async function GET() {
  const { user, supabase, response } = await requireAllowedUser(await cookies())
  if (response) return response

  const { data, error } = await supabase
    .from('agent_events')
    .select('id, event_type, severity, metadata, created_at')
    .eq('user_id', user!.id)
    .like('event_type', 'revenue.%')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, events: data ?? [] })
}
