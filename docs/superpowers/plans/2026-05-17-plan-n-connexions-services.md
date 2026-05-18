# Plan N — Connexions Services

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Débloquer les appels vers n8n et Ollama depuis le réseau privé, ajouter `n8n_base_url`/`n8n_api_key` dans `user_settings`, ajouter la colonne `model` dans `agent_configs`, et exposer une route API pour lister les workflows n8n.

**Architecture:** Le SSRF guard actuel bloque tous les ranges privés incluant `192.168.x` où vivent Ollama et n8n. On introduit une whitelist explicite d'IPs de confiance configurée via env var `TRUSTED_PRIVATE_HOSTS`. La colonne `model` est ajoutée à `agent_configs` via migration. La route `GET /api/studio/n8n/workflows` proxy l'API n8n avec la clé stockée dans `user_settings`.

**Tech Stack:** Next.js 15 Route Handlers, Supabase (migration + anon client), TypeScript strict, `lib/security.ts` existant, `lib/supabase-admin.ts` singleton.

**Dépendances :** Aucune — ce plan est le prérequis des Plans O et P.

---

## Fichiers modifiés

| Fichier                                                   | Action                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| `lib/security.ts`                                         | Modifier — whitelist TRUSTED_PRIVATE_HOSTS   |
| `supabase/migrations/20260517_plan_n_agent_model_n8n.sql` | Créer — colonne model + n8n settings         |
| `app/api/studio/n8n/workflows/route.ts`                   | Créer — proxy GET workflows n8n              |
| `app/studio/settings/page.tsx`                            | Modifier — champs n8n_base_url + n8n_api_key |

---

### Task 1 : SSRF whitelist pour hosts privés de confiance

**Files:**

- Modify: `lib/security.ts`

**Contexte :** `isAllowedWebhookUrl` et `isAllowedOllamaUrl` bloquent `192.168.x` via la regex SSRF. Ollama est sur `192.168.0.14:11434` et n8n sur `192.168.0.19:5678`. On ajoute une env var `TRUSTED_PRIVATE_HOSTS` (liste CSV de hostnames/IPs autorisés explicitement) qui court-circuite le blocage SSRF pour ces hôtes précis. Côté client (browser), ces appels ne passent jamais — seules les routes API serveur appellent Ollama/n8n, donc la whitelist est côté serveur uniquement.

- [ ] **Step 1 : Modifier `lib/security.ts`**

Remplacer le contenu complet par :

```typescript
// lib/security.ts

function getTrustedHosts(): Set<string> {
  const raw = process.env.TRUSTED_PRIVATE_HOSTS ?? ''
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false

    // Whitelist explicite pour hosts privés de confiance (n8n, etc.)
    if (getTrustedHosts().has(hostname.toLowerCase())) return true

    const SSRF_BLOCKED =
      /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[::ffff:|fc00:|fd[0-9a-f]{2}:|0x)/i
    if (SSRF_BLOCKED.test(hostname)) return false
    if (/^\d+$/.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedOllamaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false

    // Whitelist explicite pour Ollama (réseau privé de confiance)
    if (getTrustedHosts().has(hostname.toLowerCase())) return true

    const SSRF_BLOCKED =
      /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[::ffff:|fc00:|fd[0-9a-f]{2}:|0x)/i
    if (SSRF_BLOCKED.test(hostname)) return false
    if (/^\d+$/.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export { isValidEmail } from './validation'
```

- [ ] **Step 2 : Ajouter `TRUSTED_PRIVATE_HOSTS` dans `.env.local`**

Ouvrir `.env.local` et ajouter à la fin :

```bash
# IPs privées de confiance (Ollama, n8n, etc.) — séparées par virgule
TRUSTED_PRIVATE_HOSTS=192.168.0.14,192.168.0.19
```

- [ ] **Step 3 : Ajouter dans `.env.example`**

```bash
# IPs/hostnames privés autorisés pour webhooks et Ollama (séparés par virgule)
TRUSTED_PRIVATE_HOSTS=192.168.0.14,192.168.0.19
```

- [ ] **Step 4 : Vérifier le test de sécurité existant**

```bash
npx vitest run lib/security.test.ts 2>&1 | tail -10
```

Expected : tous les tests passent (les IPs de la whitelist ne sont pas dans les tests existants — vérifier).

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add lib/security.ts .env.example
git commit -m "fix(security): TRUSTED_PRIVATE_HOSTS whitelist pour Ollama et n8n réseau privé"
```

---

### Task 2 : Migration — colonne `model` dans `agent_configs` + colonnes n8n dans `user_settings`

**Files:**

- Create: `supabase/migrations/20260517_plan_n_agent_model_n8n.sql`

**Contexte :** La table `agent_configs` n'a pas de colonne `model` (l'UI `TunePanel` permet de choisir un modèle mais ne peut pas le sauvegarder). La table `user_settings` n'a pas `n8n_base_url` ni `n8n_api_key`.

- [ ] **Step 1 : Créer la migration**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260517_plan_n_agent_model_n8n.sql` :

```sql
-- Colonne model dans agent_configs (manquante alors que l'UI la gère)
ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'qwen3:8b';

-- Colonnes n8n dans user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS n8n_base_url  text,
  ADD COLUMN IF NOT EXISTS n8n_api_key   text;
```

- [ ] **Step 2 : Appliquer en production**

```bash
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local

curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(cat /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260517_plan_n_agent_model_n8n.sql | tr '\n' ' ' | sed 's/\"/\\\"/g')\"}"
```

Expected : réponse sans champ `error`.

- [ ] **Step 3 : Vérifier**

```bash
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local

curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name IN ('\''agent_configs'\'', '\''user_settings'\'') AND column_name IN ('\''model'\'', '\''n8n_base_url'\'', '\''n8n_api_key'\'') ORDER BY table_name, column_name"}'
```

Expected : 3 lignes — `model` (agent_configs), `n8n_api_key` (user_settings), `n8n_base_url` (user_settings).

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260517_plan_n_agent_model_n8n.sql
git commit -m "feat(database): colonne model dans agent_configs + n8n_base_url/n8n_api_key dans user_settings"
```

---

### Task 3 : Route `GET /api/studio/n8n/workflows`

**Files:**

- Create: `app/api/studio/n8n/workflows/route.ts`

**Contexte :** La page automations doit pouvoir lister les workflows n8n réels. On crée une route proxy qui lit `n8n_base_url` et `n8n_api_key` depuis `user_settings` de l'utilisateur, puis appelle l'API n8n `GET /api/v1/workflows`. Si aucune config n8n n'est présente, retourne une liste vide.

- [ ] **Step 1 : Créer la route**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/n8n/workflows/route.ts` :

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { isAllowedWebhookUrl } from '@/lib/security'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data: settings } = await supabase
    .from('user_settings')
    .select('n8n_base_url, n8n_api_key')
    .eq('user_id', user!.id)
    .maybeSingle()

  const baseUrl = settings?.n8n_base_url?.replace(/\/$/, '')
  if (!baseUrl) return NextResponse.json([])

  if (!isAllowedWebhookUrl(`${baseUrl}/api/v1/workflows`)) {
    return apiError('URL n8n non autorisée', 400)
  }

  try {
    const resp = await fetch(`${baseUrl}/api/v1/workflows?limit=50`, {
      headers: {
        'X-N8N-API-KEY': settings?.n8n_api_key ?? '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!resp.ok) {
      return apiError(`n8n erreur ${resp.status}`, 502)
    }

    const json = (await resp.json()) as { data?: unknown[] }
    return NextResponse.json(json.data ?? [])
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'n8n timeout' : 'n8n injoignable'
    return apiError(msg, 502)
  }
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/n8n/workflows/route.ts
git commit -m "feat(n8n): route GET /api/studio/n8n/workflows — proxy API n8n authentifié"
```

---

### Task 4 : Champs n8n + model dans la page Settings

**Files:**

- Modify: `app/studio/settings/page.tsx`

**Contexte :** La page settings charge et sauvegarde `user_settings`. Il faut ajouter deux champs : `n8n_base_url` (URL de l'instance n8n) et `n8n_api_key` (clé API n8n). Chercher la section Ollama comme modèle — elle a un champ texte + un select modèle sauvegardés via `supabase.from('user_settings').upsert()`. Ajouter la section n8n juste après.

- [ ] **Step 1 : Lire la section settings existante**

```bash
grep -n "ollama\|n8n\|upsert\|useState\|settings\b" \
  /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/settings/page.tsx | head -40
```

- [ ] **Step 2 : Ajouter les states n8n**

Dans le composant principal, localiser les `useState` pour Ollama (ex: `ollamaUrl`, `ollamaModel`). Ajouter juste après :

```typescript
const [n8nUrl, setN8nUrl] = useState('')
const [n8nKey, setN8nKey] = useState('')
```

- [ ] **Step 3 : Charger n8n depuis user_settings**

Dans le `useEffect` qui charge les settings (chercher `.from('user_settings').select`), ajouter dans le bloc `if (data)` :

```typescript
setN8nUrl(data.n8n_base_url ?? '')
setN8nKey(data.n8n_api_key ?? '')
```

- [ ] **Step 4 : Sauvegarder n8n dans le upsert**

Dans la fonction de sauvegarde (chercher `upsert` ou `update` sur `user_settings`), ajouter dans l'objet de données :

```typescript
n8n_base_url: n8nUrl.trim() || null,
n8n_api_key:  n8nKey.trim() || null,
```

- [ ] **Step 5 : Ajouter le bloc UI n8n**

Trouver la section Ollama dans le JSX (un `<div>` avec le label "Ollama"). Ajouter un bloc identique juste après pour n8n :

```tsx
{
  /* Section n8n */
}
;<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
  <div
    style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: muted,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
    }}
  >
    n8n — Automations
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, marginBottom: 4 }}>
        Base URL
      </div>
      <input
        className="ck-input"
        value={n8nUrl}
        onChange={(e) => setN8nUrl(e.target.value)}
        placeholder="http://192.168.0.19:5678"
        style={{ width: '100%' }}
      />
    </div>
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, marginBottom: 4 }}>
        API Key
      </div>
      <input
        className="ck-input"
        type="password"
        value={n8nKey}
        onChange={(e) => setN8nKey(e.target.value)}
        placeholder="n8n_api_key_…"
        style={{ width: '100%' }}
      />
    </div>
  </div>
</div>
```

- [ ] **Step 6 : Fixer la colonne `model` dans `TunePanel` (agents/page.tsx)**

Ouvrir `app/studio/agents/page.tsx`. Dans `TunePanel`, la fonction `save()` fait un `upsert` sur `agent_configs` mais n'inclut pas `model` dans le payload. Ajouter `model: cfg.model` dans l'objet upsert :

```typescript
const { error } = await supabase.from('agent_configs').upsert(
  {
    user_id: user.id,
    agent_id: agentId,
    ...cfg,
  },
  { onConflict: 'user_id,agent_id' }
)
```

`...cfg` inclut déjà `model` depuis `AgentConfig` — vérifier que l'interface inclut `model` :

```typescript
interface AgentConfig {
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
}
```

Si `model` est déjà dans l'interface, l'upsert fonctionne sans modification. Vérifier simplement que c'est le cas.

- [ ] **Step 7 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 8 : Commit**

```bash
git add app/studio/settings/page.tsx app/studio/agents/page.tsx
git commit -m "feat(settings): champs n8n_base_url + n8n_api_key — fix model dans agent_configs upsert"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
