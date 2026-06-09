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

vi.mock('@/lib/nurture/n8n', () => ({
  notifyNurtureSignup: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/prospect/hand-raise', () => ({
  recordProspectHandRaise: vi.fn().mockResolvedValue({ updated: true }),
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
import { notifyNurtureSignup } from '@/lib/nurture/n8n'
import { recordProspectHandRaise } from '@/lib/prospect/hand-raise'

const mockedFindFirst = vi.mocked(db.venture.findFirst)
const mockedUpsert = vi.mocked(db.waitlist.upsert)
const mockedNotifyNurtureSignup = vi.mocked(notifyNurtureSignup)
const mockedRecordProspectHandRaise = vi.mocked(recordProspectHandRaise)

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
    mockedNotifyNurtureSignup.mockReset()
    mockedRecordProspectHandRaise.mockReset()
    mockedFindFirst.mockResolvedValue({ id: 'v-1' } as never)
    mockedUpsert.mockResolvedValue({} as never)
    mockedNotifyNurtureSignup.mockResolvedValue({ ok: true })
    mockedRecordProspectHandRaise.mockResolvedValue({ updated: true } as never)
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
      makeJsonRequest({
        slug: 'my-venture',
        email: 'jean@kenomi.eu',
        utm_source: 'linkedin',
        utm_campaign: 'launch',
      }) as never
    )
    expect(res.status).toBe(302)
    expect(mockedUpsert).toHaveBeenCalledOnce()
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/my-venture')
    expect(location).toContain('waitlist=ok')
    expect(mockedNotifyNurtureSignup).toHaveBeenCalledWith({
      payload: {
        eventType: 'waitlist_signup',
        slug: 'my-venture',
        ventureId: 'v-1',
        email: 'jean@kenomi.eu',
        prospect_id: '',
        outreach_angle: '',
        source: 'waitlist',
        utm_source: 'linkedin',
        utm_medium: '',
        utm_campaign: 'launch',
        utm_content: '',
      },
    })
    expect(mockedRecordProspectHandRaise).not.toHaveBeenCalled()
  })

  it('records a tracked hand raise for a known prospect', async () => {
    const res = await POST(
      makeJsonRequest({
        slug: 'my-venture',
        email: 'jwerpehowski@mangos.agency',
        prospect_id: 'prospect-hot',
        outreach_angle: 'diagnostic-call-outbound-v7-hot-personal',
        utm_source: 'outbound_followup',
        utm_medium: 'email',
        utm_campaign: 'diagnostic-call-outbound-v7-hot-personal',
      }) as never
    )

    expect(res.status).toBe(302)
    expect(mockedRecordProspectHandRaise).toHaveBeenCalledWith({
      supabase: {},
      prospectId: 'prospect-hot',
      email: 'jwerpehowski@mangos.agency',
      outreachAngle: 'diagnostic-call-outbound-v7-hot-personal',
    })
    expect(mockedNotifyNurtureSignup).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        prospect_id: 'prospect-hot',
        outreach_angle: 'diagnostic-call-outbound-v7-hot-personal',
      }),
    })
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
