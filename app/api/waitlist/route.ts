import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    let slug: string, email: string

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      slug  = (form.get('slug')  as string) ?? ''
      email = (form.get('email') as string) ?? ''
    } else {
      const body = await req.json()
      slug  = body.slug  ?? ''
      email = body.email ?? ''
    }

    if (!slug || !email) {
      return NextResponse.json({ error: 'slug et email requis' }, { status: 400 })
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Format email invalide' }, { status: 400 })
    }

    const venture = await db.venture.findFirst({ where: { slug }, select: { id: true } })

    await db.waitlist.upsert({
      where: { slug_email: { slug, email } },
      create: { slug, email, venture_id: venture?.id ?? null },
      update: {},
    })

    const BASE = (process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu').replace(/\/$/, '')
    return NextResponse.redirect(`${BASE}/${encodeURIComponent(slug)}?waitlist=ok`, { status: 302 })
  } catch (err) {
    console.error('[waitlist]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
