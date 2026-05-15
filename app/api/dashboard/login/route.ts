import { NextResponse } from 'next/server'
import { createDashToken } from '@/lib/dashboard-token'

export async function POST(req: Request) {
  let password: string
  try {
    const body = await req.json()
    password = body.password ?? ''
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })
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
