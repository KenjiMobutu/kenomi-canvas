import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Dashboard admin (cookie maison, pas Supabase) ─────────────────────────
  if (pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard/login') return NextResponse.next()
    const token = request.cookies.get('kenomi-dash-auth')?.value ?? ''
    const { verifyDashToken } = await import('@/lib/dashboard-token')
    if (!await verifyDashToken(token))
      return NextResponse.redirect(new URL('/dashboard/login', request.url))
    return NextResponse.next()
  }

  // ── Lecture session Supabase depuis les cookies ────────────────────────────
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const loggedIn = !!user

  // ── Whitelist : seul l'email autorisé peut accéder au studio ──────────────
  const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL
  if (loggedIn && ALLOWED_EMAIL && user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
  }

  // ── /signup → désactivé, rediriger vers /login ────────────────────────────
  if (pathname === '/signup') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── / → cockpit si connecté, sinon login ──────────────────────────────────
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(loggedIn ? '/studio' : '/login', request.url)
    )
  }

  // ── /login → déjà connecté → cockpit ──────────────────────────────────────
  if (pathname === '/login') {
    if (loggedIn)
      return NextResponse.redirect(new URL('/studio', request.url))
    return response
  }

  // ── /studio/* → non connecté → login ──────────────────────────────────────
  if (pathname.startsWith('/studio')) {
    if (!loggedIn)
      return NextResponse.redirect(new URL('/login', request.url))
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/studio/:path*',
  ],
}

