import { describe, expect, it } from 'vitest'
import { recordProspectClickIntent, type ProspectClickIntentSupabase } from './click-intent'

type TableName = 'prospects' | 'prospect_activities'
type Row = Record<string, unknown>

function createFakeSupabase(seed: Partial<Record<TableName, Row[]>>) {
  const tables: Record<TableName, Row[]> = {
    prospects: seed.prospects ?? [],
    prospect_activities: seed.prospect_activities ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const state = { filters: [] as Array<{ field: string; value: unknown }> }
      const resolveRows = () =>
        [...tables[tableName]].filter((row) =>
          state.filters.every((filter) => row[filter.field] === filter.value)
        )
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        update: (patch: Row) => {
          const updateState = { filters: [...state.filters] as Array<{ field: string; value: unknown }> }
          const updateBuilder = {
            eq: async (field: string, value: unknown) => {
              updateState.filters.push({ field, value })
              const rows = tables[tableName].filter((row) =>
                updateState.filters.every((filter) => row[filter.field] === filter.value)
              )
              rows.forEach((row) => Object.assign(row, patch))
              return { error: null }
            },
          }
          return updateBuilder
        },
        insert: async (payload: Row | Row[]) => {
          const rows = Array.isArray(payload) ? payload : [payload]
          rows.forEach((row) => tables[tableName].push({ ...row }))
          return { error: null }
        },
        maybeSingle: async () => ({ data: resolveRows()[0] ?? null, error: null }),
        then: <TResult1 = { data: Row[]; error: null }, TResult2 = never>(
          resolve?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) =>
          Promise.resolve({ data: resolveRows(), error: null }).then(
            resolve ?? undefined,
            reject ?? undefined
          ),
      }
      return builder
    },
  } as unknown as ProspectClickIntentSupabase & { tables: Record<TableName, Row[]> }
}

describe('recordProspectClickIntent', () => {
  it('accelerates the next follow-up for a sent lead that clicked the landing', async () => {
    const supabase = createFakeSupabase({
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'user-1',
          pipeline_status: 'sent',
          operator_notes: '',
          next_action: '',
          next_followup_at: '2026-06-12T12:00:00.000Z',
        },
      ],
    })

    const result = await recordProspectClickIntent({
      supabase,
      prospectId: 'prospect-1',
      email: 'buyer@test.local',
      outreachAngle: 'diagnostic-call-outbound-v6-direct-value',
      now: () => new Date('2026-06-09T12:00:00.000Z'),
    })

    expect(result).toEqual({
      updated: true,
      acceleratedTo: '2026-06-09T18:00:00.000Z',
    })
    expect(supabase.tables.prospects[0]).toMatchObject({
      next_action: 'Hot lead clicked landing - reply personally or send follow-up today',
      next_followup_at: '2026-06-09T18:00:00.000Z',
    })
    expect(String(supabase.tables.prospects[0].operator_notes)).toContain('Landing clicked by buyer@test.local')
    expect(supabase.tables.prospect_activities[0]).toMatchObject({
      prospect_id: 'prospect-1',
      type: 'next_action_updated',
      detail: 'Landing clicked by buyer@test.local (diagnostic-call-outbound-v6-direct-value)',
    })
  })

  it('does not touch terminal prospects', async () => {
    const supabase = createFakeSupabase({
      prospects: [{ id: 'prospect-1', user_id: 'user-1', pipeline_status: 'won' }],
    })

    const result = await recordProspectClickIntent({
      supabase,
      prospectId: 'prospect-1',
      now: () => new Date('2026-06-09T12:00:00.000Z'),
    })

    expect(result).toEqual({ updated: false, acceleratedTo: null })
    expect(supabase.tables.prospect_activities).toHaveLength(0)
  })
})
