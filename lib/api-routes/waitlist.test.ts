import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    venture: { findFirst: vi.fn() },
    waitlist: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {},
}))

vi.mock('@/lib/venture-events', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/venture-events')>('@/lib/venture-events')
  return {
    ...actual,
    recordVentureEventBySlugSafely: vi.fn().mockResolvedValue(undefined),
  }
})

import { POST } from '@/app/api/waitlist/route'
import { db } from '@/lib/db'

const mockedFindFirst = vi.mocked(db.venture.findFirst)
const mockedUpsert = vi.mocked(db.waitlist.upsert)

function makeJsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for':
        headers['x-forwarded-for'] ?? `198.51.100.${Math.floor(Math.random() * 254) + 1}`,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    mockedFindFirst.mockReset()
    mockedUpsert.mockReset()
    mockedFindFirst.mockResolvedValue({ id: 'v-1' } as never)
    mockedUpsert.mockResolvedValue({} as never)
  })

  it('400 si email manquant', async () => {
    const res = await POST(makeJsonRequest({ slug: 'my-venture' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 si slug manquant', async () => {
    const res = await POST(makeJsonRequest({ email: 'a@b.com' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 si email invalide', async () => {
    const res = await POST(makeJsonRequest({ slug: 'my-venture', email: 'pas-un-email' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 si slug invalide', async () => {
    const res = await POST(makeJsonRequest({ slug: '../etc/passwd', email: 'a@b.com' }) as never)
    expect(res.status).toBe(400)
  })

  it('302 redirect si payload valide', async () => {
    const res = await POST(
      makeJsonRequest({ slug: 'my-venture', email: 'jean@kenomi.eu' }) as never
    )
    expect(res.status).toBe(302)
    expect(mockedUpsert).toHaveBeenCalledOnce()
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/my-venture')
    expect(location).toContain('waitlist=ok')
  })

  it('302 même si venture inconnu (waitlist accepté quand même)', async () => {
    mockedFindFirst.mockResolvedValue(null)
    const res = await POST(
      makeJsonRequest({ slug: 'unknown-venture', email: 'jean@kenomi.eu' }) as never
    )
    expect(res.status).toBe(302)
    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ venture_id: null }),
      })
    )
  })

  it('429 après 3 requêtes par heure par IP', async () => {
    const ip = '192.0.2.42'
    for (let i = 0; i < 3; i++) {
      await POST(
        makeJsonRequest(
          { slug: 'my-venture', email: 'jean@kenomi.eu' },
          { 'x-forwarded-for': ip }
        ) as never
      )
    }
    const res = await POST(
      makeJsonRequest(
        { slug: 'my-venture', email: 'jean@kenomi.eu' },
        { 'x-forwarded-for': ip }
      ) as never
    )
    expect(res.status).toBe(429)
  })

  it('413 si payload > 10 KB', async () => {
    const body = JSON.stringify({
      slug: 'my-venture',
      email: 'jean@kenomi.eu',
      pad: 'x'.repeat(15000),
    })
    const req = new Request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
        'x-forwarded-for': '203.0.113.10',
      },
      body,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(413)
  })
})
