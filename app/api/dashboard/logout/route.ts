import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const url = new URL('/dashboard/login', req.url)
  const res = NextResponse.redirect(url)
  res.cookies.set('kenomi-dash-auth', '', { maxAge: 0, path: '/' })
  return res
}
