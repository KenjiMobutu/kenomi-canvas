import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDashToken, verifyDashToken } from './dashboard-token'

describe('dashboard-token', () => {
  const SECRET = 'test-secret-32-chars-minimum-ok!'

  beforeEach(() => {
    process.env.DASHBOARD_TOKEN_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.DASHBOARD_TOKEN_SECRET
  })

  it('createDashToken retourne une chaîne hex de 64 caractères', async () => {
    const token = await createDashToken()
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
  })

  it('verifyDashToken accepte un token fraîchement créé', async () => {
    const token = await createDashToken()
    expect(await verifyDashToken(token)).toBe(true)
  })

  it('verifyDashToken rejette un token vide', async () => {
    expect(await verifyDashToken('')).toBe(false)
  })

  it('verifyDashToken rejette un token de mauvaise longueur', async () => {
    expect(await verifyDashToken('abc123')).toBe(false)
  })

  it('verifyDashToken rejette un token forgé', async () => {
    const fake = 'a'.repeat(64)
    expect(await verifyDashToken(fake)).toBe(false)
  })

  it('verifyDashToken rejette un token généré avec un autre secret', async () => {
    const token = await createDashToken()
    process.env.DASHBOARD_TOKEN_SECRET = 'different-secret-32-chars-ok!!!!'
    expect(await verifyDashToken(token)).toBe(false)
  })

  it('getSecret lance une erreur si DASHBOARD_TOKEN_SECRET est absent', async () => {
    delete process.env.DASHBOARD_TOKEN_SECRET
    await expect(createDashToken()).rejects.toThrow('DASHBOARD_TOKEN_SECRET est requis')
  })

  it('deux appels successifs retournent le même token (même jour)', async () => {
    const t1 = await createDashToken()
    const t2 = await createDashToken()
    expect(t1).toBe(t2)
  })
})
