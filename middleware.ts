import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- Dashboard admin (cookie auth) ---
  if (pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard/login') return NextResponse.next()
    const auth = request.cookies.get('kenomi-dash-auth')?.value
    const pwd = process.env.DASHBOARD_PASSWORD
    if (!pwd || auth !== pwd) {
      return NextResponse.redirect(new URL('/dashboard/login', request.url))
    }
    return NextResponse.next()
  }

  // --- Studio (Supabase Auth géré côté client dans AppShell) ---
  // Le redirect auth se fait dans le composant AppShell (côté client)
  // Le middleware laisse passer pour éviter les boucles SSR
  return NextResponse.next()
}

export const config = { matcher: ['/dashboard/:path*', '/studio/:path*'] }
