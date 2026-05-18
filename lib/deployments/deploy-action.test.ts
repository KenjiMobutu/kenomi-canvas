import { describe, expect, it } from 'vitest'
import { requiresApproval } from '@/lib/autonomy/policy'
import {
  buildDeployAutonomyAction,
  parseDeployRequest,
} from './deploy-action'

describe('deploy action', () => {
  it('requires approval in production', () => {
    expect(
      requiresApproval(
        buildDeployAutonomyAction({
          environment: 'production',
        })
      )
    ).toBe(true)
  })

  it('allows non-production deployment without approval', () => {
    expect(
      requiresApproval(
        buildDeployAutonomyAction({
          environment: 'staging',
        })
      )
    ).toBe(false)
  })

  it('validates deployment requests', () => {
    expect(
      parseDeployRequest({
        ventureId: 'venture-1',
        projectId: 'project-1',
        serviceId: 'service-1',
      })
    ).toEqual({
      ventureId: 'venture-1',
      projectId: 'project-1',
      serviceId: 'service-1',
    })

    expect(() => parseDeployRequest({ projectId: '' })).toThrow(
      'Invalid deploy request'
    )
  })
})
