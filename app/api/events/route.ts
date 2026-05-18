import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'
import { isValidSlug } from '@/lib/validation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  isVentureEventType,
  recordVentureEventBySlug,
  type VentureEventSupabase,
} from '@/lib/venture-events'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`venture-event:${ip}`, { limit: 60, windowMs: 60_000 })) {
    return apiError('Trop d’événements', 429)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 10_000) return apiError('Payload trop grand', 413)

  let body: {
    slug?: string
    event_type?: string
    source?: string
    value?: number
    metadata?: Record<string, unknown>
  }

  try {
    body = await req.json()
  } catch {
    return apiError('JSON invalide', 400)
  }

  const slug = body.slug ?? ''
  if (!isValidSlug(slug)) return apiError('slug invalide', 400)
  if (!body.event_type || !isVentureEventType(body.event_type)) {
    return apiError('event_type invalide', 400)
  }

  const result = await recordVentureEventBySlug(supabaseAdmin as unknown as VentureEventSupabase, {
    slug,
    eventType: body.event_type,
    source: body.source ?? 'public_api',
    value: typeof body.value === 'number' ? body.value : null,
    metadata: body.metadata ?? {},
  })

  if (!result.ok) {
    return apiError(
      result.error === 'venture_not_found' ? 'venture introuvable' : result.error,
      404
    )
  }

  return NextResponse.json({ ok: true })
}
