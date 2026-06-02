import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockedCookies,
  mockedRequireAllowedUser,
  mockedProcessDueProspectFollowUps,
  mockedBuildProspectViews,
  mockedSummarizeProspects,
} = vi.hoisted(() => ({
  mockedCookies: vi.fn(),
  mockedRequireAllowedUser: vi.fn(),
  mockedProcessDueProspectFollowUps: vi.fn(),
  mockedBuildProspectViews: vi.fn(),
  mockedSummarizeProspects: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockedCookies,
}))

vi.mock('@/lib/auth-server', () => ({
  requireAllowedUser: mockedRequireAllowedUser,
}))

vi.mock('@/lib/prospect/scheduled-follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/prospect/scheduled-follow-ups')>(
    '@/lib/prospect/scheduled-follow-ups'
  )
  return {
    ...actual,
    processDueProspectFollowUps: mockedProcessDueProspectFollowUps,
  }
})

vi.mock('@/lib/prospect/api-view', () => ({
  buildProspectViews: mockedBuildProspectViews,
  summarizeProspects: mockedSummarizeProspects,
}))

import { GET as GET_PROSPECTS } from '@/app/api/studio/prospects/route'
import { POST as POST_PROSPECTS_REFRESH } from '@/app/api/studio/prospects/refresh/route'

function makeSupabase() {
  const tables: Record<string, unknown> = {
    prospects: [],
    user_settings: null,
    autonomy_actions: [],
    human_approvals: [],
    prospect_activities: [],
  }

  function makeBuilder(table: string) {
    return {
      select: () => makeBuilder(table),
      eq: () => makeBuilder(table),
      order: () => makeBuilder(table),
      limit: () => makeBuilder(table),
      insert: () => makeBuilder(table),
      update: () => makeBuilder(table),
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      single: async () => ({ data: tables[table] ?? null, error: null }),
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: tables[table] ?? [], error: null })),
    }
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio prospects read/write split', () => {
  beforeEach(() => {
    mockedCookies.mockReset()
    mockedRequireAllowedUser.mockReset()
    mockedProcessDueProspectFollowUps.mockReset()
    mockedBuildProspectViews.mockReset()
    mockedSummarizeProspects.mockReset()

    mockedCookies.mockResolvedValue({
      getAll: () => [],
    })

    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })

    mockedBuildProspectViews.mockReturnValue([
      {
        id: 'prospect-1',
        company_name: 'Read Only Co',
        band: 'warm',
        source: 'linkedin',
        tags: [],
        pipeline_status: 'new',
        approval_status: 'none',
        message_family: 'linkedin_initial',
        message_key: 'linkedin_initial_default',
      },
    ])
    mockedSummarizeProspects.mockReturnValue({
      hot: 0,
      warm: 1,
      cold: 0,
      readyToContact: 1,
      dueFollowups: 0,
      awaitingApproval: 0,
      approvedToSend: 0,
      draftCreated: 0,
      sent: 0,
      replied: 0,
      won: 0,
      lost: 0,
      followUpDue: 0,
    })
    mockedProcessDueProspectFollowUps.mockResolvedValue(0)
  })

  it('GET /api/studio/prospects stays read-only and does not trigger follow-up processing', async () => {
    const response = await GET_PROSPECTS(
      new Request('http://localhost/api/studio/prospects') as never
    )

    expect(response.status).toBe(200)
    expect(mockedProcessDueProspectFollowUps).not.toHaveBeenCalled()
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.prospects).toHaveLength(1)
  })

  it('POST /api/studio/prospects/refresh triggers follow-up processing explicitly', async () => {
    mockedProcessDueProspectFollowUps.mockResolvedValue(3)

    const response = await POST_PROSPECTS_REFRESH()

    expect(response.status).toBe(200)
    expect(mockedProcessDueProspectFollowUps).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({
      ok: true,
      processed: 3,
    })
  })
})
