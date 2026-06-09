import { buildProspectActivityInsert } from './activity-log'

interface ProspectHandRaiseQuery {
  select(columns?: string): ProspectHandRaiseQuery
  update(values: Record<string, unknown>): ProspectHandRaiseQuery
  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): ProspectHandRaiseQuery
  eq(field: string, value: unknown): ProspectHandRaiseQuery
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface ProspectHandRaiseSupabase {
  from(table: 'prospects' | 'prospect_activities'): ProspectHandRaiseQuery | any
}

interface ProspectRow {
  id: string
  user_id: string
  pipeline_status?: string | null
  operator_notes?: string | null
  next_action?: string | null
}

function appendOperatorNote(current: unknown, note: string) {
  const currentText = typeof current === 'string' ? current.trim() : ''
  if (!currentText) return note
  if (currentText.includes(note)) return currentText
  return `${currentText} | ${note}`
}

async function maybeSingle<T>(query: ProspectHandRaiseQuery): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

export async function recordProspectHandRaise(input: {
  supabase: ProspectHandRaiseSupabase
  prospectId: string | null
  email?: string | null
  outreachAngle?: string | null
  now?: () => Date
}): Promise<{ updated: boolean }> {
  if (!input.prospectId) return { updated: false }

  const prospect = await maybeSingle<ProspectRow>(
    input.supabase
      .from('prospects')
      .select('id, user_id, pipeline_status, operator_notes, next_action')
      .eq('id', input.prospectId)
  )

  if (!prospect?.id || !prospect.user_id) return { updated: false }
  if (['replied', 'won', 'lost'].includes(prospect.pipeline_status ?? '')) {
    return { updated: false }
  }

  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const nextAction = 'Prospect requested the 3 fixes from landing - reply personally today'
  const note = `Requested the 3 fixes from landing${input.email ? ` by ${input.email}` : ''}${input.outreachAngle ? ` (${input.outreachAngle})` : ''}`

  await input.supabase
    .from('prospects')
    .update({
      operator_notes: appendOperatorNote(prospect.operator_notes, note),
      next_action: nextAction,
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
        source: 'landing_hand_raise',
        next_action: nextAction,
        outreach_angle: input.outreachAngle ?? null,
      },
      nowIso,
    })
  )

  return { updated: true }
}
