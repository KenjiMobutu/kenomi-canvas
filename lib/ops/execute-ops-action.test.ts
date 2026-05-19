import { describe, expect, it, vi } from 'vitest'
import { executeOpsAction } from './execute-ops-action'

describe('executeOpsAction', () => {
  it('returns a repairable empty result when no automation workflow exists', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        })),
      })),
    }

    await expect(
      executeOpsAction({
        type: 'trigger_first_automation',
        userId: 'user-1',
        supabase: supabase as never,
      })
    ).resolves.toMatchObject({
      ok: false,
      code: 'missing_workflow',
      repairHref: '/studio/automations',
    })
  })
})
