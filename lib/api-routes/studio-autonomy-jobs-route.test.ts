import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedCookies, mockedRequireAllowedUser, mockedResolveHumanApproval } = vi.hoisted(() => ({
  mockedCookies: vi.fn(),
  mockedRequireAllowedUser: vi.fn(),
  mockedResolveHumanApproval: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockedCookies,
}))

vi.mock('@/lib/auth-server', () => ({
  requireAllowedUser: mockedRequireAllowedUser,
}))

vi.mock('@/lib/autonomy/approval-executor', async () => {
  const actual = await vi.importActual<typeof import('@/lib/autonomy/approval-executor')>(
    '@/lib/autonomy/approval-executor'
  )
  return {
    ...actual,
    resolveHumanApproval: mockedResolveHumanApproval,
  }
})

import { PATCH } from '@/app/api/studio/autonomy/jobs/route'
import { ApprovalExecutionError } from '@/lib/autonomy/approval-executor'

describe('studio autonomy jobs route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: {},
      response: null,
    })
    mockedResolveHumanApproval.mockReset()
  })

  it('resolves a single approval', async () => {
    mockedResolveHumanApproval.mockResolvedValue({
      approvalId: 'approval-1',
      actionId: 'action-1',
      status: 'approved',
      executed: true,
    })

    const response = await PATCH(
      new Request('http://localhost/api/studio/autonomy/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId: 'approval-1', decision: 'approved' }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        approvalId: 'approval-1',
        status: 'approved',
      },
    })
    expect(mockedResolveHumanApproval).toHaveBeenCalledTimes(1)
    expect(mockedResolveHumanApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        approvalId: 'approval-1',
        decision: 'approved',
      })
    )
  })

  it('resolves a batch of approvals and reports partial failures', async () => {
    mockedResolveHumanApproval
      .mockResolvedValueOnce({
        approvalId: 'approval-1',
        actionId: 'action-1',
        status: 'approved',
        executed: true,
      })
      .mockRejectedValueOnce(new ApprovalExecutionError('SMTP down', 409))
      .mockResolvedValueOnce({
        approvalId: 'approval-3',
        actionId: 'action-3',
        status: 'approved',
        executed: true,
      })

    const response = await PATCH(
      new Request('http://localhost/api/studio/autonomy/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          approvalIds: ['approval-1', 'approval-2', 'approval-3'],
          decision: 'approved',
        }),
      })
    )

    expect(response.status).toBe(207)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      processed: 3,
      succeeded: 2,
      failed: 1,
      results: [
        expect.objectContaining({ ok: true, approvalId: 'approval-1' }),
        expect.objectContaining({
          ok: false,
          approvalId: 'approval-2',
          error: 'SMTP down',
          status: 409,
        }),
        expect.objectContaining({ ok: true, approvalId: 'approval-3' }),
      ],
    })
    expect(mockedResolveHumanApproval).toHaveBeenCalledTimes(3)
  })
})
