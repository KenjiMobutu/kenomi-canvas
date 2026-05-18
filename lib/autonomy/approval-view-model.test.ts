import { describe, expect, it } from 'vitest'
import { buildApprovalQueue } from './approval-view-model'

describe('buildApprovalQueue', () => {
  it('associe approvals et actions puis remonte les pending', () => {
    const queue = buildApprovalQueue({
      approvals: [
        { id: 'approval-2', action_id: 'action-2', status: 'approved', reason: 'ok', created_at: '2026-05-18T09:00:00.000Z' },
        { id: 'approval-1', action_id: 'action-1', status: 'pending', reason: 'scale', created_at: '2026-05-18T10:00:00.000Z' },
      ],
      actions: [
        { id: 'action-1', action_type: 'scale_budget', risk_level: 'high', status: 'blocked', input: { confidence: 82 }, created_at: '2026-05-18T10:00:00.000Z' },
        { id: 'action-2', action_type: 'stop_venture', risk_level: 'high', status: 'completed', input: { confidence: 91 }, created_at: '2026-05-18T09:00:00.000Z' },
      ],
    })

    expect(queue.map(item => item.approval.id)).toEqual(['approval-1', 'approval-2'])
    expect(queue[0].action).toMatchObject({ id: 'action-1', action_type: 'scale_budget' })
    expect(queue[0].confidence).toBe(82)
    expect(queue[0].isPending).toBe(true)
    expect(queue[1].isPending).toBe(false)
  })
})
