import { describe, expect, it } from 'vitest'
import { mapTelegramActionToOperatorExecution } from './telegram-actions'

describe('telegram actions', () => {
  it('maps run_prospect to existing run_agent prospect execution', () => {
    expect(mapTelegramActionToOperatorExecution('run_prospect')).toMatchObject({
      actionType: 'run_agent',
      payload: { agentId: 'prospect' },
    })
  })

  it('maps scan_followups to follow_up_scan execution', () => {
    expect(mapTelegramActionToOperatorExecution('scan_followups')).toMatchObject({
      actionType: 'follow_up_scan',
      payload: {},
    })
  })
})
