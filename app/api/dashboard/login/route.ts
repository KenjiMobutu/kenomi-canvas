import { NextResponse, NextRequest } from 'next/server'
import { createDashToken } from '@/lib/dashboard-token'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`dashboard-login:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 })) {
    return apiError('Trop de tentatives. Réessayez dans 15 minutes.', 429)
  }

  let password: string
  try {
    const body = await req.json()
    password = body.password ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    return apiError('Mot de passe incorrect', 401)
  }

  const token = await createDashToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('kenomi-dash-auth', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24,
    path:     '/',
  })
  return res
}
