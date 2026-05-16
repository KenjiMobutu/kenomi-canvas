import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkEnvVars, REQUIRED_ENV_VARS } from './health-check'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = process.env as any

describe('checkEnvVars', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    for (const key of REQUIRED_ENV_VARS) {
      delete env[key]
    }
    delete env.NODE_ENV
  })

  afterEach(() => {
    // Restaurer l'env original
    for (const key of REQUIRED_ENV_VARS) {
      if (originalEnv[key] !== undefined) {
        env[key] = originalEnv[key]
      } else {
        delete env[key]
      }
    }
    if (originalEnv.NODE_ENV !== undefined) {
      env.NODE_ENV = originalEnv.NODE_ENV
    } else {
      delete env.NODE_ENV
    }
  })

  it('retourne ok:true si toutes les vars sont présentes', () => {
    for (const key of REQUIRED_ENV_VARS) {
      env[key] = 'test-value'
    }
    const result = checkEnvVars()
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('retourne ok:false si une var est manquante', () => {
    for (const key of REQUIRED_ENV_VARS) {
      env[key] = 'test-value'
    }
    delete env.DASHBOARD_TOKEN_SECRET
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
  })

  it('liste les vars manquantes en dev', () => {
    env.NODE_ENV = 'development'
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(result.error).toContain('DATABASE_URL')
  })

  it('masque les noms de vars en production', () => {
    env.NODE_ENV = 'production'
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('configuration incomplete')
    expect(result.error).not.toContain('SUPABASE')
  })

  it('accepte un env custom passé en paramètre', () => {
    const fakeEnv: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv
    for (const key of REQUIRED_ENV_VARS) {
      fakeEnv[key] = 'ok'
    }
    const result = checkEnvVars(fakeEnv)
    expect(result.ok).toBe(true)
  })

  it('retourne ok:false si une seule var manque dans env custom', () => {
    const fakeEnv: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv
    for (const key of REQUIRED_ENV_VARS) {
      fakeEnv[key] = 'ok'
    }
    delete fakeEnv['ALLOWED_EMAIL']
    const result = checkEnvVars(fakeEnv)
    expect(result.ok).toBe(false)
  })
})
