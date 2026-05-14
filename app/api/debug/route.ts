import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TEST_SLUG = 'invoiceflow-generateur-de-factures-automatiqu-mp5npuak'

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Count simple
  try {
    results.count = await db.venture.count()
  } catch (e) { results.count_error = String(e) }

  // 2. findFirst sans include
  try {
    const v = await db.venture.findFirst({ where: { slug: TEST_SLUG } })
    results.venture_raw = v ? { id: v.id, nom: v.nom, statut: v.statut } : null
  } catch (e) { results.venture_raw_error = String(e) }

  // 3. findFirst avec include landing_pages
  try {
    const v = await db.venture.findFirst({
      where: { slug: TEST_SLUG, statut: 'actif' },
      include: { landing_pages: { take: 1 } },
    })
    results.venture_with_lp = v
      ? { id: v.id, nom: v.nom, lp_count: v.landing_pages.length, lp_headline: v.landing_pages[0]?.headline }
      : null
  } catch (e) { results.venture_with_lp_error = String(e) }

  // 4. Landing pages directes
  try {
    const lps = await db.landingPage.findMany({ where: { venture: { slug: TEST_SLUG } } })
    results.landing_pages_direct = lps.length
  } catch (e) { results.landing_pages_direct_error = String(e) }

  return NextResponse.json(results)
}
