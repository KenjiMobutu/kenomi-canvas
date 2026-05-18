import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockedRaw = vi.fn()
const mockedSelect = vi.fn()
const mockedStorageList = vi.fn()

vi.mock('@/lib/db', () => ({
  db: { $queryRaw: () => mockedRaw() },
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        limit: () => mockedSelect(),
      }),
    }),
    storage: {
      from: () => ({
        list: () => mockedStorageList(),
      }),
    },
  },
}))

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  beforeEach(() => {
    mockedRaw.mockReset()
    mockedSelect.mockReset()
    mockedStorageList.mockReset()
    // Préserve les env vars critiques pour passer le checkEnvVars
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://stub.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'stub'
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub'
    process.env.DATABASE_URL ??= 'postgres://stub'
    process.env.DASHBOARD_PASSWORD ??= 'stub'
    process.env.DASHBOARD_TOKEN_SECRET ??= 'stub-secret-at-least-32-characters-aaaaa'
    process.env.ALLOWED_EMAIL ??= 'me@kenomi.eu'
  })

  afterEach(() => {
    delete process.env.HEALTH_DATABASE_REQUIRED
    delete process.env.HEALTH_SUPABASE_REQUIRED
    delete process.env.HEALTH_STORAGE_REQUIRED
  })

  it('200 ok quand toutes les dépendances répondent', async () => {
    mockedRaw.mockResolvedValue([{ '?column?': 1 }])
    mockedSelect.mockResolvedValue({ error: null })
    mockedStorageList.mockResolvedValue({ error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('503 degraded quand database fail (par défaut required)', async () => {
    mockedRaw.mockRejectedValue(new Error('connection refused'))
    mockedSelect.mockResolvedValue({ error: null })
    mockedStorageList.mockResolvedValue({ error: null })

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.checks.database.ok).toBe(false)
  })

  it('200 ok si HEALTH_DATABASE_REQUIRED=false même avec database down', async () => {
    process.env.HEALTH_DATABASE_REQUIRED = 'false'
    mockedRaw.mockRejectedValue(new Error('connection refused'))
    mockedSelect.mockResolvedValue({ error: null })
    mockedStorageList.mockResolvedValue({ error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.checks.database.ok).toBe(false)
  })

  it('503 si supabase fail (required)', async () => {
    mockedRaw.mockResolvedValue([{ '?column?': 1 }])
    mockedSelect.mockResolvedValue({ error: { message: 'RLS denied' } })
    mockedStorageList.mockResolvedValue({ error: null })

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.checks.supabase.ok).toBe(false)
  })

  it('503 si storage fail (required)', async () => {
    mockedRaw.mockResolvedValue([{ '?column?': 1 }])
    mockedSelect.mockResolvedValue({ error: null })
    mockedStorageList.mockResolvedValue({ error: { message: 'bucket missing' } })

    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).checks.storage.ok).toBe(false)
  })

  it('payload contient checks + timestamp', async () => {
    mockedRaw.mockResolvedValue([{ '?column?': 1 }])
    mockedSelect.mockResolvedValue({ error: null })
    mockedStorageList.mockResolvedValue({ error: null })

    const body = await (await GET()).json()
    expect(body).toMatchObject({
      status: 'ok',
      checks: {
        env: expect.any(Object),
        database: expect.any(Object),
        supabase: expect.any(Object),
        storage: expect.any(Object),
      },
      timestamp: expect.any(String),
    })
  })
})
