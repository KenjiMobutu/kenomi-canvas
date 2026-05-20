import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidEmail, isValidSlug } from '@/lib/validation'
import { createStripeClientFromSecretKey, getOptionalStripeSecretKey } from '@/lib/stripe/server'
import {
  createPublicCheckoutSession,
  type PublicCheckoutSupabase,
} from '@/lib/stripe/public-checkout'

const checkoutSchema = z.object({
  slug: z.string().min(1),
  email: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
  formRequest: z.boolean().optional(),
})

async function parseRequest(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await req.formData()
    return {
      slug: String(form.get('slug') ?? ''),
      email: form.get('email') ? String(form.get('email')) : null,
      utm_source: form.get('utm_source') ? String(form.get('utm_source')) : null,
      utm_medium: form.get('utm_medium') ? String(form.get('utm_medium')) : null,
      utm_campaign: form.get('utm_campaign') ? String(form.get('utm_campaign')) : null,
      utm_content: form.get('utm_content') ? String(form.get('utm_content')) : null,
      formRequest: true,
    }
  }

  const body = await req.json().catch(() => ({}))
  return { ...body, formRequest: false }
}

function appOrigin(req: NextRequest) {
  const raw = process.env.APP_ORIGIN ?? req.nextUrl.origin
  try {
    return new URL(raw).origin
  } catch {
    return req.nextUrl.origin
  }
}

export async function POST(req: NextRequest) {
  const parsed = checkoutSchema.safeParse(await parseRequest(req))
  if (!parsed.success) return apiError('Payload checkout public invalide', 400)

  const slug = parsed.data.slug.trim().toLowerCase()
  const email = parsed.data.email?.trim() || null
  const isFormRequest = Boolean(parsed.data.formRequest)
  const attribution = {
    utm_source: parsed.data.utm_source?.trim() || null,
    utm_medium: parsed.data.utm_medium?.trim() || null,
    utm_campaign: parsed.data.utm_campaign?.trim() || null,
    utm_content: parsed.data.utm_content?.trim() || null,
  }

  if (!isValidSlug(slug)) return apiError('slug invalide', 400)
  if (email && !isValidEmail(email)) return apiError('Format email invalide', 400)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`public-checkout:${slug}:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return apiError('Trop de créations checkout. Réessayez dans une minute.', 429)
  }

  try {
    const result = await createPublicCheckoutSession({
      supabase: supabaseAdmin as unknown as PublicCheckoutSupabase,
      stripeClientFactory: createStripeClientFromSecretKey,
      slug,
      origin: appOrigin(req),
      envStripeSecretKey: getOptionalStripeSecretKey(),
      customerEmail: email,
      attribution,
    })

    if (isFormRequest) {
      return NextResponse.redirect(result.checkoutUrl, { status: 303 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Création checkout public échouée'
    if (isFormRequest) {
      return NextResponse.redirect(`${appOrigin(req)}/${encodeURIComponent(slug)}?checkout=error`, {
        status: 303,
      })
    }
    return apiError(message, message === 'payment_configuration_missing' ? 404 : 500)
  }
}
