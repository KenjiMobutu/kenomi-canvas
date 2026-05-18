# Plan J — Qualité DX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Améliorer la qualité du code pour les développeurs : scripts `lint`, `typecheck`, `format` dans `package.json` ; abstraction du streaming chat en un hook réutilisable ; validation et sanitisation des uploads dans `documents/page.tsx`.

**Architecture:** Trois tâches indépendantes. ESLint + Prettier configurés pour Next.js. Le streaming SSE est extrait dans `lib/use-stream-chat.ts` (hook React). L'upload dans `documents/page.tsx` utilise les fonctions de `lib/validation.ts` (créé en Plan I).

**Tech Stack:** ESLint 9 (flat config), Prettier, React 19 hooks, TypeScript.

**Dépendance :** Plan I doit être exécuté avant cette tâche (Task 3 utilise `lib/validation.ts`).

---

## Fichiers modifiés

| Fichier                         | Action                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `package.json`                  | Modifier — ajouter scripts lint, typecheck, format        |
| `eslint.config.mjs`             | Créer — config ESLint flat avec Next.js                   |
| `.prettierrc`                   | Créer — config Prettier                                   |
| `lib/use-stream-chat.ts`        | Créer — hook streaming SSE réutilisable                   |
| `app/studio/documents/page.tsx` | Modifier — validation upload MIME + taille + sanitisation |

---

### Task 1 : Scripts lint, typecheck, format

**Files:**

- Modify: `package.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc`

- [ ] **Step 1 : Installer les dépendances dev**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npm install --save-dev eslint @eslint/eslintrc eslint-config-next prettier 2>&1 | tail -5
```

Expected : pas d'erreur npm

- [ ] **Step 2 : Créer `eslint.config.mjs`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/eslint.config.mjs` :

```javascript
import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]

export default config
```

- [ ] **Step 3 : Créer `.prettierrc`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.prettierrc` :

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

- [ ] **Step 4 : Mettre à jour `package.json`**

Dans la section `"scripts"` de `package.json`, ajouter :

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "postinstall": "prisma generate",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\" --ignore-path .gitignore",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\" --ignore-path .gitignore"
  }
}
```

- [ ] **Step 5 : Vérifier que lint passe**

```bash
npm run lint 2>&1 | tail -20
```

Expected : 0 erreur (des warnings sont acceptables)

- [ ] **Step 6 : Vérifier que typecheck passe**

```bash
npm run typecheck 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 7 : Commit**

```bash
git add package.json eslint.config.mjs .prettierrc package-lock.json
git commit -m "feat(dx): scripts lint, typecheck, format + ESLint + Prettier"
```

---

### Task 2 : Extraire le streaming SSE dans un hook

**Files:**

- Create: `lib/use-stream-chat.ts`

**Contexte :** La logique de streaming SSE (lecture du `ReadableStream`, parsing `data: ...`, accumulation du texte) est dupliquée entre `handleSend` et `newConvAndSend` dans `app/studio/chat/page.tsx`. On l'extrait dans un hook React réutilisable.

- [ ] **Step 1 : Créer `lib/use-stream-chat.ts`**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/use-stream-chat.ts` :

```typescript
'use client'
import { useCallback, useRef } from 'react'

export interface StreamChatOptions {
  onToken: (token: string, fullContent: string) => void
  onDone: () => void
  onError: (message: string) => void
}

/**
 * Hook qui expose une fonction `streamChat` pour envoyer un message
 * et recevoir la réponse en streaming SSE depuis /api/studio/chat.
 */
export function useStreamChat({ onToken, onDone, onError }: StreamChatOptions) {
  const abortRef = useRef<AbortController | null>(null)

  const streamChat = useCallback(
    async (conversationId: string, message: string, agentId?: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let full = ''

      try {
        const res = await fetch('/api/studio/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, message, agentId }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          onError('Erreur chat')
          onDone()
          return
        }

        const reader = res.body.getReader()
        const dec = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = dec.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            const t = line.trim()
            if (!t.startsWith('data: ')) continue
            const raw = t.slice(6)
            if (raw === '[DONE]') break
            try {
              const token = JSON.parse(raw) as string
              full += token
              onToken(token, full)
            } catch {
              // ligne non-JSON — ignorer
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          onError((e as Error).message)
        }
      }

      onDone()
    },
    [onToken, onDone, onError]
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { streamChat, abort }
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add lib/use-stream-chat.ts
git commit -m "refactor(chat): extraire le streaming SSE dans useStreamChat"
```

**Note :** La migration de `chat/page.tsx` pour utiliser ce hook est optionnelle dans ce plan — le hook est disponible pour les futures pages ou une refonte UI. Forcer le refactor complet de `chat/page.tsx` maintenant ajouterait un risque de régression sans bénéfice immédiat mesurable.

---

### Task 3 : Validation upload dans `documents/page.tsx`

**Files:**

- Modify: `app/studio/documents/page.tsx`

**Contexte :** La fonction `upload` accepte n'importe quel fichier sans vérification de taille, de type MIME, ni sanitisation du nom. Un fichier de 500 Mo ou un `.exe` peut être uploadé. Cette tâche dépend de `lib/validation.ts` créé en **Plan I Task 3**.

- [ ] **Step 1 : Modifier `documents/page.tsx`**

Ouvrir `app/studio/documents/page.tsx`. Ajouter l'import en tête du fichier :

```typescript
import {
  isAllowedMimeType,
  isAllowedFileSize,
  sanitizeFilename,
  MAX_UPLOAD_BYTES,
} from '@/lib/validation'
```

Remplacer la fonction `upload` existante par :

```typescript
async function upload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file || !user) return

  // Validation taille
  if (!isAllowedFileSize(file.size)) {
    toast.error(`Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`)
    if (fileRef.current) fileRef.current.value = ''
    return
  }

  // Validation MIME
  if (!isAllowedMimeType(file.type)) {
    toast.error(`Type de fichier non autorisé : ${file.type || 'inconnu'}`)
    if (fileRef.current) fileRef.current.value = ''
    return
  }

  setUploading(true)
  const safeName = sanitizeFilename(file.name)
  const path = `${user.id}/${Date.now()}_${safeName}`

  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) {
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    return toast.error(error.message)
  }

  await supabase.from('documents').insert({
    user_id: user.id,
    name: safeName,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
  })

  setUploading(false)
  if (fileRef.current) fileRef.current.value = ''
  toast.success('Document uploadé')
  load()
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/studio/documents/page.tsx
git commit -m "fix(documents): validation MIME + taille + sanitisation nom de fichier à l'upload"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
