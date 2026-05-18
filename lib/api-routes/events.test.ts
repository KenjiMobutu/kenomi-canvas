import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {},
}))

vi.mock('@/lib/venture-events', async () => {
  const actual = await vi.importActual<typeof import('@/lib/venture-events')>(
    '@/lib/venture-events'
  )
  return {
    ...actual,
    recordVentureEventBySlug: vi.fn(),
  }
})

import { POST } from '@/app/api/events/route'
import { recordVentureEventBySlug } from '@/lib/venture-events'

const mockedRecord = vi.mocked(recordVentureEventBySlug)

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': headers['x-forwarded-for'] ?? `127.0.0.${Math.floor(Math.random() * 254) + 1}`,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/events', () => {
  beforeEach(() => {
    mockedRecord.mockReset()
    mockedRecord.mockResolvedValue({ ok: true, ventureId: 'v-1' })
  })

  it('400 si JSON invalide', async () => {
    const res = await POST(makeRequest('{not-json') as never)
    expect(res.status).toBe(400)
  })

  it('400 si slug manquant', async () => {
    const res = await POST(makeRequest({ event_type: 'page_view' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 si slug invalide (caractères interdits)', async () => {
    const res = await POST(
      makeRequest({ slug: '../../etc/passwd', event_type: 'page_view' }) as never
    )
    expect(res.status).toBe(400)
  })

  it('400 si event_type manquant', async () => {
    const res = await POST(makeRequest({ slug: 'my-venture' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 si event_type non whitelisté', async () => {
    const res = await POST(
      makeRequest({ slug: 'my-venture', event_type: 'sql_injection' }) as never
    )
    expect(res.status).toBe(400)
  })

  it('200 si payload valide et venture existe', async () => {
    const res = await POST(
      makeRequest({ slug: 'my-venture', event_type: 'page_view' }) as never
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockedRecord).toHaveBeenCalledOnce()
  })

  it('404 si venture introuvable', async () => {
    mockedRecord.mockResolvedValue({ ok: false, error: 'venture_not_found' })
    const res = await POST(
      makeRequest({ slug: 'absent-venture', event_type: 'page_view' }) as never
    )
    expect(res.status).toBe(404)
  })

  it('429 après dépassement du rate-limit (60 req/min par IP)', async () => {
    const ip = '192.0.2.99'
    for (let i = 0; i < 60; i++) {
      await POST(
        makeRequest(
          { slug: 'my-venture', event_type: 'page_view' },
          { 'x-forwarded-for': ip }
        ) as never
      )
    }
    const res = await POST(
      makeRequest(
        { slug: 'my-venture', event_type: 'page_view' },
        { 'x-forwarded-for': ip }
      ) as never
    )
    expect(res.status).toBe(429)
  })

  it('413 si payload > 10 KB', async () => {
    const big = { slug: 'my-venture', event_type: 'page_view', metadata: { huge: 'x'.repeat(15000) } }
    const body = JSON.stringify(big)
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
        'x-forwarded-for': '203.0.113.1',
      },
      body,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(413)
  })
})
