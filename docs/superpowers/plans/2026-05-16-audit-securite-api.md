# Audit Fix — Plan D : Sécurité API & Middleware

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 6 vulnérabilités sécurité identifiées dans l'audit : whitelist email absente des routes API, ordre de vérification inversé dans chat, SSRF IPv6, token dashboard expirant à minuit, secret HMAC optionnel, et slug non encodé.

**Architecture:** Un helper serveur centralisé `lib/auth-server.ts` pour l'auth+whitelist. Corrections chirurgicales dans 5 fichiers existants. Aucune nouvelle dépendance.

**Tech Stack:** Next.js 15 App Router, Node.js crypto (Web Crypto API), Supabase SSR, TypeScript

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `lib/auth-server.ts` | **Créer** — helper `requireAllowedUser()` centralisé |
| `lib/security.ts` | **Modifier** — blocklist SSRF étendue (IPv6-mapped, hexa, décimal) |
| `lib/dashboard-token.ts` | **Modifier** — `verifyDashToken` accepte fenêtre J et J-1 + secret obligatoire |
| `app/api/studio/chat/route.ts` | **Modifier** — utiliser `requireAllowedUser` + inverser ordre vérif conversation |
| `app/api/studio/automations/trigger/route.ts` | **Modifier** — utiliser `requireAllowedUser` |
| `app/api/waitlist/route.ts` | **Modifier** — `encodeURIComponent(slug)` |
| `lib/security.test.ts` | **Modifier** — tests pour les nouveaux patterns SSRF |

---

### Task 1 : Créer le helper `requireAllowedUser`

**Files:**
- Create: `lib/auth-server.ts`

- [ ] **Step 1 : Créer `lib/auth-server.ts`**

```typescript
// lib/auth-server.ts
import { createServerClient } from '@supabase/ssr'
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export async function requireAllowedUser(cookieStore: ReadonlyRequestCookies) {
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

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { user: null, supabase, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }
  }

  const ALLOWED = process.env.ALLOWED_EMAIL
  if (ALLOWED && user.email !== ALLOWED) {
    return { user: null, supabase, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) }
  }

  return { user, supabase, response: null }
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add lib/auth-server.ts
git commit -m "feat(auth): helper requireAllowedUser — auth + whitelist centralisés"
```

---

### Task 2 : Appliquer `requireAllowedUser` dans la route chat

**Files:**
- Modify: `app/api/studio/chat/route.ts`

- [ ] **Step 1 : Remplacer le bloc auth et inverser l'ordre de vérification de la conversation**

Remplacer le début de `app/api/studio/chat/route.ts` (lignes 1-60) :

```typescript
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { isAllowedOllamaUrl } from '@/lib/security'
import { requireAllowedUser } from '@/lib/auth-server'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let body: { conversationId?: string; message?: string; agentId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { conversationId, message, agentId } = body
  if (!conversationId || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'conversationId and message are required' }), { status: 400 })
  }

  if (message.length > 8000) {
    return new Response(JSON.stringify({ error: 'Message trop long (max 8000 caractères)' }), { status: 400 })
  }

  const { data: settings } = await supabase
    .from('user_settings').select('*').eq('user_id', user!.id).maybeSingle()

  const baseUrl = (settings?.ollama_base_url || 'http://192.168.0.14:11434').replace(/\/$/, '')
  if (!isAllowedOllamaUrl(baseUrl)) {
    return new Response(JSON.stringify({ error: 'URL Ollama invalide' }), { status: 400 })
  }

  const model = settings?.ollama_model || 'qwen3:8b'

  // Vérifier la propriété de la conversation EN PREMIER
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user!.id)
    .maybeSingle()
  if (!conv) return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 })

  // Charger l'historique APRÈS validation de propriété
  const { data: history } = await supabase
    .from('messages').select('role,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
```

Le reste de la route (stream SSE, insertion messages) reste identique.

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/chat/route.ts
git commit -m "fix(security): requireAllowedUser dans chat + vérif conversation avant historique"
```

---

### Task 3 : Appliquer `requireAllowedUser` dans la route automations/trigger

**Files:**
- Modify: `app/api/studio/automations/trigger/route.ts`

- [ ] **Step 1 : Remplacer le bloc auth**

Remplacer les imports et le début du handler dans `app/api/studio/automations/trigger/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAllowedWebhookUrl } from '@/lib/security'
import { requireAllowedUser } from '@/lib/auth-server'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  // ... reste identique à partir de la lecture du body JSON
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/automations/trigger/route.ts
git commit -m "fix(security): requireAllowedUser dans automations/trigger"
```

---

### Task 4 : Étendre la blocklist SSRF

**Files:**
- Modify: `lib/security.ts`
- Modify: `lib/security.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent d'abord**

Ajouter dans `lib/security.test.ts` (dans le describe `isAllowedWebhookUrl`) :

```typescript
  it('rejette IPv4-mapped IPv6 ::ffff:127.0.0.1', () => {
    expect(isAllowedWebhookUrl('http://[::ffff:127.0.0.1]:8080')).toBe(false)
  })
  it('rejette IPv4-mapped IPv6 ::ffff:10.0.0.1', () => {
    expect(isAllowedWebhookUrl('http://[::ffff:10.0.0.1]')).toBe(false)
  })
  it('rejette adresse IP en hexadécimal', () => {
    expect(isAllowedWebhookUrl('http://0x7f000001')).toBe(false)
  })
  it('rejette adresse IP en décimal (2130706433 = 127.0.0.1)', () => {
    expect(isAllowedWebhookUrl('http://2130706433')).toBe(false)
  })
  it('accepte toujours http://192.168.0.14:11434 (Ollama local)', () => {
    expect(isAllowedWebhookUrl('http://192.168.0.14:11434')).toBe(true)
  })
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test 2>&1 | tail -20
```
Expected: les 4 nouveaux tests échouent (IPv6-mapped, hexa, décimal passent alors qu'ils ne devraient pas)

- [ ] **Step 3 : Mettre à jour `lib/security.ts`**

```typescript
// lib/security.ts

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false

    // Retirer les crochets IPv6 pour tester le hostname brut
    const h = hostname.replace(/^\[|\]$/g, '')

    const SSRF_BLOCKED = [
      /^localhost$/i,
      /^127\./,
      /^0\.0\.0\.0$/,
      /^169\.254\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^::1$/,
      /^::ffff:/i,         // IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1)
      /^fc[0-9a-f]{2}:/i,  // ULA IPv6
      /^fd[0-9a-f]{2}:/i,  // ULA IPv6
      /^0x[0-9a-f]+$/i,    // IP en hexadécimal (ex: 0x7f000001)
      /^\d{8,10}$/,        // IP en décimal (ex: 2130706433 = 127.0.0.1)
    ]

    return !SSRF_BLOCKED.some(r => r.test(h))
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

- [ ] **Step 4 : Lancer tous les tests**

```bash
npm test 2>&1 | tail -20
```
Expected: tous les tests passent (anciens + 4 nouveaux)

- [ ] **Step 5 : Commit**

```bash
git add lib/security.ts lib/security.test.ts
git commit -m "fix(security): blocklist SSRF — IPv6-mapped, hexa, décimal"
```

---

### Task 5 : Corriger le token dashboard (fenêtre J+J-1, secret obligatoire)

**Files:**
- Modify: `lib/dashboard-token.ts`

- [ ] **Step 1 : Mettre à jour `lib/dashboard-token.ts`**

```typescript
// lib/dashboard-token.ts
// Web Crypto API — compatible Edge Runtime ET Node.js

async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getDayWindow(): number {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24))
}

function getSecret(): string {
  const secret = process.env.DASHBOARD_TOKEN_SECRET
  if (!secret) throw new Error('DASHBOARD_TOKEN_SECRET is not set — add it to your environment variables')
  return secret
}

async function createDashTokenForWindow(window: number): Promise<string> {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) throw new Error('DASHBOARD_PASSWORD is not set')
  const payload = `${password}:${window}`
  return hmacHex(getSecret(), payload)
}

export async function createDashToken(): Promise<string> {
  return createDashTokenForWindow(getDayWindow())
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

export async function verifyDashToken(token: string): Promise<boolean> {
  if (!token || token.length !== 64) return false
  try {
    // Accepter la fenêtre courante (J) ET la fenêtre précédente (J-1)
    // pour éviter l'invalidation au passage minuit
    const day = getDayWindow()
    const [current, previous] = await Promise.all([
      createDashTokenForWindow(day),
      createDashTokenForWindow(day - 1),
    ])
    return constantTimeEqual(token, current) || constantTimeEqual(token, previous)
  } catch {
    return false
  }
}
```

- [ ] **Step 2 : Ajouter `DASHBOARD_TOKEN_SECRET` dans `.env.local` si absent**

```bash
grep -q 'DASHBOARD_TOKEN_SECRET' /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local || \
  echo "DASHBOARD_TOKEN_SECRET=$(openssl rand -hex 32)" >> /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local
```

- [ ] **Step 3 : Ajouter `DASHBOARD_TOKEN_SECRET` dans Coolify**

```bash
# Générer une valeur aléatoire
SECRET=$(openssl rand -hex 32)
echo "Secret généré : $SECRET"

# L'ajouter dans Coolify
curl -s -X POST "http://192.168.0.19:8000/api/v1/applications/yup6hpmw0fcowrkkf2o3bzl1/envs" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2" \
  -H "Content-Type: application/json" \
  -d "{\"key\": \"DASHBOARD_TOKEN_SECRET\", \"value\": \"$SECRET\"}"
```

**⚠️ Note :** Après cet ajout, tous les tokens dashboard existants seront invalidés. Il faudra se reconnecter au dashboard.

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5 : Commit**

```bash
git add lib/dashboard-token.ts .env.local
git commit -m "fix(security): token dashboard — secret obligatoire + validité fenêtre J et J-1"
```

---

### Task 6 : Encoder le slug dans la redirection waitlist

**Files:**
- Modify: `app/api/waitlist/route.ts`

- [ ] **Step 1 : Remplacer la ligne de redirection**

Dans `app/api/waitlist/route.ts`, remplacer :

```typescript
    const BASE = (process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu').replace(/\/$/, '')
    return NextResponse.redirect(`${BASE}/${slug}?waitlist=ok`, { status: 302 })
```

Par :

```typescript
    const BASE = (process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu').replace(/\/$/, '')
    return NextResponse.redirect(`${BASE}/${encodeURIComponent(slug)}?waitlist=ok`, { status: 302 })
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add app/api/waitlist/route.ts
git commit -m "fix(security): encodeURIComponent(slug) dans la redirection waitlist"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```

**Après déploiement — déclencher un redéploiement Coolify pour appliquer `DASHBOARD_TOKEN_SECRET` :**
Se reconnecter au dashboard via `/dashboard/login`.
