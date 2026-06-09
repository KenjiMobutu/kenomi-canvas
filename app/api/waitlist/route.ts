import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
import { isValidEmail, isValidSlug } from '@/lib/validation'
import { logError } from '@/lib/logger'
import { notifyNurtureSignup } from '@/lib/nurture/n8n'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordVentureEventBySlugSafely, type VentureEventSupabase } from '@/lib/venture-events'
import { recordProspectHandRaise } from '@/lib/prospect/hand-raise'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`waitlist:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    return apiError('Trop de requêtes. Réessayez dans une heure.', 429)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 10_000) return apiError('Payload trop grand', 413)

  try {
    let slug: string, email: string
    let prospect_id = ''
    let outreach_angle = ''
    let utm_source = ''
    let utm_medium = ''
    let utm_campaign = ''
    let utm_content = ''

    const contentType = req.headers.get('content-type') ?? ''

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await req.formData()
      slug = (form.get('slug') as string) ?? ''
      email = (form.get('email') as string) ?? ''
      prospect_id = String(form.get('prospect_id') ?? '')
      outreach_angle = String(form.get('outreach_angle') ?? '')
      utm_source = String(form.get('utm_source') ?? '')
      utm_medium = String(form.get('utm_medium') ?? '')
      utm_campaign = String(form.get('utm_campaign') ?? '')
      utm_content = String(form.get('utm_content') ?? '')
    } else {
      const body = await req.json()
      slug = body.slug ?? ''
      email = body.email ?? ''
      prospect_id = body.prospect_id ?? ''
      outreach_angle = body.outreach_angle ?? ''
      utm_source = body.utm_source ?? ''
      utm_medium = body.utm_medium ?? ''
      utm_campaign = body.utm_campaign ?? ''
      utm_content = body.utm_content ?? ''
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
        prospect_id,
        outreach_angle,
        email_domain: email.split('@')[1] ?? '',
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
      },
    })

    await recordVentureEventBySlugSafely(supabaseAdmin as unknown as VentureEventSupabase, {
      slug,
      eventType: 'high_intent_lead',
      source: 'waitlist',
      metadata: {
        prospect_id,
        outreach_angle,
        email_domain: email.split('@')[1] ?? '',
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
      },
    })

    await notifyNurtureSignup({
      payload: {
        eventType: 'waitlist_signup',
        slug,
        ventureId: venture?.id ?? null,
        email,
        prospect_id,
        outreach_angle,
        source: 'waitlist',
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
      },
    }).catch(() => undefined)

    if (prospect_id) {
      await recordProspectHandRaise({
        supabase: supabaseAdmin,
        prospectId: prospect_id,
        email,
        outreachAngle: outreach_angle || null,
      }).catch(() => undefined)
    }

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
