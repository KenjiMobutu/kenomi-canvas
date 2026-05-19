import { describe, expect, it } from 'vitest'
import { getAgentCommandRefreshPlan } from './agent-command-refresh'

describe('getAgentCommandRefreshPlan', () => {
  it('keeps initial page load read-only', () => {
    expect(getAgentCommandRefreshPlan('initial-load')).toEqual({
      loadAutonomyState: true,
      runOrchestration: false,
    })
  })

  it('allows explicit schedule evaluation to run orchestration', () => {
    expect(getAgentCommandRefreshPlan('manual-evaluate')).toEqual({
      loadAutonomyState: true,
      runOrchestration: true,
    })
  })
})
