import { describe, expect, it } from 'vitest'
import { resolvePublicLandingTracking, type PublicLandingTrackingSupabase } from './public-landing-tracking'

function createFakeSupabase(seed: Record<string, Record<string, unknown>[]>) {
  const tables = seed

  return {
    from(tableName: string) {
      let rows = [...(tables[tableName] ?? [])]
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          rows = rows.filter((row) => row[field] === value)
          return builder
        },
        order: () => builder,
        limit: (count: number) => {
          rows = rows.slice(0, count)
          return builder
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      }
      return builder
    },
  } as unknown as PublicLandingTrackingSupabase
}

describe('resolvePublicLandingTracking', () => {
  it('keeps a valid tracked prospect id', async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1' }],
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'user-1',
          contact_email: 'buyer@test.local',
          outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
        },
      ],
    })

    await expect(
      resolvePublicLandingTracking({
        supabase,
        ventureId: 'venture-1',
        prospectId: 'prospect-1',
        email: 'buyer@test.local',
        outreachAngle: null,
      })
    ).resolves.toEqual({
      prospectId: 'prospect-1',
      email: 'buyer@test.local',
      outreachAngle: 'diagnostic-call-outbound-v6-direct-value',
    })
  })

  it('falls back to the latest prospect matched by email when tracked id is invalid', async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1' }],
      prospects: [
        {
          id: 'prospect-real',
          user_id: 'user-1',
          contact_email: 'buyer@test.local',
          outreach_angle: 'diagnostic-call-outbound-v7-permission-ask',
          created_at: '2026-06-09T12:00:00.000Z',
        },
      ],
    })

    await expect(
      resolvePublicLandingTracking({
        supabase,
        ventureId: 'venture-1',
        prospectId: 'prospect-missing',
        email: 'buyer@test.local',
        outreachAngle: '',
      })
    ).resolves.toEqual({
      prospectId: 'prospect-real',
      email: 'buyer@test.local',
      outreachAngle: 'diagnostic-call-outbound-v7-permission-ask',
    })
  })
})
