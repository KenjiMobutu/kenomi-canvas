# Plan K — Sécurité & Données

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter la couche données et sécurité du MVP prod : table `automation_runs` avec historique des triggers, rate limiting sur chat et trigger, et check `storage` dans `/api/health`.

**Architecture:** La table `automation_runs` est créée via une migration Supabase et la route `/api/studio/automations/trigger/route.ts` est modifiée pour y insérer une ligne après chaque trigger. Le rate limiting suit le pattern existant de `lib/rate-limit.ts`. Le health check étend `app/api/health/route.ts` avec un ping sur le bucket `documents`.

**Tech Stack:** Next.js 15 Route Handlers, Supabase (service role + anon), TypeScript strict, `lib/rate-limit.ts` existant, `lib/api-response.ts` existant.

---

## Fichiers modifiés

| Fichier                                                   | Action                                               |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `supabase/migrations/20260516_plan_k_automation_runs.sql` | Créer — table automation_runs + RLS                  |
| `app/api/studio/automations/trigger/route.ts`             | Modifier — insérer dans automation_runs + rate limit |
| `app/api/studio/chat/route.ts`                            | Modifier — rate limit 20 messages/min par user       |
| `app/api/health/route.ts`                                 | Modifier — ajouter check storage bucket documents    |

---

### Task 1 : Table `automation_runs`

**Files:**

- Create: `supabase/migrations/20260516_plan_k_automation_runs.sql`

- [ ] **Step 1 : Créer la migration**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260516_plan_k_automation_runs.sql` :

```sql
-- Table des runs d'automation avec historique complet
CREATE TABLE IF NOT EXISTS automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id     uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  http_status     int,
  duration_ms     int,
  error_message   text,
  triggered_at    timestamptz NOT NULL DEFAULT now()
);

-- Index pour requêtes par workflow (liste des runs récents)
CREATE INDEX IF NOT EXISTS automation_runs_workflow_id_idx
  ON automation_runs (workflow_id, triggered_at DESC);

-- Index pour requêtes par user (vue globale)
CREATE INDEX IF NOT EXISTS automation_runs_user_id_idx
  ON automation_runs (user_id, triggered_at DESC);

-- RLS
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_runs_own"
  ON automation_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2 : Appliquer la migration en production**

La migration doit être appliquée via l'API REST de Supabase self-hosted. Utilise la commande suivante (remplacer les valeurs par celles du projet) :

```bash
# Lire la valeur SUPABASE_URL depuis .env.local
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local 2>/dev/null || true

# Appliquer via l'API Supabase admin
curl -s -X POST "${SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(cat /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260516_plan_k_automation_runs.sql | tr '\n' ' ' | sed 's/\"/\\\"/g')\"}"
```

Expected : `[{"command":"CREATE"},{"command":"CREATE"},{"command":"CREATE"},{"command":"ALTER"},{"command":"CREATE"}]` ou similaire sans champ `error`.

- [ ] **Step 3 : Vérifier que la table existe**

```bash
curl -s -X POST "${SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''automation_runs'\'' ORDER BY ordinal_position"}'
```

Expected : liste des colonnes id, user_id, workflow_id, status, http_status, duration_ms, error_message, triggered_at.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260516_plan_k_automation_runs.sql
git commit -m "feat(database): table automation_runs — historique des triggers"
```

---

### Task 2 : Insérer dans `automation_runs` lors du trigger

**Files:**

- Modify: `app/api/studio/automations/trigger/route.ts`

**Contexte :** La route actuelle incrémente `run_count` et `last_run_at` mais n'enregistre pas de ligne de run. On ajoute un insert dans `automation_runs` après chaque tentative de trigger (succès, erreur, timeout), et on ajoute un rate limit de 10 triggers/min par user pour éviter les spams de webhook.

- [ ] **Step 1 : Lire le fichier actuel**

```bash
cat /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/automations/trigger/route.ts
```

- [ ] **Step 2 : Remplacer le contenu complet**

Remplacer `app/api/studio/automations/trigger/route.ts` par :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedWebhookUrl } from '@/lib/security'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`automation-trigger:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de triggers. Réessayez dans une minute.', 429)
  }

  let id: string
  try {
    const body = await req.json()
    id = body.id ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!id) return apiError('id required', 400)

  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('webhook_url, run_count')
    .eq('id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!wf) return apiError('Not found', 404)

  const startMs = Date.now()

  // Tenter le webhook si configuré
  let status: 'success' | 'error' | 'timeout' = 'success'
  let httpStatus: number | null = null
  let errorMessage: string | null = null

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
      httpStatus = resp.status
      if (!resp.ok) {
        status = 'error'
        errorMessage = `HTTP ${resp.status}`
      }
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'TimeoutError'
      status = isTimeout ? 'timeout' : 'error'
      errorMessage = isTimeout ? 'Webhook timeout (8s)' : 'Webhook injoignable'
    }
  }

  const durationMs = Date.now() - startMs

  // Insérer le run dans l'historique (fire and forget — ne bloque pas la réponse)
  const runInsert = supabase.from('automation_runs').insert({
    user_id: user!.id,
    workflow_id: id,
    status,
    http_status: httpStatus,
    duration_ms: durationMs,
    error_message: errorMessage,
  })

  // Mettre à jour run_count + last_run_at
  const wfUpdate = supabase
    .from('automation_workflows')
    .update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user!.id)

  await Promise.all([runInsert, wfUpdate])

  if (status !== 'success') {
    return NextResponse.json({ error: errorMessage }, { status: status === 'timeout' ? 504 : 502 })
  }

  return NextResponse.json({ ok: true, durationMs })
}
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 4 : Commit**

```bash
git add app/api/studio/automations/trigger/route.ts
git commit -m "feat(automations): historique runs dans automation_runs + rate limit 10/min"
```

---

### Task 3 : Rate limit sur le chat

**Files:**

- Modify: `app/api/studio/chat/route.ts`

**Contexte :** Le chat est protégé par `requireAllowedUser()` mais n'a pas de rate limit. On ajoute 20 messages/min par user pour éviter l'abus d'Ollama (chaque message déclenche un appel Ollama avec timeout 30s).

- [ ] **Step 1 : Ajouter l'import et le check rate limit**

Dans `app/api/studio/chat/route.ts`, après les imports existants, ajouter :

```typescript
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
```

Puis, juste après la ligne `if (response) return response` (vérification auth), insérer :

```typescript
if (isRateLimited(`chat:${user!.id}`, { limit: 20, windowMs: 60_000 })) {
  return apiError('Trop de messages. Réessayez dans une minute.', 429)
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/chat/route.ts
git commit -m "fix(security): rate limit 20 messages/min sur le chat"
```

---

### Task 4 : Check storage dans `/api/health`

**Files:**

- Modify: `app/api/health/route.ts`

**Contexte :** Le healthcheck actuel vérifie env, Prisma et Supabase Auth, mais pas le Storage. Le spec exige un check du bucket `documents`. On utilise `supabaseAdmin` pour lister les fichiers à la racine du bucket — si le bucket est accessible, la réponse est OK même si la liste est vide.

- [ ] **Step 1 : Ajouter le check storage**

Dans `app/api/health/route.ts`, après le bloc `// 3. Supabase Auth`, ajouter :

```typescript
// 4. Storage bucket documents
const stStart = Date.now()
try {
  const { error: stError } = await supabaseAdmin.storage.from('documents').list('', { limit: 1 })
  checks.storage = {
    ok: !stError,
    latencyMs: Date.now() - stStart,
    ...(stError
      ? { error: process.env.NODE_ENV === 'production' ? 'storage check failed' : stError.message }
      : {}),
  }
} catch (e) {
  checks.storage = {
    ok: false,
    latencyMs: Date.now() - stStart,
    error: process.env.NODE_ENV === 'production' ? 'storage check failed' : (e as Error).message,
  }
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Vérifier la réponse du health check en dev**

```bash
# Démarrer le serveur en arrière-plan si pas déjà démarré
# curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Expected : JSON avec `checks.storage` présent, `ok: true` si le bucket existe.

- [ ] **Step 4 : Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat(ops): /api/health — ajout check storage bucket documents"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
