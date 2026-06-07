import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/memory/prospect-memory', () => ({
  retrieveProspectMemories: vi.fn().mockResolvedValue([]),
  formatRetrievedProspectMemories: vi.fn().mockReturnValue(''),
  writeProspectMemory: vi.fn().mockResolvedValue(undefined),
}))

import { processDueProspectFollowUps, type ProspectScheduleSupabase } from './scheduled-follow-ups'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    prospects: [
      {
        id: 'prospect-1',
        user_id: 'user-1',
        company_name: 'Missing Email Co',
        contact_name: 'Léa Martin',
        contact_email: null,
        outreach_subject: 'Initial note',
        outreach_body: 'Hello',
        pipeline_status: 'sent',
        next_followup_at: '2026-05-25T10:00:00.000Z',
        follow_up_count: 0,
        follow_up_version: 0,
        last_outreach_kind: 'initial',
        operator_notes: 'Need reply',
        metadata: { summary: 'Need reply', pain_points: ['manual follow-up'] },
        tags: ['warm'],
      },
    ],
    autonomy_actions: [],
    human_approvals: [],
    campaign_drafts: [],
    prospect_activities: [],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown }>,
      orderField: null as string | null,
      ascending: true,
      limitCount: null as number | null,
    }

    const resolveRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) =>
        state.filters.every((filter) => row[filter.field] === filter.value)
      )
      if (state.orderField) {
        rows.sort((a, b) => {
          const left = String(a[state.orderField!] ?? '')
          const right = String(b[state.orderField!] ?? '')
          return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
      }
      if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
      return rows
    }

    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => {
        state.filters.push({ field, value })
        return builder
      },
      order: (field: string, options?: { ascending?: boolean }) => {
        state.orderField = field
        state.ascending = options?.ascending ?? true
        return builder
      },
      limit: (count: number) => {
        state.limitCount = count
        return builder
      },
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload]
        tables[table].push(...rows)
        return builder
      },
      update: (payload: Record<string, unknown>) => {
        const rows = resolveRows()
        rows.forEach((row) => Object.assign(row, payload))
        return builder
      },
      maybeSingle: async () => ({ data: resolveRows()[0] ?? null, error: null }),
      then: (
        onfulfilled?:
          | ((value: { data: unknown; error: { message: string } | null }) => unknown)
          | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => Promise.resolve({ data: resolveRows(), error: null }).then(onfulfilled ?? undefined, onrejected ?? undefined),
    }

    return builder
  }

  return {
    tables,
    from: (table: string) => makeBuilder(table),
  }
}

describe('processDueProspectFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips follow-up generation for prospects without a valid contact email', async () => {
    const supabase = makeSupabase()

    const result = await processDueProspectFollowUps({
      supabase: supabase as unknown as ProspectScheduleSupabase,
      userId: 'user-1',
      nowIso: '2026-05-26T10:00:00.000Z',
    })

    expect(result).toEqual({ processed: 0 })
    expect(supabase.tables.autonomy_actions).toHaveLength(0)
    expect(supabase.tables.human_approvals).toHaveLength(0)
    expect(supabase.tables.campaign_drafts).toHaveLength(0)
    expect(supabase.tables.prospect_activities).toHaveLength(0)
    expect(supabase.tables.prospects[0]).toMatchObject({
      pipeline_status: 'sent',
      next_followup_at: '2026-05-25T10:00:00.000Z',
    })
  })
})
