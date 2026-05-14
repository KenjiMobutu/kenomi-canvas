import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const count = await db.venture.count()
    const ventures = await db.venture.findMany({
      select: { id: true, nom: true, slug: true, statut: true },
      take: 5,
    })
    return NextResponse.json({ ok: true, count, ventures })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), message: (err as Error).message },
      { status: 500 }
    )
  }
}
