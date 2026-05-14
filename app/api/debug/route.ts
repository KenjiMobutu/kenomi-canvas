import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Requête dashboard exacte
  try {
    const ventures = await db.venture.findMany({
      orderBy: { created_at: 'asc' },
      include: {
        _count:    { select: { waitlist: true } },
        decisions: { orderBy: { created_at: 'desc' }, take: 1,
                     select: { decision: true, reason: true } },
      },
    })
    results.dashboard_ok    = true
    results.dashboard_count = ventures.length
  } catch (e) { results.dashboard_error = String(e) }

  // 2. _count waitlist seul
  try {
    await db.venture.findMany({ include: { _count: { select: { waitlist: true } } } })
    results.waitlist_count_ok = true
  } catch (e) { results.waitlist_count_error = String(e) }

  // 3. decisions seul
  try {
    await db.venture.findMany({
      include: { decisions: { orderBy: { created_at: 'desc' }, take: 1, select: { decision: true, reason: true } } },
    })
    results.decisions_ok = true
  } catch (e) { results.decisions_error = String(e) }

  // 4. landing_pages (fix précédent)
  try {
    await db.venture.findFirst({ include: { landing_pages: { take: 1 } } })
    results.landing_pages_ok = true
  } catch (e) { results.landing_pages_error = String(e) }

  return NextResponse.json(results)
}
