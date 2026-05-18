import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const REDIRECT_BASE = 'https://lab.kenomi.eu'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lab.kenomi.eu',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.formData().catch(() => null)
    let slug: string, email: string

    if (body) {
      slug = (body.get('slug') as string) ?? ''
      email = (body.get('email') as string) ?? ''
    } else {
      const json = await req.json()
      slug = json.slug ?? ''
      email = json.email ?? ''
    }

    if (!slug || !email) {
      return new Response(JSON.stringify({ error: 'slug et email requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: 'Format email invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: ventures } = await supabase
      .from('ventures')
      .select('id')
      .eq('slug', slug)
      .limit(1)

    const venture_id = ventures?.[0]?.id ?? null
    if (!venture_id) {
      return new Response(JSON.stringify({ error: 'Venture introuvable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error } = await supabase
      .from('waitlist')
      .upsert({ venture_id, slug, email }, { onConflict: 'slug,email', ignoreDuplicates: true })

    if (error) throw error

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${REDIRECT_BASE}/${slug}?waitlist=ok` },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
