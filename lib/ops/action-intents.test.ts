import { describe, expect, it } from 'vitest'
import { buildOpsActionIntent } from './action-intents'

describe('ops action intents', () => {
  it('maps missing automation runs to a safe workflow trigger intent', () => {
    expect(buildOpsActionIntent('trigger-first-automation')).toEqual({
      id: 'trigger-first-automation',
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'trigger_first_automation' },
      requiresConfirmation: true,
      risk: 'low',
    })
  })

  it('keeps approval review as navigation, not blind execution', () => {
    expect(buildOpsActionIntent('review-approvals')).toEqual({
      id: 'review-approvals',
      method: 'GET',
      endpoint: '/studio/agents',
      payload: null,
      requiresConfirmation: false,
      risk: 'medium',
    })
  })
})
