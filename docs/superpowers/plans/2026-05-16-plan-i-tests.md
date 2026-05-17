# Plan I — Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre la couverture de tests aux modules non testés : `dashboard-token`, `rate-limit`, `api-response`, et les logiques pures extraites de `waitlist` et `documents` (validation email, sanitisation nom de fichier).

**Architecture:** Tous les tests sont dans `lib/` avec vitest en mode `node`. On ne teste pas les routes Next.js directement (nécessiterait un serveur) — on extrait la logique pure dans des fonctions et on teste celles-ci. Le runner existant (`vitest run`) et la config (`vitest.config.ts`) restent inchangés.

**Tech Stack:** Vitest 3, TypeScript, Node environment (pas de DOM).

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `lib/dashboard-token.test.ts` | Créer — tests du token HMAC |
| `lib/rate-limit.test.ts` | Créer — tests du compteur en mémoire |
| `lib/api-response.test.ts` | Créer — tests des helpers de réponse |
| `lib/validation.ts` | Créer — fonctions pures extraites (email, filename) |
| `lib/validation.test.ts` | Créer — tests des validations |

---

### Task 1 : Tests de `dashboard-token`

**Files:**
- Create: `lib/dashboard-token.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/dashboard-token.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDashToken, verifyDashToken } from './dashboard-token'

describe('dashboard-token', () => {
  const SECRET = 'test-secret-32-chars-minimum-ok!'

  beforeEach(() => {
    process.env.DASHBOARD_TOKEN_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.DASHBOARD_TOKEN_SECRET
  })

  it('createDashToken retourne une chaîne hex de 64 caractères', async () => {
    const token = await createDashToken()
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
  })

  it('verifyDashToken accepte un token fraîchement créé', async () => {
    const token = await createDashToken()
    expect(await verifyDashToken(token)).toBe(true)
  })

  it('verifyDashToken rejette un token vide', async () => {
    expect(await verifyDashToken('')).toBe(false)
  })

  it('verifyDashToken rejette un token de mauvaise longueur', async () => {
    expect(await verifyDashToken('abc123')).toBe(false)
  })

  it('verifyDashToken rejette un token forgé', async () => {
    const fake = 'a'.repeat(64)
    expect(await verifyDashToken(fake)).toBe(false)
  })

  it('verifyDashToken rejette un token généré avec un autre secret', async () => {
    const token = await createDashToken()
    process.env.DASHBOARD_TOKEN_SECRET = 'different-secret-32-chars-ok!!!!'
    expect(await verifyDashToken(token)).toBe(false)
  })

  it('getSecret lance une erreur si DASHBOARD_TOKEN_SECRET est absent', async () => {
    delete process.env.DASHBOARD_TOKEN_SECRET
    await expect(createDashToken()).rejects.toThrow('DASHBOARD_TOKEN_SECRET est requis')
  })

  it('deux appels successifs retournent le même token (même jour)', async () => {
    const t1 = await createDashToken()
    const t2 = await createDashToken()
    expect(t1).toBe(t2)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx vitest run lib/dashboard-token.test.ts 2>&1
```
Expected : 8 tests PASS

- [ ] **Step 3 : Commit**

```bash
git add lib/dashboard-token.test.ts
git commit -m "test: dashboard-token — HMAC creation, verification, edge cases"
```

---

### Task 2 : Tests de `rate-limit`

**Files:**
- Create: `lib/rate-limit.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/rate-limit.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isRateLimited } from './rate-limit'

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('accepte les premières requêtes dans la limite', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    expect(isRateLimited('test-key-1', opts)).toBe(false)
    expect(isRateLimited('test-key-1', opts)).toBe(false)
    expect(isRateLimited('test-key-1', opts)).toBe(false)
  })

  it('bloque la requête qui dépasse la limite', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    isRateLimited('test-key-2', opts)
    isRateLimited('test-key-2', opts)
    isRateLimited('test-key-2', opts)
    expect(isRateLimited('test-key-2', opts)).toBe(true)
  })

  it('réinitialise le compteur après la fenêtre', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    isRateLimited('test-key-3', opts)
    isRateLimited('test-key-3', opts)
    expect(isRateLimited('test-key-3', opts)).toBe(true) // bloqué

    vi.advanceTimersByTime(61_000)

    expect(isRateLimited('test-key-3', opts)).toBe(false) // fenêtre réinitialisée
  })

  it('des clés différentes ont des compteurs indépendants', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    expect(isRateLimited('key-a', opts)).toBe(false)
    expect(isRateLimited('key-b', opts)).toBe(false)
    expect(isRateLimited('key-a', opts)).toBe(true)  // key-a bloquée
    expect(isRateLimited('key-b', opts)).toBe(true)  // key-b bloquée indépendamment
  })
})
```

- [ ] **Step 2 : Lancer les tests**

```bash
npx vitest run lib/rate-limit.test.ts 2>&1
```
Expected : 4 tests PASS

- [ ] **Step 3 : Commit**

```bash
git add lib/rate-limit.test.ts
git commit -m "test: rate-limit — fenêtre glissante, reset, isolation des clés"
```

---

### Task 3 : Extraire et tester les validations

**Files:**
- Create: `lib/validation.ts`
- Create: `lib/validation.test.ts`

**Contexte :** La regex email est dupliquée entre `lib/security.ts` et `app/api/waitlist/route.ts`. On centralise dans `lib/validation.ts` et on ajoute une fonction de sanitisation de nom de fichier pour `documents/page.tsx`.

- [ ] **Step 1 : Créer `lib/validation.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/validation.ts` :

```typescript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

/** Taille max d'upload : 10 Mo */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Types MIME autorisés pour les documents */
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * Sanitise un nom de fichier : retire les caractères dangereux,
 * normalise les espaces, limite la longueur à 200 caractères.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '_') // caractères interdits dans les noms de fichiers
    .replace(/\s+/g, '_')
    .slice(0, 200)
    .trim()
}

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime)
}

export function isAllowedFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_UPLOAD_BYTES
}
```

- [ ] **Step 2 : Créer `lib/validation.test.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/validation.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  sanitizeFilename,
  isAllowedMimeType,
  isAllowedFileSize,
  MAX_UPLOAD_BYTES,
} from './validation'

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })
  it('accepte un email avec sous-domaine', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true)
  })
  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
  it('rejette une chaîne vide', () => {
    expect(isValidEmail('')).toBe(false)
  })
  it('rejette un email sans TLD', () => {
    expect(isValidEmail('user@domain')).toBe(false)
  })
  it('rejette un email avec espace', () => {
    expect(isValidEmail('user @example.com')).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('remplace les slashes par underscore', () => {
    expect(sanitizeFilename('dir/file.pdf')).toBe('dir_file.pdf')
  })
  it('remplace les espaces par underscore', () => {
    expect(sanitizeFilename('mon document.pdf')).toBe('mon_document.pdf')
  })
  it('retire les caractères spéciaux dangereux', () => {
    expect(sanitizeFilename('file<>?.pdf')).toBe('file__.pdf')
  })
  it('limite la longueur à 200 caractères', () => {
    const long = 'a'.repeat(300) + '.pdf'
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200)
  })
  it('préserve les noms normaux intacts', () => {
    expect(sanitizeFilename('rapport-2026.pdf')).toBe('rapport-2026.pdf')
  })
})

describe('isAllowedMimeType', () => {
  it('accepte application/pdf', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true)
  })
  it('accepte image/png', () => {
    expect(isAllowedMimeType('image/png')).toBe(true)
  })
  it('rejette application/x-executable', () => {
    expect(isAllowedMimeType('application/x-executable')).toBe(false)
  })
  it('rejette text/html', () => {
    expect(isAllowedMimeType('text/html')).toBe(false)
  })
})

describe('isAllowedFileSize', () => {
  it('accepte un fichier de 1 octet', () => {
    expect(isAllowedFileSize(1)).toBe(true)
  })
  it('accepte un fichier de 10 Mo exactement', () => {
    expect(isAllowedFileSize(MAX_UPLOAD_BYTES)).toBe(true)
  })
  it('rejette un fichier de 10 Mo + 1 octet', () => {
    expect(isAllowedFileSize(MAX_UPLOAD_BYTES + 1)).toBe(false)
  })
  it('rejette 0 octet', () => {
    expect(isAllowedFileSize(0)).toBe(false)
  })
})
```

- [ ] **Step 3 : Lancer les tests**

```bash
npx vitest run lib/validation.test.ts 2>&1
```
Expected : 16 tests PASS

- [ ] **Step 4 : Mettre à jour `lib/security.ts` pour réutiliser `isValidEmail`**

Dans `lib/security.ts`, remplacer :
```typescript
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}
```

Par :
```typescript
export { isValidEmail } from './validation'
```

Vérifier que les imports dans le reste du code (`app/api/waitlist/route.ts`) pointent vers `@/lib/security` ou `@/lib/validation` — les deux exportent `isValidEmail` maintenant.

- [ ] **Step 5 : Compiler et relancer tous les tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1
```
Expected : 0 erreur TypeScript, tous les tests PASS

- [ ] **Step 6 : Commit**

```bash
git add lib/validation.ts lib/validation.test.ts lib/security.ts
git commit -m "test: validation — email, sanitizeFilename, MIME types, taille fichier"
```

---

### Task 4 : Tests de `api-response`

**Files:**
- Create: `lib/api-response.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/api-response.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { apiError, apiOk } from './api-response'

describe('apiError', () => {
  it('retourne le bon status HTTP', async () => {
    const res = apiError('Not found', 404)
    expect(res.status).toBe(404)
  })

  it('retourne un body JSON avec le champ error', async () => {
    const res = apiError('Unauthorized', 401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('retourne le Content-Type application/json', () => {
    const res = apiError('Bad request', 400)
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('apiOk', () => {
  it('retourne 200 par défaut', async () => {
    const res = apiOk({ ok: true })
    expect(res.status).toBe(200)
  })

  it('retourne le body JSON passé', async () => {
    const res = apiOk({ items: [1, 2, 3] })
    const body = await res.json()
    expect(body).toEqual({ items: [1, 2, 3] })
  })

  it('accepte un status personnalisé', async () => {
    const res = apiOk({ created: true }, 201)
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2 : Lancer les tests**

```bash
npx vitest run lib/api-response.test.ts 2>&1
```
Expected : 6 tests PASS

- [ ] **Step 3 : Relancer la suite complète**

```bash
npx vitest run 2>&1 | tail -10
```
Expected : tous les tests PASS, aucun FAIL

- [ ] **Step 4 : Commit**

```bash
git add lib/api-response.test.ts
git commit -m "test: api-response — status, body, Content-Type"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
