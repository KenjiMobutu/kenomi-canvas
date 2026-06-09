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
        then: (
          resolve?: ((value: { data: Record<string, unknown>[]; error: null }) => unknown) | null,
          reject?: ((reason: unknown) => unknown) | null
        ) =>
          Promise.resolve({ data: rows, error: null }).then(resolve ?? undefined, reject ?? undefined),
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

  it('recovers a rot13-obfuscated tracked email and outreach angle', async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1' }],
      prospects: [
        {
          id: 'prospect-hot',
          user_id: 'user-1',
          contact_email: 'jwerpehowski@mangos.agency',
          outreach_angle: 'diagnostic-call-outbound-v7-hot-personal',
          created_at: '2026-06-09T13:16:00.000Z',
        },
      ],
    })

    await expect(
      resolvePublicLandingTracking({
        supabase,
        ventureId: 'venture-1',
        prospectId: 'c108a1ba-31a6-7aa0-2b68-ed68b86ea0a7',
        email: 'wjfecfubjfxv@mangos.agency',
        outreachAngle: 'qvntabfgvp-pnyy-bhgobhaq-i7-ubg-crefbany',
      })
    ).resolves.toEqual({
      prospectId: 'prospect-hot',
      email: 'jwerpehowski@mangos.agency',
      outreachAngle: 'diagnostic-call-outbound-v7-hot-personal',
    })
  })
})
