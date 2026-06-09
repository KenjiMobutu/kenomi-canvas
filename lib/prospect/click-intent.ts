import { buildProspectActivityInsert } from './activity-log'

interface ProspectClickIntentQuery {
  select(columns?: string): ProspectClickIntentQuery
  update(values: Record<string, unknown>): ProspectClickIntentQuery
  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): ProspectClickIntentQuery
  eq(field: string, value: unknown): ProspectClickIntentQuery
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface ProspectClickIntentSupabase {
  from(table: 'prospects' | 'prospect_activities'): ProspectClickIntentQuery | any
}

interface ProspectRow {
  id: string
  user_id: string
  pipeline_status?: string | null
  operator_notes?: string | null
  next_action?: string | null
  next_followup_at?: string | null
  follow_up_count?: number | null
  last_outreach_kind?: string | null
}

export interface RecordProspectClickIntentInput {
  supabase: ProspectClickIntentSupabase
  prospectId: string | null
  email?: string | null
  outreachAngle?: string | null
  now?: () => Date
}

function appendOperatorNote(current: unknown, note: string) {
  const currentText = typeof current === 'string' ? current.trim() : ''
  if (!currentText) return note
  if (currentText.includes(note)) return currentText
  return `${currentText} | ${note}`
}

async function maybeSingle<T>(query: ProspectClickIntentQuery): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

export async function recordProspectClickIntent(
  input: RecordProspectClickIntentInput
): Promise<{ updated: boolean; acceleratedTo: string | null }> {
  if (!input.prospectId) return { updated: false, acceleratedTo: null }

  const prospect = await maybeSingle<ProspectRow>(
    input.supabase
      .from('prospects')
      .select(
        'id, user_id, pipeline_status, operator_notes, next_action, next_followup_at, follow_up_count, last_outreach_kind'
      )
      .eq('id', input.prospectId)
  )

  if (!prospect?.id) return { updated: false, acceleratedTo: null }
  if (!prospect.user_id) return { updated: false, acceleratedTo: null }
  if (['replied', 'won', 'lost'].includes(prospect.pipeline_status ?? '')) {
    return { updated: false, acceleratedTo: null }
  }

  const now = (input.now ?? (() => new Date()))()
  const nowIso = now.toISOString()
  const acceleratedTo = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString()
  const currentNext = prospect.next_followup_at?.trim() || null
  const shouldAccelerate =
    prospect.pipeline_status === 'sent' &&
    (!currentNext || new Date(currentNext).getTime() > new Date(acceleratedTo).getTime())

  const nextAction = 'Hot lead clicked landing - reply personally or send follow-up today'
  const note = `Landing clicked${input.email ? ` by ${input.email}` : ''}${input.outreachAngle ? ` (${input.outreachAngle})` : ''}`

  await input.supabase
    .from('prospects')
    .update({
      operator_notes: appendOperatorNote(prospect.operator_notes, note),
      next_action: nextAction,
      next_followup_at: shouldAccelerate ? acceleratedTo : currentNext,
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', prospect.id)

  await input.supabase.from('prospect_activities').insert(
    buildProspectActivityInsert({
      prospectId: prospect.id,
      userId: prospect.user_id,
      type: 'next_action_updated',
      detail: note,
      metadata: {
        source: 'landing_click',
        next_action: nextAction,
        accelerated_to: shouldAccelerate ? acceleratedTo : null,
        outreach_angle: input.outreachAngle ?? null,
      },
      nowIso,
    })
  )

  return {
    updated: true,
    acceleratedTo: shouldAccelerate ? acceleratedTo : null,
  }
}
