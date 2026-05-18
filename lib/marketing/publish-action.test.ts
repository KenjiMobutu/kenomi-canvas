import { describe, it, expect, vi } from 'vitest'
import { executePublishCampaign, type PublishActionSupabase, type PublishDraftRow } from './publish-action'

interface FakeTables {
  campaign_drafts: Array<PublishDraftRow & { status?: string; updated_at?: string }>
  venture_events: Record<string, unknown>[]
}

function createFakeSupabase(seed: { campaign_drafts: PublishDraftRow[] }): PublishActionSupabase & { tables: FakeTables } {
  const tables: FakeTables = {
    campaign_drafts: seed.campaign_drafts.map(d => ({ ...d })),
    venture_events: [],
  }

  return {
    tables,
    from(table: string) {
      let filterField: string | null = null
      let filterValue: unknown = null
      let patchPayload: Record<string, unknown> | null = null

      const matches = (row: Record<string, unknown>) =>
        filterField === null ? true : row[filterField] === filterValue

      const builder = {
        select: () => ({
          eq: (field: string, value: unknown) => {
            filterField = field
            filterValue = value
            return {
              maybeSingle: async () => {
                const rows = (tables as unknown as Record<string, Record<string, unknown>[]>)[table] ?? []
                const data = rows.find(matches) ?? null
                return { data: data as PublishDraftRow | null, error: null }
              },
            }
          },
        }),
        insert: (row: Record<string, unknown>) => {
          ;(tables as unknown as Record<string, Record<string, unknown>[]>)[table].push(row)
          return Promise.resolve({ error: null })
        },
        update: (patch: Record<string, unknown>) => {
          patchPayload = patch
          return {
            eq: (field: string, value: unknown) => {
              filterField = field
              filterValue = value
              const rows = (tables as unknown as Record<string, Record<string, unknown>[]>)[table] ?? []
              rows.filter(matches).forEach((row) => Object.assign(row, patchPayload))
              return Promise.resolve({ error: null })
            },
          }
        },
      }
      return builder
    },
  } as unknown as PublishActionSupabase & { tables: FakeTables }
}

describe('executePublishCampaign', () => {
  it('appelle le publisher, insère campaign_published, marque le draft published', async () => {
    const supabase = createFakeSupabase({
      campaign_drafts: [{
        id: 'd1', venture_id: 'v1', channel: 'email', content: 'Hi',
        metadata: { channel_index: 0 },
      }],
    })
    const publisher = {
      publish: vi.fn().mockResolvedValue({
        externalId: 'ext-1',
        url: 'https://mock.local/v1/email',
        metadata: { adapter: 'mock' },
      }),
    }

    const result = await executePublishCampaign({
      supabase,
      publisher,
      draftId: 'd1',
      userId: 'u1',
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.externalId).toBe('ext-1')
    expect(publisher.publish).toHaveBeenCalledWith({
      channel: 'email',
      content: 'Hi',
      ventureId: 'v1',
      metadata: { channel_index: 0 },
    })
    expect(supabase.tables.venture_events).toHaveLength(1)
    expect(supabase.tables.venture_events[0]).toMatchObject({
      user_id: 'u1',
      venture_id: 'v1',
      event_type: 'campaign_published',
    })
    expect(supabase.tables.campaign_drafts[0]).toMatchObject({
      status: 'published',
    })
  })

  it('insère campaign_spend en cents si metadata.budget_eur > 0', async () => {
    const supabase = createFakeSupabase({
      campaign_drafts: [{
        id: 'd1', venture_id: 'v1', channel: 'twitter', content: 'Buy now',
        metadata: { budget_eur: 50 },
      }],
    })
    const publisher = {
      publish: vi.fn().mockResolvedValue({ externalId: 'ext-2' }),
    }

    const result = await executePublishCampaign({
      supabase, publisher, draftId: 'd1', userId: 'u1',
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.spendEur).toBe(50)
    expect(supabase.tables.venture_events).toHaveLength(2)
    expect(supabase.tables.venture_events[1]).toMatchObject({
      event_type: 'campaign_spend',
      value: 5000,
    })
  })

  it('marque le draft failed si publisher throw', async () => {
    const supabase = createFakeSupabase({
      campaign_drafts: [{ id: 'd1', venture_id: 'v1', channel: 'email', content: 'x', metadata: {} }],
    })
    const publisher = {
      publish: vi.fn().mockRejectedValue(new Error('n8n down')),
    }

    const result = await executePublishCampaign({
      supabase, publisher, draftId: 'd1', userId: 'u1',
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('n8n down')
    expect(supabase.tables.campaign_drafts[0]).toMatchObject({ status: 'failed' })
    expect(supabase.tables.venture_events).toHaveLength(0)
  })

  it('échoue si draft introuvable', async () => {
    const supabase = createFakeSupabase({ campaign_drafts: [] })
    const publisher = { publish: vi.fn() }

    const result = await executePublishCampaign({
      supabase, publisher, draftId: 'absent', userId: 'u1',
    })

    expect(result.success).toBe(false)
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('échoue si venture_id null sur le draft', async () => {
    const supabase = createFakeSupabase({
      campaign_drafts: [{ id: 'd1', venture_id: null, channel: 'email', content: 'x', metadata: {} }],
    })
    const publisher = { publish: vi.fn() }

    const result = await executePublishCampaign({
      supabase, publisher, draftId: 'd1', userId: 'u1',
    })

    expect(result.success).toBe(false)
    expect(publisher.publish).not.toHaveBeenCalled()
    expect(supabase.tables.campaign_drafts[0]).toMatchObject({ status: 'failed' })
  })
})
