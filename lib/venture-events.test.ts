import { describe, expect, it } from 'vitest'
import {
  buildVentureEventInsert,
  isVentureEventType,
  recordVentureEventBySlug,
  type VentureEventSupabase,
} from './venture-events'

function createFakeSupabase() {
  const inserted: Record<string, unknown>[] = []
  const ventures = [{ id: 'venture-1', user_id: 'user-1', slug: 'inbox-pulse' }]

  const supabase = {
    inserted,
    from(table: string) {
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        row: null as Record<string, unknown> | null,
      }
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        insert: (row: Record<string, unknown>) => {
          state.row = row
          inserted.push(row)
          return Promise.resolve({ error: null })
        },
        maybeSingle: async () => {
          if (table !== 'ventures') return { data: null, error: null }
          const venture = ventures.find((item) =>
            state.filters.every(
              (filter) => item[filter.field as keyof typeof item] === filter.value
            )
          )
          return { data: venture ?? null, error: null }
        },
      }
      return builder
    },
  }
  return supabase
}

describe('isVentureEventType', () => {
  it('accepte uniquement les événements business connus', () => {
    expect(isVentureEventType('page_view')).toBe(true)
    expect(isVentureEventType('waitlist_signup')).toBe(true)
    expect(isVentureEventType('campaign_spend')).toBe(true)
    expect(isVentureEventType('unknown')).toBe(false)
  })
})

describe('buildVentureEventInsert', () => {
  it('normalise un événement venture avec metadata sécurisée', () => {
    const row = buildVentureEventInsert({
      userId: 'user-1',
      ventureId: 'venture-1',
      eventType: 'page_view',
      source: 'landing',
      metadata: { path: '/inbox-pulse' },
      occurredAt: new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(row).toEqual({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'page_view',
      source: 'landing',
      value: null,
      metadata: { path: '/inbox-pulse' },
      occurred_at: '2026-05-18T10:00:00.000Z',
    })
  })
})

describe('recordVentureEventBySlug', () => {
  it('résout la venture par slug et insère un événement avec user_id', async () => {
    const supabase = createFakeSupabase()

    const result = await recordVentureEventBySlug(supabase as unknown as VentureEventSupabase, {
      slug: 'inbox-pulse',
      eventType: 'waitlist_signup',
      source: 'waitlist',
      metadata: { email_domain: 'example.com' },
      occurredAt: new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result).toEqual({ ok: true, ventureId: 'venture-1' })
    expect(supabase.inserted[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'waitlist_signup',
    })
  })

  it('stores attribution metadata for page views', async () => {
    const supabase = createFakeSupabase()

    const result = await recordVentureEventBySlug(supabase as unknown as VentureEventSupabase, {
      slug: 'inbox-pulse',
      eventType: 'page_view',
      source: 'landing',
      metadata: {
        utm_source: 'linkedin',
        utm_campaign: 'audit-may',
        referrer: 'https://linkedin.com',
      },
    })

    expect(result).toEqual({ ok: true, ventureId: 'venture-1' })
    expect(supabase.inserted[0]?.metadata).toMatchObject({
      utm_source: 'linkedin',
      utm_campaign: 'audit-may',
      referrer: 'https://linkedin.com',
    })
  })

  it('retourne ok=false si le slug ne correspond à aucune venture', async () => {
    const supabase = createFakeSupabase()

    const result = await recordVentureEventBySlug(supabase as unknown as VentureEventSupabase, {
      slug: 'missing',
      eventType: 'page_view',
    })

    expect(result).toEqual({ ok: false, error: 'venture_not_found' })
    expect(supabase.inserted).toEqual([])
  })
})
