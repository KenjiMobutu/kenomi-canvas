# Plan H — Robustesse API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les routes API plus robustes : rate limiting en mémoire sur login dashboard + waitlist, erreurs API uniformes via un helper, et `/api/health` qui vérifie réellement la DB, Supabase et la config.

**Architecture:** Un fichier `lib/rate-limit.ts` fournit un compteur en mémoire par IP (suffisant pour une app mono-utilisateur). Un helper `lib/api-response.ts` standardise les réponses d'erreur. La route `/api/health` devient une vérification d'état complète. Aucun service externe requis.

**Tech Stack:** Next.js 15 Route Handlers, TypeScript, Supabase service role client, Prisma.

---

## Fichiers modifiés

| Fichier                            | Action                                          |
| ---------------------------------- | ----------------------------------------------- |
| `lib/rate-limit.ts`                | Créer — compteur en mémoire par IP              |
| `lib/api-response.ts`              | Créer — helpers de réponse JSON uniformes       |
| `app/api/dashboard/login/route.ts` | Modifier — appliquer rate limit                 |
| `app/api/waitlist/route.ts`        | Modifier — appliquer rate limit                 |
| `app/api/health/route.ts`          | Modifier — vérifications DB + Supabase + config |

---

### Task 1 : Créer `lib/rate-limit.ts`

**Files:**

- Create: `lib/rate-limit.ts`

- [ ] **Step 1 : Créer le fichier**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/rate-limit.ts` :

```typescript
// Compteur en mémoire par IP — suffisant pour une app mono-utilisateur.
// Se remet à zéro au redémarrage du process (comportement attendu).

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export interface RateLimitOptions {
  /** Nombre de requêtes autorisées dans la fenêtre */
  limit: number
  /** Durée de la fenêtre en millisecondes */
  windowMs: number
}

/**
 * Retourne true si la requête doit être bloquée (limite atteinte).
 * key : identifiant unique — typiquement `ip:route` ou `email:route`.
 */
export function isRateLimited(key: string, { limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  entry.count += 1
  if (entry.count > limit) return true

  return false
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add lib/rate-limit.ts
git commit -m "feat(api): rate limiter en mémoire par IP"
```

---

### Task 2 : Créer `lib/api-response.ts`

**Files:**

- Create: `lib/api-response.ts`

**Contexte :** Actuellement certaines routes retournent `NextResponse.json(...)` et d'autres `new Response(JSON.stringify(...))`. Ce helper uniformise les réponses d'erreur et les headers `Content-Type`.

- [ ] **Step 1 : Créer le fichier**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/api-response.ts` :

```typescript
import { NextResponse } from 'next/server'

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

// Codes utilisés dans le projet :
// 400 — requête invalide (paramètre manquant, format incorrect)
// 401 — non authentifié
// 403 — authentifié mais non autorisé (ALLOWED_EMAIL)
// 404 — ressource non trouvée (ou non possédée par cet utilisateur)
// 429 — trop de requêtes
// 500 — erreur serveur interne
// 502 — erreur de service externe (Ollama, webhook n8n)
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add lib/api-response.ts
git commit -m "feat(api): helper apiError/apiOk pour réponses uniformes"
```

---

### Task 3 : Rate limiting sur le login dashboard

**Files:**

- Modify: `app/api/dashboard/login/route.ts`

**Contexte :** La route accepte actuellement un nombre illimité de tentatives de mot de passe. On limite à 5 tentatives par IP par fenêtre de 15 minutes.

- [ ] **Step 1 : Modifier la route**

Ouvrir `app/api/dashboard/login/route.ts`. Remplacer le contenu complet par :

```typescript
import { NextResponse, NextRequest } from 'next/server'
import { createDashToken } from '@/lib/dashboard-token'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`dashboard-login:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 })) {
    return apiError('Trop de tentatives. Réessayez dans 15 minutes.', 429)
  }

  let password: string
  try {
    const body = await req.json()
    password = body.password ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }

  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    return apiError('Mot de passe incorrect', 401)
  }

  const token = await createDashToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('kenomi-dash-auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  return res
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/dashboard/login/route.ts
git commit -m "fix(security): rate limit 5 tentatives/15min sur le login dashboard"
```

---

### Task 4 : Rate limiting sur la route waitlist

**Files:**

- Modify: `app/api/waitlist/route.ts`

**Contexte :** La waitlist est publique (non authentifiée). On limite à 3 inscriptions par IP par heure pour éviter le spam.

- [ ] **Step 1 : Modifier la route**

Ouvrir `app/api/waitlist/route.ts`. Ajouter l'import et le check rate limit en tête du handler :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(`waitlist:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    return apiError('Trop de requêtes. Réessayez dans une heure.', 429)
  }

  try {
    let slug: string, email: string

    const contentType = req.headers.get('content-type') ?? ''

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await req.formData()
      slug = (form.get('slug') as string) ?? ''
      email = (form.get('email') as string) ?? ''
    } else {
      const body = await req.json()
      slug = body.slug ?? ''
      email = body.email ?? ''
    }

    if (!slug || !email) {
      return apiError('slug et email requis', 400)
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (!EMAIL_RE.test(email)) {
      return apiError('Format email invalide', 400)
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
    return apiError('Erreur serveur', 500)
  }
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/waitlist/route.ts
git commit -m "fix(security): rate limit 3 inscriptions/heure sur la waitlist publique"
```

---

### Task 5 : Enrichir `/api/health`

**Files:**

- Modify: `app/api/health/route.ts`

**Contexte :** Actuellement le health check retourne juste `'ok'`. On veut vérifier : DB Prisma joignable, Supabase joignable, variables d'env critiques présentes, et Ollama si configuré. La réponse est JSON structuré avec un statut HTTP 200 (tout ok) ou 503 (un check échoue).

- [ ] **Step 1 : Modifier la route**

Remplacer `app/api/health/route.ts` par :

```typescript
import { db } from '@/lib/db'
import { createClient } from '@supabase/supabase-js'

interface Check {
  ok: boolean
  latencyMs?: number
  error?: string
}

export async function GET() {
  const checks: Record<string, Check> = {}

  // 1. Variables d'env critiques
  const requiredEnvs = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DASHBOARD_PASSWORD',
    'DASHBOARD_TOKEN_SECRET',
    'ALLOWED_EMAIL',
  ]
  const missingEnvs = requiredEnvs.filter((k) => !process.env[k])
  checks.env = {
    ok: missingEnvs.length === 0,
    ...(missingEnvs.length > 0 ? { error: `Manquantes: ${missingEnvs.join(', ')}` } : {}),
  }

  // 2. Base de données Prisma
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (e) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: (e as Error).message }
  }

  // 3. Supabase Auth (ping simple)
  const sbStart = Date.now()
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await sb.from('profiles').select('id').limit(1)
    checks.supabase = {
      ok: !error,
      latencyMs: Date.now() - sbStart,
      ...(error ? { error: error.message } : {}),
    }
  } catch (e) {
    checks.supabase = { ok: false, latencyMs: Date.now() - sbStart, error: (e as Error).message }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const status = allOk ? 200 : 503

  return Response.json(
    { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status }
  )
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Tester manuellement**

Démarrer le serveur dev :

```bash
npm run dev &
```

Appeler le health check :

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Expected : JSON avec `"status": "ok"` et les 3 checks à `true`, ou `"status": "degraded"` si un service est injoignable avec le détail de l'erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat(ops): /api/health — vérification DB, Supabase, env vars"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
