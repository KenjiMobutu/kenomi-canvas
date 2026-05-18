import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export interface Copywriting {
  hero: { headline: string; subtitle: string; cta: string }
  features: { icon: string; title: string; description: string }[]
  faq: { q: string; a: string }[]
  meta_title?: string
  meta_desc?: string
}

export interface LandingPageData {
  venture_id: string
  nom: string
  slug: string
  type_produit: string
  headline: string
  copywriting: Copywriting
}

interface VentureWithLandingPages {
  id: string
  nom: string
  slug: string
  type_produit: string
  landing_pages: { headline: string; copywriting: Copywriting }[] | null
}

export async function getLandingPage(slug: string): Promise<LandingPageData | null> {
  const { data, error } = await supabase
    .from('ventures')
    .select(`
      id,
      nom,
      slug,
      type_produit,
      landing_pages (
        headline,
        copywriting
      )
    `)
    .eq('slug', slug)
    .eq('statut', 'actif')
    .single()

  if (error || !data) return null
  const typedData = data as VentureWithLandingPages
  const lp = typedData.landing_pages?.[0]
  if (!lp) return null

  return {
    venture_id: typedData.id,
    nom: typedData.nom,
    slug: typedData.slug,
    type_produit: typedData.type_produit,
    headline: lp.headline,
    copywriting: lp.copywriting,
  }
}

export async function getAllActiveVentures() {
  const { data } = await supabase
    .from('ventures')
    .select('id, nom, slug, type_produit, created_at')
    .eq('statut', 'actif')
    .order('created_at', { ascending: false })
  return data ?? []
}
