import { describe, expect, it, vi } from 'vitest'
import { createCoolifyClient } from './client'

const baseEnv = {
  COOLIFY_URL: 'https://coolify.tailnet.local',
  COOLIFY_TOKEN: 'coolify-token',
} as unknown as NodeJS.ProcessEnv

describe('createCoolifyClient', () => {
  it('requires COOLIFY_URL', () => {
    expect(() =>
      createCoolifyClient({
        env: { COOLIFY_TOKEN: 'token' } as unknown as NodeJS.ProcessEnv,
      })
    ).toThrow('COOLIFY_URL missing')
  })

  it('requires COOLIFY_TOKEN', () => {
    expect(() =>
      createCoolifyClient({
        env: { COOLIFY_URL: 'https://coolify.tailnet.local' } as unknown as NodeJS.ProcessEnv,
      })
    ).toThrow('COOLIFY_TOKEN missing')
  })

  it('rejects untrusted private URLs', () => {
    expect(() =>
      createCoolifyClient({
        env: {
          COOLIFY_URL: 'http://192.168.0.19:8000',
          COOLIFY_TOKEN: 'token',
        } as unknown as NodeJS.ProcessEnv,
      })
    ).toThrow('COOLIFY_URL is not allowed')
  })

  it('triggers a deployment with an authorized private host', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ deploymentId: 'dep_123' })
    )

    const client = createCoolifyClient({
      env: {
        COOLIFY_URL: 'http://192.168.0.19:8000',
        COOLIFY_TOKEN: 'token',
        TRUSTED_PRIVATE_HOSTS: '192.168.0.19',
      } as unknown as NodeJS.ProcessEnv,
      fetchFn,
    })

    await expect(
      client.triggerDeploy({ projectId: 'project-1', serviceId: 'service-1' })
    ).resolves.toEqual({ deploymentId: 'dep_123' })

    expect(fetchFn).toHaveBeenCalledWith(
      'http://192.168.0.19:8000/api/v1/deployments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    )
  })

  it('throws on failed Coolify responses', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ message: 'nope' }, { status: 500 })
    )
    const client = createCoolifyClient({ env: baseEnv, fetchFn })

    await expect(
      client.getDeployment({ deploymentId: 'dep_123' })
    ).rejects.toThrow('Coolify request failed: 500')
  })
})
