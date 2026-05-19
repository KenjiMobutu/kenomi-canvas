import { describe, expect, it } from 'vitest'
import { resolveCronUserId } from './cron-user'

describe('resolveCronUserId', () => {
  it('utilise AGENT_ORCHESTRATOR_USER_ID quand il est fourni', async () => {
    await expect(
      resolveCronUserId({
        explicitUserId: 'user-explicit',
        allowedEmail: 'owner@example.com',
        listUsers: async () => [{ id: 'other', email: 'owner@example.com' }],
      })
    ).resolves.toBe('user-explicit')
  })

  it('résout le user id depuis ALLOWED_EMAIL sans exposer les users au client', async () => {
    await expect(
      resolveCronUserId({
        explicitUserId: '',
        allowedEmail: 'owner@example.com',
        listUsers: async () => [
          { id: 'user-1', email: 'other@example.com' },
          { id: 'user-2', email: 'owner@example.com' },
        ],
      })
    ).resolves.toBe('user-2')
  })

  it('échoue explicitement si aucun utilisateur orchestrateur ne peut être résolu', async () => {
    await expect(
      resolveCronUserId({
        explicitUserId: '',
        allowedEmail: '',
        listUsers: async () => [],
      })
    ).rejects.toThrow(/AGENT_ORCHESTRATOR_USER_ID ou ALLOWED_EMAIL requis/)
  })
})
