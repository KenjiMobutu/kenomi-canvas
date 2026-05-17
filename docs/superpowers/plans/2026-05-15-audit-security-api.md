# Audit Fix — Plan A : Sécurité & API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 7 vulnérabilités CRITIQUE/HAUT dans les routes API et le middleware (cookie auth, SSRF, open redirect, validation email, timeouts).

**Architecture:** Chaque fix est isolé dans son fichier. Un nouveau module `lib/dashboard-token.ts` centralise la logique de signing. Pas de nouvelle dépendance externe — on utilise le module `crypto` natif Node.js.

**Tech Stack:** Next.js 15 App Router, Node.js `crypto` (natif), Supabase SSR

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `lib/dashboard-token.ts` | **Créer** — HMAC signing pour le cookie admin |
| `app/api/dashboard/login/route.ts` | **Modifier** — stocker token HMAC au lieu du mot de passe brut |
| `middleware.ts` | **Modifier** — vérifier token HMAC au lieu de comparer le mot de passe |
| `app/api/studio/automations/trigger/route.ts` | **Modifier** — SSRF guard + timeout + resp.ok check + user_id filter |
| `app/api/studio/chat/route.ts` | **Modifier** — SSRF guard sur ollama_base_url + max message length |
| `app/api/waitlist/route.ts` | **Modifier** — open redirect fix + validation email |
| `supabase/functions/waitlist/index.ts` | **Modifier** — validation email + venture_id guard |
| `lib/gamification.test.ts` | **Modifier** — tests unitaires pour isAllowedUrl et isValidEmail |

---

### Task 1 : Module HMAC pour le cookie admin dashboard

**Files:**
- Create: `lib/dashboard-token.ts`
- Test: `lib/gamification.test.ts` (on l'élargit en `lib/utils.test.ts`)

- [ ] **Step 1 : Créer `lib/dashboard-token.ts`**

```typescript
// lib/dashboard-token.ts
import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  return process.env.DASHBOARD_TOKEN_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'dev-fallback'
}

export function createDashToken(): string {
  return createHmac('sha256', getSecret())
    .update(process.env.DASHBOARD_PASSWORD ?? '')
    .digest('hex')
}

export function verifyDashToken(token: string): boolean {
  if (!token || token.length !== 64) return false
  const expected = createDashToken()
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
```

- [ ] **Step 2 : Vérifier que le module se compile**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx tsc --noEmit 2>&1 | head -20
```
Expected: pas d'erreur

- [ ] **Step 3 : Mettre à jour `app/api/dashboard/login/route.ts`**

```typescript
// app/api/dashboard/login/route.ts
import { NextResponse } from 'next/server'
import { createDashToken } from '@/lib/dashboard-token'

export async function POST(req: Request) {
  let password: string
  try {
    const body = await req.json()
    password = body.password ?? ''
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })
  }

  const token = createDashToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('kenomi-dash-auth', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 7,
    path:     '/',
  })
  return res
}
```

- [ ] **Step 4 : Mettre à jour `middleware.ts` — section dashboard**

Remplacer le bloc dashboard (lignes 9-16) par :

```typescript
// ── Dashboard admin (cookie maison, pas Supabase) ─────────────────────────
if (pathname.startsWith('/dashboard')) {
  if (pathname === '/dashboard/login') return NextResponse.next()
  const token = request.cookies.get('kenomi-dash-auth')?.value ?? ''
  const { verifyDashToken } = await import('@/lib/dashboard-token')
  if (!verifyDashToken(token))
    return NextResponse.redirect(new URL('/dashboard/login', request.url))
  return NextResponse.next()
}
```

**Note :** `import()` dynamique est nécessaire car `middleware.ts` tourne dans l'Edge Runtime qui n'a pas accès au module `crypto` Node natif. Si l'Edge Runtime bloque `crypto`, ajouter `export const runtime = 'nodejs'` au middleware.

Alternative si Edge Runtime pose problème — utiliser `crypto` du Web API :

```typescript
// lib/dashboard-token.ts (version Edge-compatible)
async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createDashToken(): Promise<string> {
  const secret  = process.env.DASHBOARD_TOKEN_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'dev'
  const payload = process.env.DASHBOARD_PASSWORD ?? ''
  return hmacHex(secret, payload)
}

export async function verifyDashToken(token: string): Promise<boolean> {
  if (!token || token.length !== 64) return false
  const expected = await createDashToken()
  return token === expected
}
```

Avec cette version, `middleware.ts` devient :
```typescript
if (pathname.startsWith('/dashboard')) {
  if (pathname === '/dashboard/login') return NextResponse.next()
  const token = request.cookies.get('kenomi-dash-auth')?.value ?? ''
  const { verifyDashToken } = await import('@/lib/dashboard-token')
  if (!await verifyDashToken(token))
    return NextResponse.redirect(new URL('/dashboard/login', request.url))
  return NextResponse.next()
}
```

Et `login/route.ts` utilise `await createDashToken()`.

- [ ] **Step 5 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 6 : Commit**

```bash
git add lib/dashboard-token.ts app/api/dashboard/login/route.ts middleware.ts
git commit -m "fix(security): cookie admin → token HMAC, plus de mot de passe en clair"
```

---

### Task 2 : Protection SSRF sur la route automations/trigger

**Files:**
- Modify: `app/api/studio/automations/trigger/route.ts`

- [ ] **Step 1 : Remplacer intégralement `app/api/studio/automations/trigger/route.ts`**

```typescript
// app/api/studio/automations/trigger/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    // Bloquer les métadonnées cloud (AWS, GCP, Azure)
    if (/^169\.254\./.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let id: string
  try {
    const body = await req.json()
    id = body.id ?? ''
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('webhook_url, run_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (wf.webhook_url) {
    if (!isAllowedWebhookUrl(wf.webhook_url)) {
      return NextResponse.json({ error: 'URL webhook non autorisée' }, { status: 400 })
    }
    try {
      const resp = await fetch(wf.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: 'kenomi-studio', trigger: 'manual', timestamp: new Date().toISOString() }),
        signal:  AbortSignal.timeout(8000),
      })
      if (!resp.ok) {
        return NextResponse.json({ error: `Webhook erreur HTTP ${resp.status}` }, { status: 502 })
      }
    } catch (e) {
      const msg = e instanceof Error && e.name === 'TimeoutError'
        ? 'Webhook timeout (8s)'
        : 'Webhook injoignable'
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  await supabase
    .from('automation_workflows')
    .update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 erreur

- [ ] **Step 3 : Test manuel — déclencher un workflow depuis la page automations**
  - Aller sur `/studio/automations`
  - Cliquer "Run" sur un workflow avec `webhook_url` valide
  - Vérifier toast "Workflow déclenché !"
  - Vérifier que `run_count` s'incrémente dans Supabase

- [ ] **Step 4 : Commit**

```bash
git add app/api/studio/automations/trigger/route.ts
git commit -m "fix(security): SSRF guard + timeout 8s + vérif resp.ok sur trigger n8n"
```

---

### Task 3 : Protection SSRF sur la route chat (ollama_base_url)

**Files:**
- Modify: `app/api/studio/chat/route.ts` (lignes 41 et 64)

- [ ] **Step 1 : Ajouter la validation `ollama_base_url` dans `app/api/studio/chat/route.ts`**

Après la ligne `const baseUrl = (settings?.ollama_base_url || 'http://192.168.0.14:11434').replace(/\/$/, '')`, ajouter :

```typescript
  // Valider que baseUrl est une URL bien formée et non une endpoint de métadonnées
  function isAllowedOllamaUrl(url: string): boolean {
    try {
      const { protocol, hostname } = new URL(url)
      if (!['http:', 'https:'].includes(protocol)) return false
      if (/^169\.254\./.test(hostname)) return false
      return true
    } catch { return false }
  }
  if (!isAllowedOllamaUrl(baseUrl)) {
    return new Response(JSON.stringify({ error: 'URL Ollama invalide' }), { status: 400 })
  }
```

- [ ] **Step 2 : Ajouter la limite de taille sur `message` (après la vérification `!message?.trim()`)**

```typescript
  if (!conversationId || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'conversationId and message are required' }), { status: 400 })
  }
  if (message.length > 8000) {
    return new Response(JSON.stringify({ error: 'Message trop long (max 8000 caractères)' }), { status: 400 })
  }
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4 : Commit**

```bash
git add app/api/studio/chat/route.ts
git commit -m "fix(security): SSRF guard ollama_base_url + max 8000 chars sur message"
```

---

### Task 4 : Open redirect fix dans la route /api/waitlist

**Files:**
- Modify: `app/api/waitlist/route.ts`

- [ ] **Step 1 : Remplacer la ligne `origin` dans `app/api/waitlist/route.ts`**

Remplacer :
```typescript
    const origin = req.headers.get('origin') ?? `https://lab.kenomi.eu`
    return NextResponse.redirect(`${origin}/${slug}?waitlist=ok`, { status: 302 })
```

Par :
```typescript
    const BASE = (process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu').replace(/\/$/, '')
    return NextResponse.redirect(`${BASE}/${slug}?waitlist=ok`, { status: 302 })
```

- [ ] **Step 2 : Ajouter `APP_ORIGIN=https://lab.kenomi.eu` dans `.env.local`**

```bash
echo 'APP_ORIGIN=https://lab.kenomi.eu' >> /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local
```

- [ ] **Step 3 : Ajouter la validation email dans la même route**

Dans `app/api/waitlist/route.ts`, après le check `if (!slug || !email)`, ajouter :

```typescript
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Format email invalide' }, { status: 400 })
    }
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5 : Commit**

```bash
git add app/api/waitlist/route.ts .env.local
git commit -m "fix(security): open redirect waitlist → APP_ORIGIN fixe + validation email"
```

---

### Task 5 : Validation email + venture_id guard dans l'Edge Function waitlist

**Files:**
- Modify: `supabase/functions/waitlist/index.ts`

- [ ] **Step 1 : Remplacer intégralement `supabase/functions/waitlist/index.ts`**

```typescript
// supabase/functions/waitlist/index.ts
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
      slug  = (body.get('slug')  as string) ?? ''
      email = (body.get('email') as string) ?? ''
    } else {
      const json = await req.json()
      slug  = json.slug  ?? ''
      email = json.email ?? ''
    }

    if (!slug || !email) {
      return new Response(
        JSON.stringify({ error: 'slug et email requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!EMAIL_RE.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Format email invalide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: ventures } = await supabase
      .from('ventures').select('id').eq('slug', slug).limit(1)

    const venture_id = ventures?.[0]?.id ?? null
    if (!venture_id) {
      return new Response(
        JSON.stringify({ error: 'Venture introuvable' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

- [ ] **Step 2 : Déployer l'edge function**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
supabase functions deploy waitlist --project-ref $(grep SUPABASE_URL .env.local | cut -d= -f2 | grep -o '[a-z]*' | head -1) 2>&1 | tail -5
```

Si la commande échoue, déployer via le dashboard Supabase → Edge Functions → waitlist → Deploy.

- [ ] **Step 3 : Commit**

```bash
git add supabase/functions/waitlist/index.ts
git commit -m "fix(security): edge function waitlist — validation email + venture_id guard + CORS restrictif"
```

---

### Task 6 : Tests unitaires pour les helpers de sécurité

**Files:**
- Create: `lib/security.ts` — extraire les fonctions `isAllowedWebhookUrl` et `isValidEmail`
- Create: `lib/security.test.ts`

- [ ] **Step 1 : Créer `lib/security.ts`**

```typescript
// lib/security.ts

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    if (/^169\.254\./.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedOllamaUrl(url: string): boolean {
  return isAllowedWebhookUrl(url)
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}
```

- [ ] **Step 2 : Créer `lib/security.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { isAllowedWebhookUrl, isValidEmail } from './security'

describe('isAllowedWebhookUrl', () => {
  it('accepte http://192.168.0.x (réseau local kenomi)', () => {
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(true)
  })
  it('accepte https://n8n.kenomi.eu/webhook/abc', () => {
    expect(isAllowedWebhookUrl('https://n8n.kenomi.eu/webhook/abc')).toBe(true)
  })
  it('rejette les métadonnées cloud 169.254.169.254', () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })
  it('rejette les URLs non-HTTP', () => {
    expect(isAllowedWebhookUrl('ftp://evil.com')).toBe(false)
  })
  it('rejette une URL malformée', () => {
    expect(isAllowedWebhookUrl('not-a-url')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('kenji@kenomi.eu')).toBe(true)
  })
  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
  it('rejette une chaîne vide', () => {
    expect(isValidEmail('')).toBe(false)
  })
  it('rejette un email sans domaine', () => {
    expect(isValidEmail('test@')).toBe(false)
  })
})
```

- [ ] **Step 3 : Lancer les tests**

```bash
npm test 2>&1 | tail -15
```
Expected: 15 tests existants + 9 nouveaux = 24 passent

- [ ] **Step 4 : Mettre à jour trigger et chat pour importer depuis security.ts**

Dans `app/api/studio/automations/trigger/route.ts`, remplacer la fonction `isAllowedWebhookUrl` inline par :
```typescript
import { isAllowedWebhookUrl } from '@/lib/security'
```

Dans `app/api/studio/chat/route.ts`, remplacer la fonction `isAllowedOllamaUrl` inline par :
```typescript
import { isAllowedOllamaUrl } from '@/lib/security'
```

- [ ] **Step 5 : Build final**

```bash
npx next build 2>&1 | tail -10
```
Expected: build réussi

- [ ] **Step 6 : Commit final Plan A**

```bash
git add lib/security.ts lib/security.test.ts app/api/studio/automations/trigger/route.ts app/api/studio/chat/route.ts
git commit -m "refactor(security): extraire helpers sécurité dans lib/security.ts + tests"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
