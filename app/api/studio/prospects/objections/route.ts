import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import {
  buildConversationEventInsert,
  conversationEventTypes,
  summarizeConversationEvents,
  type ProspectConversationEventRow,
} from '@/lib/revenue/objections'

const conversationEventSchema = z.object({
  prospect_id: z.string().uuid(),
  event_type: z.enum(conversationEventTypes),
  event_value: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const url = new URL(request.url)
  const prospectId = url.searchParams.get('prospect_id')

  let query = supabase
    .from('prospect_conversation_events')
    .select('id, prospect_id, user_id, event_type, event_value, notes, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (prospectId) {
    query = query.eq('prospect_id', prospectId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as ProspectConversationEventRow[]
  return NextResponse.json(
    {
      ok: true,
      events: rows,
      summary: summarizeConversationEvents(rows),
    },
    { status: 200 }
  )
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = conversationEventSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload conversation invalide' }, { status: 400 })
  }

  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .select('id')
    .eq('id', parsed.data.prospect_id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (prospectError) {
    return NextResponse.json({ error: prospectError.message }, { status: 500 })
  }

  if (!prospect) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 })
  }

  const nowIso = new Date().toISOString()
  const insert = buildConversationEventInsert({
    prospectId: parsed.data.prospect_id,
    userId: user!.id,
    eventType: parsed.data.event_type,
    eventValue: parsed.data.event_value ?? null,
    notes: parsed.data.notes ?? null,
    createdAt: nowIso,
  })

  const { data, error } = await supabase
    .from('prospect_conversation_events')
    .insert(insert)
    .select('id, prospect_id, user_id, event_type, event_value, notes, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('prospect_activities').insert(
    buildProspectActivityInsert({
      prospectId: parsed.data.prospect_id,
      userId: user!.id,
      type: 'conversation_truth_recorded',
      detail: `Recorded ${parsed.data.event_type.replaceAll('_', ' ')}`,
      metadata: {
        event_type: parsed.data.event_type,
        event_value: insert.event_value,
      },
      nowIso,
    })
  )

  return NextResponse.json({ ok: true, event: data }, { status: 200 })
}
