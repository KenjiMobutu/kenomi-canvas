import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.formData().catch(() => null)
    let slug: string, email: string

    if (body) {
      slug  = body.get('slug')  as string
      email = body.get('email') as string
    } else {
      const json = await req.json()
      slug  = json.slug
      email = json.email
    }

    if (!slug || !email) {
      return new Response(
        JSON.stringify({ error: 'slug et email requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Trouver la venture par slug
    const { data: ventures } = await supabase
      .from('ventures')
      .select('id')
      .eq('slug', slug)
      .limit(1)

    const venture_id = ventures?.[0]?.id ?? null

    // Insérer dans waitlist (UPSERT silencieux si email déjà inscrit)
    const { error } = await supabase
      .from('waitlist')
      .upsert({ venture_id, slug, email }, { onConflict: 'slug,email', ignoreDuplicates: true })

    if (error) throw error

    // Redirection vers la landing page avec message de confirmation
    const redirectUrl = `https://lab.kenomi.eu/${slug}?waitlist=ok`
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl },
    })
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
