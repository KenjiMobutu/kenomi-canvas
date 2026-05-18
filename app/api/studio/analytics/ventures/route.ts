import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  buildVentureMetricSnapshots,
  type VentureMetricSourceRow,
} from '@/lib/metrics/venture-metrics'

interface VentureRow {
  id: string
  name: string | null
  slug: string | null
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data: ventures, error: venturesError } = await supabase
    .from('ventures')
    .select('id, name, slug')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  if (venturesError) {
    return NextResponse.json({ error: venturesError.message }, { status: 500 })
  }

  const ventureRows = (ventures ?? []) as VentureRow[]
  const ventureIds = ventureRows.map((venture) => venture.id)

  if (ventureIds.length === 0) {
    return NextResponse.json({ ok: true, ventures: [] })
  }

  const { data: events, error: eventsError } = await supabase
    .from('venture_events')
    .select('venture_id, event_type, value')
    .eq('user_id', user!.id)
    .in('venture_id', ventureIds)

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ventures: buildVentureMetricSnapshots(ventureRows, (events ?? []) as VentureMetricSourceRow[]),
  })
}
