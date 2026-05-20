import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
import { isValidEmail, isValidSlug } from '@/lib/validation'
import { logError } from '@/lib/logger'
import { notifyNurtureSignup } from '@/lib/nurture/n8n'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordVentureEventBySlugSafely, type VentureEventSupabase } from '@/lib/venture-events'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`waitlist:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    return apiError('Trop de requêtes. Réessayez dans une heure.', 429)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 10_000) return apiError('Payload trop grand', 413)

  try {
    let slug: string, email: string

    const contentType = req.headers.get('content-type') ?? ''

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await req.formData()
      slug = (form.get('slug') as string) ?? ''
      email = (form.get('email') as string) ?? ''
    } else {
      const body = await req.json()
      slug = body.slug ?? ''
      email = body.email ?? ''
    }

    if (!slug || !email) {
      return apiError('slug et email requis', 400)
    }

    if (!isValidSlug(slug)) return apiError('slug invalide', 400)

    if (!isValidEmail(email)) {
      return apiError('Format email invalide', 400)
    }

    const venture = await db.venture.findFirst({ where: { slug }, select: { id: true } })

    await db.waitlist.upsert({
      where: { slug_email: { slug, email } },
      create: { slug, email, venture_id: venture?.id ?? null },
      update: {},
    })

    await recordVentureEventBySlugSafely(supabaseAdmin as unknown as VentureEventSupabase, {
      slug,
      eventType: 'waitlist_signup',
      source: 'waitlist',
      metadata: {
        email_domain: email.split('@')[1] ?? '',
      },
    })

    await notifyNurtureSignup({
      payload: {
        slug,
        ventureId: venture?.id ?? null,
        email,
        source: 'waitlist',
      },
    }).catch(() => undefined)

    const rawOrigin = process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'
    let BASE: string
    try {
      const u = new URL(rawOrigin)
      if (!['https:', 'http:'].includes(u.protocol)) throw new Error('protocol invalide')
      BASE = u.origin
    } catch {
      BASE = 'https://lab.kenomi.eu'
    }
    return NextResponse.redirect(`${BASE}/${encodeURIComponent(slug)}?waitlist=ok`, { status: 302 })
  } catch (err) {
    logError('waitlist', err)
    return apiError('Erreur serveur', 500)
  }
}
