import { db } from './db'
import type { Copywriting } from './supabase'

export type { Copywriting }

export type VentureListItem = {
  id: string
  nom: string
  slug: string
  type_produit: string | null
  created_at: Date
}

export interface LandingPageData {
  venture_id: string
  nom: string
  slug: string
  type_produit: string | null
  headline: string
  copywriting: Copywriting
}

export async function getLandingPage(slug: string): Promise<LandingPageData | null> {
  const venture = await db.venture.findFirst({
    where: { slug, statut: 'actif' },
    include: { landing_pages: { take: 1 } },
  })

  if (!venture) return null
  const lp = venture.landing_pages[0]
  if (!lp) return null

  return {
    venture_id: venture.id,
    nom: venture.nom,
    slug: venture.slug,
    type_produit: venture.type_produit,
    headline: lp.headline ?? '',
    copywriting: lp.copywriting as unknown as Copywriting,
  }
}

export async function getAllActiveVentures() {
  return db.venture.findMany({
    where: { statut: 'actif' },
    select: { id: true, nom: true, slug: true, type_produit: true, created_at: true },
    orderBy: { created_at: 'desc' },
  })
}
