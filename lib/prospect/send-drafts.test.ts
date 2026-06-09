import { describe, expect, it } from 'vitest'
import { sendProspectDrafts, type ProspectDraftSendSupabase } from './send-drafts'

type TableName = 'prospects' | 'campaign_drafts' | 'user_settings' | 'prospect_activities'
type Row = Record<string, unknown>

function createFakeSupabase(seed: Partial<Record<TableName, Row[]>>) {
  const tables: Record<TableName, Row[]> = {
    prospects: seed.prospects ?? [],
    campaign_drafts: seed.campaign_drafts ?? [],
    user_settings: seed.user_settings ?? [],
    prospect_activities: seed.prospect_activities ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        patch: null as Row | null,
        orderField: null as string | null,
        ascending: true,
      }
      const resolveRows = () => {
        let rows = [...tables[tableName]].filter((row) =>
          state.filters.every((filter) => row[filter.field] === filter.value)
        )
        if (state.orderField) {
          rows.sort((a, b) => {
            const left = String(a[state.orderField!] ?? '')
            const right = String(b[state.orderField!] ?? '')
            return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
          })
        }
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
        update: (patch: Row) => {
          state.patch = patch
          return {
            eq: async (field: string, value: unknown) => {
              const rows = tables[tableName].filter((row) =>
                [...state.filters, { field, value }].every((filter) => row[filter.field] === filter.value)
              )
              rows.forEach((row) => Object.assign(row, patch))
              return { error: null }
            },
          }
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
        ) => Promise.resolve({ data: resolveRows(), error: null }).then(resolve ?? undefined, reject ?? undefined),
      }
      return builder
    },
  } as unknown as ProspectDraftSendSupabase & { tables: Record<TableName, Row[]> }
}

describe('sendProspectDrafts', () => {
  it('publishes an existing draft with the configured server-side provider', async () => {
    const supabase = createFakeSupabase({
      user_settings: [{ user_id: 'u1', prospect_outreach_email: 'hello@kenomi.eu' }],
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'u1',
          company_name: 'Curiosity Studio',
          contact_email: 'hello@curiositystudio.com',
          status: 'approved_to_send',
          pipeline_status: 'draft_created',
          metadata: { activity: [] },
        },
      ],
      campaign_drafts: [
        {
          id: 'draft-1',
          user_id: 'u1',
          content: 'Draft body',
          status: 'draft',
          created_at: '2026-06-09T11:00:00.000Z',
          metadata: {
            title: 'Curiosity Studio — quick thought on slower lead response',
            to: 'hello@curiositystudio.com',
            prospect_id: 'prospect-1',
          },
        },
      ],
    })

    const result = await sendProspectDrafts({
      supabase,
      userId: 'u1',
      prospectIds: ['prospect-1'],
      now: () => new Date('2026-06-09T12:00:00.000Z'),
      prospectEmailSender: async () => ({ provider: 'smtp', messageId: '<smtp-1@kenomi.eu>' }),
    })

    expect(result).toMatchObject({
      processed: 1,
      sent: 1,
      failed: 0,
      results: [
        {
          ok: true,
          prospectId: 'prospect-1',
          draftId: 'draft-1',
          provider: 'smtp',
          messageId: '<smtp-1@kenomi.eu>',
        },
      ],
    })
    expect(supabase.tables.campaign_drafts[0]).toMatchObject({
      status: 'published',
      published_at: '2026-06-09T12:00:00.000Z',
      metadata: expect.objectContaining({
        provider: 'smtp',
        from: 'hello@kenomi.eu',
        delivery_status: 'sent',
        provider_message_id: '<smtp-1@kenomi.eu>',
      }),
    })
    expect(supabase.tables.prospects[0]).toMatchObject({
      status: 'sent',
      pipeline_status: 'sent',
      draft_provider: 'smtp',
      draft_external_id: '<smtp-1@kenomi.eu>',
      last_contacted_at: '2026-06-09T12:00:00.000Z',
      next_followup_at: '2026-06-11T12:00:00.000Z',
      last_outreach_kind: 'initial',
      follow_up_count: 0,
    })
    expect(supabase.tables.prospect_activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prospect_id: 'prospect-1',
          type: 'marked_sent',
          detail: 'Outbound sent via smtp',
        }),
      ])
    )
  })

  it('returns a failure when no draft exists for the requested prospect', async () => {
    const supabase = createFakeSupabase({
      user_settings: [{ user_id: 'u1', prospect_outreach_email: 'hello@kenomi.eu' }],
      prospects: [{ id: 'prospect-1', user_id: 'u1', company_name: 'Acme', contact_email: 'a@b.c' }],
    })

    const result = await sendProspectDrafts({
      supabase,
      userId: 'u1',
      prospectIds: ['prospect-1'],
      prospectEmailSender: async () => ({ provider: 'smtp', messageId: '<smtp-1@kenomi.eu>' }),
    })

    expect(result).toMatchObject({
      processed: 1,
      sent: 0,
      failed: 1,
      results: [{ ok: false, prospectId: 'prospect-1', error: 'Draft not found' }],
    })
  })

  it('reschedules the next follow-up from the actual send time for follow-up drafts', async () => {
    const supabase = createFakeSupabase({
      user_settings: [{ user_id: 'u1', prospect_outreach_email: 'hello@kenomi.eu' }],
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'u1',
          company_name: 'Mangos',
          contact_email: 'james@mangos.agency',
          status: 'follow_up',
          pipeline_status: 'draft_created',
          follow_up_count: 1,
          last_outreach_kind: 'follow_up_1',
          metadata: { activity: [] },
        },
      ],
      campaign_drafts: [
        {
          id: 'draft-1',
          user_id: 'u1',
          content: 'Follow-up body',
          status: 'draft',
          created_at: '2026-06-09T12:00:00.000Z',
          metadata: {
            title: 'Mangos — follow-up',
            to: 'james@mangos.agency',
            prospect_id: 'prospect-1',
            outreach_kind: 'follow_up_1',
          },
        },
      ],
    })

    const result = await sendProspectDrafts({
      supabase,
      userId: 'u1',
      prospectIds: ['prospect-1'],
      now: () => new Date('2026-06-09T12:00:00.000Z'),
      prospectEmailSender: async () => ({ provider: 'smtp', messageId: '<smtp-2@kenomi.eu>' }),
    })

    expect(result.sent).toBe(1)
    expect(supabase.tables.prospects[0]).toMatchObject({
      status: 'follow_up',
      pipeline_status: 'sent',
      draft_provider: 'smtp',
      draft_external_id: '<smtp-2@kenomi.eu>',
      next_followup_at: '2026-06-14T12:00:00.000Z',
      last_outreach_kind: 'follow_up_1',
      follow_up_count: 1,
    })
  })
})
