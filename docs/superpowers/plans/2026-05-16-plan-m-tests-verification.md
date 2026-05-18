# Plan M — Tests & Vérification Prod

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les tests API prioritaires manquants (chat ownership, automation trigger, waitlist, healthcheck env manquant) et valider que `npm run build` passe en entier.

**Architecture:** Tous les tests sont dans `lib/` ou `app/api/` avec vitest en mode node. Les routes Next.js ne sont pas instanciées directement — on extrait la logique pure dans des helpers testables ou on utilise des mocks ciblés. Le build Next.js est vérifié en fin de plan.

**Tech Stack:** Vitest 3, TypeScript, Node environment. Les routes API utilisent `requireAllowedUser` et `supabase` — on les mock via `vi.mock`.

**Dépendances :** Plans K et L doivent être exécutés avant (table `automation_runs`, route `/api/studio/automations/runs`).

---

## Fichiers modifiés

| Fichier                           | Action                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| `lib/chat-validation.ts`          | Créer — fonctions pures extraites du handler chat (validation message) |
| `lib/chat-validation.test.ts`     | Créer — tests des validations chat                                     |
| `lib/automation-runs.test.ts`     | Créer — tests de la logique de run (status, durée)                     |
| `lib/waitlist-validation.test.ts` | Créer — tests de validation email + slug déjà dans validation.ts       |
| `lib/health-check.ts`             | Créer — logique pure du health check (vérification env vars)           |
| `lib/health-check.test.ts`        | Créer — tests du health check avec env manquant                        |

---

### Task 1 : Extraire et tester la validation du chat

**Files:**

- Create: `lib/chat-validation.ts`
- Create: `lib/chat-validation.test.ts`

**Contexte :** La route chat valide `conversationId`, `message` (non vide, max 8000 chars). Cette logique pure peut être extraite et testée sans instancier Next.js.

- [ ] **Step 1 : Créer `lib/chat-validation.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/chat-validation.ts` :

```typescript
export interface ChatInput {
  conversationId?: string
  message?: string
  agentId?: string
}

export interface ChatValidationResult {
  ok: true
  conversationId: string
  message: string
  agentId?: string
}

export interface ChatValidationError {
  ok: false
  error: string
  status: number
}

export function validateChatInput(input: ChatInput): ChatValidationResult | ChatValidationError {
  const { conversationId, message, agentId } = input

  if (!conversationId || !message?.trim()) {
    return { ok: false, error: 'conversationId and message are required', status: 400 }
  }

  if (message.length > 8000) {
    return { ok: false, error: 'Message trop long (max 8000 caractères)', status: 400 }
  }

  return { ok: true, conversationId, message: message.trim(), agentId }
}
```

- [ ] **Step 2 : Créer `lib/chat-validation.test.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/chat-validation.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { validateChatInput } from './chat-validation'

describe('validateChatInput', () => {
  it('accepte un input valide', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'Bonjour' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.conversationId).toBe('conv-1')
      expect(result.message).toBe('Bonjour')
    }
  })

  it('rejette si conversationId absent', () => {
    const result = validateChatInput({ message: 'Bonjour' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/required/)
    }
  })

  it('rejette si message absent', () => {
    const result = validateChatInput({ conversationId: 'conv-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejette si message vide (espaces)', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejette si message trop long (>8000 chars)', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'a'.repeat(8001) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/8000/)
    }
  })

  it('accepte un message de 8000 chars exactement', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'a'.repeat(8000) })
    expect(result.ok).toBe(true)
  })

  it('préserve agentId si fourni', () => {
    const result = validateChatInput({ conversationId: 'c', message: 'hi', agentId: 'agent-1' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.agentId).toBe('agent-1')
  })

  it('trim le message avant validation de longueur', () => {
    const result = validateChatInput({ conversationId: 'c', message: '  hello  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toBe('hello')
  })
})
```

- [ ] **Step 3 : Lancer les tests**

```bash
npx vitest run lib/chat-validation.test.ts 2>&1
```

Expected : 8 tests PASS

- [ ] **Step 4 : Mettre à jour la route chat pour utiliser validateChatInput**

Dans `app/api/studio/chat/route.ts`, remplacer le bloc de validation manuel :

```typescript
// Avant (à remplacer)
const { conversationId, message, agentId } = body
if (!conversationId || !message?.trim()) {
  return new Response(JSON.stringify({ error: 'conversationId and message are required' }), {
    status: 400,
  })
}
if (message.length > 8000) {
  return new Response(JSON.stringify({ error: 'Message trop long (max 8000 caractères)' }), {
    status: 400,
  })
}
```

Par :

```typescript
import { validateChatInput } from '@/lib/chat-validation'

// Après (à insérer)
const validation = validateChatInput(body)
if (!validation.ok) {
  return new Response(JSON.stringify({ error: validation.error }), { status: validation.status })
}
const { conversationId, message, agentId } = validation
```

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 6 : Commit**

```bash
git add lib/chat-validation.ts lib/chat-validation.test.ts app/api/studio/chat/route.ts
git commit -m "test(chat): extraire validateChatInput + 8 tests de validation"
```

---

### Task 2 : Tester la logique de statut des runs d'automation

**Files:**

- Create: `lib/automation-runs.test.ts`

**Contexte :** La logique qui détermine le statut d'un run (`'success' | 'error' | 'timeout'`) et la durée est dans la route trigger. On la teste via des fonctions pures extraites.

- [ ] **Step 1 : Créer `lib/automation-run-status.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/automation-run-status.ts` :

```typescript
export type RunStatus = 'success' | 'error' | 'timeout'

export interface RunResult {
  status: RunStatus
  httpStatus: number | null
  errorMessage: string | null
}

export function buildRunResult(opts: {
  webhookUrl: string | null
  fetchError: Error | null
  fetchStatus: number | null
}): RunResult {
  const { webhookUrl, fetchError, fetchStatus } = opts

  if (!webhookUrl) {
    // Pas de webhook — run immédiatement successful
    return { status: 'success', httpStatus: null, errorMessage: null }
  }

  if (fetchError) {
    const isTimeout = fetchError.name === 'TimeoutError'
    return {
      status: isTimeout ? 'timeout' : 'error',
      httpStatus: null,
      errorMessage: isTimeout ? 'Webhook timeout (8s)' : 'Webhook injoignable',
    }
  }

  if (fetchStatus !== null && fetchStatus >= 400) {
    return {
      status: 'error',
      httpStatus: fetchStatus,
      errorMessage: `HTTP ${fetchStatus}`,
    }
  }

  return { status: 'success', httpStatus: fetchStatus, errorMessage: null }
}
```

- [ ] **Step 2 : Créer `lib/automation-runs.test.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/automation-runs.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { buildRunResult } from './automation-run-status'

describe('buildRunResult', () => {
  it('succès sans webhook', () => {
    const r = buildRunResult({ webhookUrl: null, fetchError: null, fetchStatus: null })
    expect(r.status).toBe('success')
    expect(r.httpStatus).toBeNull()
    expect(r.errorMessage).toBeNull()
  })

  it('succès avec webhook 200', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 200,
    })
    expect(r.status).toBe('success')
    expect(r.httpStatus).toBe(200)
  })

  it('erreur avec webhook 500', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 500,
    })
    expect(r.status).toBe('error')
    expect(r.httpStatus).toBe(500)
    expect(r.errorMessage).toBe('HTTP 500')
  })

  it('erreur avec webhook 404', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 404,
    })
    expect(r.status).toBe('error')
    expect(r.errorMessage).toBe('HTTP 404')
  })

  it('timeout si AbortError avec name TimeoutError', () => {
    const err = new Error('signal timed out')
    err.name = 'TimeoutError'
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: err,
      fetchStatus: null,
    })
    expect(r.status).toBe('timeout')
    expect(r.errorMessage).toBe('Webhook timeout (8s)')
  })

  it('erreur si fetch rejette pour autre raison', () => {
    const err = new Error('ECONNREFUSED')
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: err,
      fetchStatus: null,
    })
    expect(r.status).toBe('error')
    expect(r.errorMessage).toBe('Webhook injoignable')
  })
})
```

- [ ] **Step 3 : Lancer les tests**

```bash
npx vitest run lib/automation-runs.test.ts 2>&1
```

Expected : 6 tests PASS

- [ ] **Step 4 : Utiliser buildRunResult dans la route trigger**

Dans `app/api/studio/automations/trigger/route.ts`, importer et utiliser la fonction :

```typescript
import { buildRunResult } from '@/lib/automation-run-status'
```

Remplacer le bloc qui calcule `status`, `httpStatus`, `errorMessage` par un appel à `buildRunResult`. Par exemple, à la place des blocs try/catch actuels :

```typescript
let fetchError: Error | null = null
let fetchStatus: number | null = null

if (wf.webhook_url) {
  if (!isAllowedWebhookUrl(wf.webhook_url)) {
    return apiError('URL webhook non autorisée', 400)
  }
  try {
    const resp = await fetch(wf.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'kenomi-studio',
        trigger: 'manual',
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    })
    fetchStatus = resp.status
  } catch (e) {
    fetchError = e as Error
  }
}

const { status, httpStatus, errorMessage } = buildRunResult({
  webhookUrl: wf.webhook_url,
  fetchError,
  fetchStatus,
})
```

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 6 : Commit**

```bash
git add lib/automation-run-status.ts lib/automation-runs.test.ts app/api/studio/automations/trigger/route.ts
git commit -m "test(automations): extraire buildRunResult + 6 tests statut run"
```

---

### Task 3 : Tests de validation waitlist

**Files:**

- Create: `lib/waitlist-validation.test.ts`

**Contexte :** Les validations slug et email de la waitlist utilisent les fonctions de `lib/validation.ts` (`isValidEmail`) et une regex locale `SLUG_RE`. On centralise `SLUG_RE` dans `lib/validation.ts` et on ajoute les tests correspondants.

- [ ] **Step 1 : Ajouter `isValidSlug` dans `lib/validation.ts`**

Ouvrir `lib/validation.ts`. Ajouter à la fin du fichier :

```typescript
const SLUG_RE = /^[a-z0-9-]{1,100}$/

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}
```

- [ ] **Step 2 : Mettre à jour `app/api/waitlist/route.ts` pour utiliser `isValidSlug`**

Dans `app/api/waitlist/route.ts`, remplacer :

```typescript
const SLUG_RE = /^[a-z0-9-]{1,100}$/
if (!SLUG_RE.test(slug)) return apiError('slug invalide', 400)
```

Par :

```typescript
import { isValidEmail, isValidSlug } from '@/lib/validation'
// (si isValidEmail n'est pas déjà importé, l'ajouter)

if (!isValidSlug(slug)) return apiError('slug invalide', 400)
```

**Note :** Vérifier que `isValidEmail` est déjà importé depuis `@/lib/validation` — si non, ajouter l'import et supprimer la regex locale `EMAIL_RE` et son usage.

- [ ] **Step 3 : Créer `lib/waitlist-validation.test.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/waitlist-validation.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { isValidSlug, isValidEmail } from './validation'

describe('isValidSlug', () => {
  it('accepte un slug simple', () => {
    expect(isValidSlug('my-venture')).toBe(true)
  })

  it('accepte des chiffres et tirets', () => {
    expect(isValidSlug('venture-2026-v2')).toBe(true)
  })

  it('rejette les majuscules', () => {
    expect(isValidSlug('MyVenture')).toBe(false)
  })

  it('rejette les espaces', () => {
    expect(isValidSlug('my venture')).toBe(false)
  })

  it('rejette les underscores', () => {
    expect(isValidSlug('my_venture')).toBe(false)
  })

  it('rejette une chaîne vide', () => {
    expect(isValidSlug('')).toBe(false)
  })

  it('rejette un slug trop long (>100 chars)', () => {
    expect(isValidSlug('a'.repeat(101))).toBe(false)
  })

  it('accepte un slug de 100 chars exactement', () => {
    expect(isValidSlug('a'.repeat(100))).toBe(true)
  })

  it('rejette les caractères spéciaux (/,?,#)', () => {
    expect(isValidSlug('my/venture')).toBe(false)
    expect(isValidSlug('my?venture')).toBe(false)
    expect(isValidSlug('my#venture')).toBe(false)
  })
})

describe('isValidEmail (waitlist context)', () => {
  it('accepte un email classique', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejette un email sans domaine', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
})
```

- [ ] **Step 4 : Lancer les tests**

```bash
npx vitest run lib/waitlist-validation.test.ts 2>&1
```

Expected : 12 tests PASS

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 6 : Commit**

```bash
git add lib/validation.ts lib/waitlist-validation.test.ts app/api/waitlist/route.ts
git commit -m "test(waitlist): extraire isValidSlug + 12 tests validation slug/email"
```

---

### Task 4 : Extraire et tester la vérification env du health check

**Files:**

- Create: `lib/health-check.ts`
- Create: `lib/health-check.test.ts`

**Contexte :** La liste des variables requises dans `/api/health` est une constante testable. On l'extrait dans `lib/health-check.ts` pour pouvoir tester le comportement en cas de variable manquante sans instancier le serveur.

- [ ] **Step 1 : Créer `lib/health-check.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/health-check.ts` :

```typescript
export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DASHBOARD_PASSWORD',
  'DASHBOARD_TOKEN_SECRET',
  'ALLOWED_EMAIL',
] as const

export interface EnvCheck {
  ok: boolean
  error?: string
}

export function checkEnvVars(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k])
  if (missing.length === 0) return { ok: true }
  return {
    ok: false,
    error:
      env.NODE_ENV === 'production'
        ? 'configuration incomplete'
        : `Manquantes: ${missing.join(', ')}`,
  }
}
```

- [ ] **Step 2 : Mettre à jour `app/api/health/route.ts` pour utiliser `checkEnvVars`**

Dans `app/api/health/route.ts`, remplacer le bloc de vérification env :

```typescript
import { checkEnvVars } from '@/lib/health-check'

// Remplacer le bloc "1. Variables d'env critiques" par :
checks.env = checkEnvVars()
```

Et supprimer les lignes `const requiredEnvs = [...]` et `const missingEnvs = ...` devenues inutiles.

- [ ] **Step 3 : Créer `lib/health-check.test.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/health-check.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkEnvVars, REQUIRED_ENV_VARS } from './health-check'

describe('checkEnvVars', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Remettre l'env à zéro pour chaque test
    for (const key of REQUIRED_ENV_VARS) {
      delete process.env[key]
    }
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    // Restaurer l'env original
    Object.assign(process.env, originalEnv)
  })

  it('retourne ok:true si toutes les vars sont présentes', () => {
    for (const key of REQUIRED_ENV_VARS) {
      process.env[key] = 'test-value'
    }
    const result = checkEnvVars()
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('retourne ok:false si une var est manquante', () => {
    for (const key of REQUIRED_ENV_VARS) {
      process.env[key] = 'test-value'
    }
    delete process.env.DASHBOARD_TOKEN_SECRET
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
  })

  it('liste les vars manquantes en dev', () => {
    process.env.NODE_ENV = 'development'
    // Laisser toutes les vars manquantes
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(result.error).toContain('DATABASE_URL')
  })

  it('masque les noms de vars en production', () => {
    process.env.NODE_ENV = 'production'
    const result = checkEnvVars()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('configuration incomplete')
    expect(result.error).not.toContain('SUPABASE')
  })

  it('accepte un env custom passé en paramètre', () => {
    const fakeEnv: NodeJS.ProcessEnv = {}
    for (const key of REQUIRED_ENV_VARS) {
      fakeEnv[key] = 'ok'
    }
    const result = checkEnvVars(fakeEnv)
    expect(result.ok).toBe(true)
  })

  it('retourne ok:false si une seule var manque dans env custom', () => {
    const fakeEnv: NodeJS.ProcessEnv = {}
    for (const key of REQUIRED_ENV_VARS) {
      fakeEnv[key] = 'ok'
    }
    delete fakeEnv['ALLOWED_EMAIL']
    const result = checkEnvVars(fakeEnv)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 4 : Lancer les tests**

```bash
npx vitest run lib/health-check.test.ts 2>&1
```

Expected : 6 tests PASS

- [ ] **Step 5 : Relancer tous les tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected : tous PASS, aucun FAIL. Le nombre total doit être supérieur aux 68 tests précédents.

- [ ] **Step 6 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 7 : Commit**

```bash
git add lib/health-check.ts lib/health-check.test.ts app/api/health/route.ts
git commit -m "test(health): extraire checkEnvVars + 6 tests env manquant/masqué"
```

---

### Task 5 : Vérifier le build Next.js complet

**Files:** aucun fichier créé — vérification uniquement

**Contexte :** `npm run build` est le critère de "done" final du MVP prod. Il détecte les erreurs TypeScript, les imports manquants, et les problèmes de compilation qui n'apparaissent pas avec `tsc --noEmit` seul (routes dynamiques, metadata, etc.).

- [ ] **Step 1 : Lancer le build**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npm run build 2>&1 | tail -30
```

Expected : `✓ Compiled successfully` ou `Route (app)` table affichée sans erreurs rouges.

- [ ] **Step 2 : Corriger les erreurs de build si présentes**

Si le build échoue :

- Lire l'erreur complète
- Les erreurs courantes sont : import manquant (`Module not found`), variable `process.env` non déclarée côté client, usage de `cookies()` dans un composant client, etc.
- Corriger le fichier incriminé
- Relancer `npm run build 2>&1 | tail -30`

- [ ] **Step 3 : Commit si des corrections ont été nécessaires**

Si des fichiers ont été modifiés pour faire passer le build :

```bash
git add <fichiers modifiés>
git commit -m "fix(build): corrections pour npm run build"
```

Si aucune correction n'était nécessaire, pas de commit.

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
