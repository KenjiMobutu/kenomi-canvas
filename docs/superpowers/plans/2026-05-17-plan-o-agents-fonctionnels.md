# Plan O — Agents Fonctionnels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les boutons Run/Pause/Logs des agents fonctionnels, charger les données agents (level, xp, runs) depuis `agent_configs` en DB plutôt que les valeurs hardcodées dans `lib/studio-utils.ts`, et connecter ServiceHealth automations à de vrais pings.

**Architecture:** Une route `POST /api/studio/agents/run` déclenche un appel Ollama avec le system_prompt et le modèle configurés pour l'agent. L'état `paused` est persisté dans `agent_configs.paused` (nouvelle colonne). Les logs sont les 10 derniers messages du chat de l'agent (table `messages` filtrée par `agent_id`). Le ServiceHealth appelle `/api/studio/services/health` qui ping n8n, Ollama et Supabase en parallèle.

**Tech Stack:** Next.js 15 Route Handlers, Supabase anon + service role, Ollama REST API, TypeScript strict.

**Dépendance :** Plan N doit être exécuté avant (TRUSTED_PRIVATE_HOSTS, colonne model, n8n_base_url).

---

## Fichiers modifiés

| Fichier                                               | Action                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `supabase/migrations/20260517_plan_o_agent_state.sql` | Créer — colonne paused + run_count + last_run_at dans agent_configs |
| `app/api/studio/agents/run/route.ts`                  | Créer — POST déclenche une mission Ollama                           |
| `app/api/studio/services/health/route.ts`             | Créer — GET ping n8n + Ollama + Supabase                            |
| `app/studio/agents/page.tsx`                          | Modifier — Run/Pause/Logs fonctionnels + charger depuis DB          |
| `app/studio/automations/page.tsx`                     | Modifier — ServiceHealth utilise la vraie route                     |

---

### Task 1 : Migration — état agent dans `agent_configs`

**Files:**

- Create: `supabase/migrations/20260517_plan_o_agent_state.sql`

**Contexte :** `agent_configs` stocke la config mais pas l'état d'exécution. On ajoute `paused` (booléen), `run_count` (entier), `last_run_at` (timestamptz) pour que l'UI puisse afficher un état réel.

- [ ] **Step 1 : Créer la migration**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260517_plan_o_agent_state.sql` :

```sql
ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS paused       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS run_count    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at  timestamptz;
```

- [ ] **Step 2 : Appliquer en production**

```bash
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local

curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(cat /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260517_plan_o_agent_state.sql | tr '\n' ' ' | sed 's/\"/\\\"/g')\"}"
```

Expected : réponse sans champ `error`.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260517_plan_o_agent_state.sql
git commit -m "feat(database): paused + run_count + last_run_at dans agent_configs"
```

---

### Task 2 : Route `POST /api/studio/agents/run`

**Files:**

- Create: `app/api/studio/agents/run/route.ts`

**Contexte :** Quand l'utilisateur clique "▶ Run mission", on appelle cette route avec `{ agentId, prompt }`. La route lit la config de l'agent depuis `agent_configs` (model, system_prompt, temperature, max_tokens), appelle Ollama en mode non-streaming (timeout 30s), sauvegarde la réponse dans `messages` (table existante, `role: 'assistant'`, `agent_id`), incrémente `run_count` et met à jour `last_run_at`.

Si aucun `prompt` n'est fourni, on utilise le `system_prompt` configuré comme prompt de test ("Confirme que tu es opérationnel et décris ta mission en 1 phrase.").

- [ ] **Step 1 : Créer la route**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/agents/run/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { isAllowedOllamaUrl } from '@/lib/security'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`agent-run:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de runs. Réessayez dans une minute.', 429)
  }

  let agentId: string, prompt: string
  try {
    const body = await req.json()
    agentId = body.agentId ?? ''
    prompt = body.prompt ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!agentId) return apiError('agentId requis', 400)

  // Charger config agent
  const { data: cfg } = await supabase
    .from('agent_configs')
    .select('model, system_prompt, temperature, max_tokens, paused')
    .eq('user_id', user!.id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (cfg?.paused) return apiError('Agent en pause', 409)

  // Charger URL Ollama depuis user_settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('ollama_base_url')
    .eq('user_id', user!.id)
    .maybeSingle()

  const baseUrl = (settings?.ollama_base_url ?? 'http://192.168.0.14:11434').replace(/\/$/, '')
  if (!isAllowedOllamaUrl(baseUrl)) return apiError('URL Ollama non autorisée', 400)

  const model = cfg?.model ?? 'qwen3:8b'
  const systemPrompt =
    cfg?.system_prompt ??
    `Tu es l'agent ${agentId}. Tu es opérationnel et prêt à exécuter des missions.`
  const userPrompt = prompt || 'Confirme que tu es opérationnel et décris ta mission en 1 phrase.'

  const startMs = Date.now()

  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        think: false,
        options: {
          temperature: cfg?.temperature ?? 0.7,
          num_predict: cfg?.max_tokens ?? 512,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      return apiError(`Ollama ${resp.status}`, 502)
    }

    const json = (await resp.json()) as { message?: { content?: string } }
    const content = json.message?.content ?? ''
    const durationMs = Date.now() - startMs

    // Persister la réponse dans messages
    await supabase.from('messages').insert({
      user_id: user!.id,
      role: 'assistant',
      content,
      agent_id: agentId,
    })

    // Mettre à jour run_count + last_run_at
    const { data: currentCfg } = await supabase
      .from('agent_configs')
      .select('run_count')
      .eq('user_id', user!.id)
      .eq('agent_id', agentId)
      .maybeSingle()

    await supabase.from('agent_configs').upsert(
      {
        user_id: user!.id,
        agent_id: agentId,
        run_count: (currentCfg?.run_count ?? 0) + 1,
        last_run_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,agent_id' }
    )

    return NextResponse.json({ ok: true, content, durationMs, model })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'TimeoutError'
    return apiError(isTimeout ? 'Ollama timeout (30s)' : 'Ollama injoignable', 502)
  }
}
```

- [ ] **Step 2 : Vérifier que la colonne `agent_id` existe dans `messages`**

```bash
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''messages'\'' ORDER BY ordinal_position"}'
```

Si `agent_id` n'existe pas, créer une migration rapide :

```bash
source /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/.env.local
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id text"}'
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/api/studio/agents/run/route.ts
git commit -m "feat(agents): route POST /api/studio/agents/run — déclenche mission Ollama"
```

---

### Task 3 : Route `GET /api/studio/services/health`

**Files:**

- Create: `app/api/studio/services/health/route.ts`

**Contexte :** Le `ServiceHealth` dans la page automations affiche des statuts hardcodés. On crée une route qui ping en parallèle : Ollama (`/api/tags`), n8n (`/healthz`), et Supabase (déjà vérifié dans `/api/health`). Retourne un objet `{ ollama: bool, n8n: bool, latencies: {...} }`.

- [ ] **Step 1 : Créer la route**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/services/health/route.ts` :

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedOllamaUrl, isAllowedWebhookUrl } from '@/lib/security'

async function pingUrl(url: string, timeoutMs = 4000): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { ok: resp.ok, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data: settings } = await supabase
    .from('user_settings')
    .select('ollama_base_url, n8n_base_url')
    .eq('user_id', user!.id)
    .maybeSingle()

  const ollamaBase = (settings?.ollama_base_url ?? 'http://192.168.0.14:11434').replace(/\/$/, '')
  const n8nBase = settings?.n8n_base_url?.replace(/\/$/, '') ?? null

  const checks: Record<string, { ok: boolean; latencyMs: number } | { ok: false; error: string }> =
    {}

  // Ping Ollama
  if (isAllowedOllamaUrl(ollamaBase)) {
    checks.ollama = await pingUrl(`${ollamaBase}/api/tags`)
  } else {
    checks.ollama = { ok: false, error: 'URL non autorisée' }
  }

  // Ping n8n
  if (n8nBase && isAllowedWebhookUrl(n8nBase)) {
    checks.n8n = await pingUrl(`${n8nBase}/healthz`)
  } else if (!n8nBase) {
    checks.n8n = { ok: false, error: 'Non configuré' }
  } else {
    checks.n8n = { ok: false, error: 'URL non autorisée' }
  }

  return NextResponse.json(checks)
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/services/health/route.ts
git commit -m "feat(services): route GET /api/studio/services/health — ping Ollama + n8n"
```

---

### Task 4 : Page agents — Run/Pause/Logs fonctionnels + données DB

**Files:**

- Modify: `app/studio/agents/page.tsx`

**Contexte :** Les boutons Run/Pause/Logs n'ont pas d'`onClick`. Les stats (runs, win%, avg) sont calculées à partir de `agent.xp` hardcodé. On ajoute :

1. `onClick` sur Run → `POST /api/studio/agents/run`
2. `onClick` sur Pause → `supabase.from('agent_configs').upsert({ paused: !current })`
3. `onClick` sur LOGS → modal avec les 10 derniers messages de l'agent depuis `messages`
4. Chargement des `agent_configs` depuis DB pour `run_count`, `last_run_at`, `paused`

- [ ] **Step 1 : Ajouter l'interface `DbAgentState` et le state dans `AgentInspector`**

Dans `app/studio/agents/page.tsx`, ajouter juste après `const DEFAULT_CONFIG` :

```typescript
interface DbAgentState {
  run_count: number
  last_run_at: string | null
  paused: boolean
}
```

- [ ] **Step 2 : Modifier `AgentInspector` pour charger et afficher l'état DB**

Remplacer la signature de `AgentInspector` et son contenu pour charger l'état depuis `agent_configs` :

```typescript
function AgentInspector({ agent, activity, queue }: { agent: AgentData; activity: number[]; queue: string[] }) {
  const { user } = useAuth()
  const t = useTick(2400)
  const [tuneOpen, setTuneOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<{ role: string; content: string; created_at: string }[]>([])
  const [running, setRunning] = useState(false)
  const [dbState, setDbState] = useState<DbAgentState>({ run_count: 0, last_run_at: null, paused: false })

  // Charger état DB au changement d'agent
  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase.from('agent_configs')
      .select('run_count, last_run_at, paused')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDbState({ run_count: data.run_count ?? 0, last_run_at: data.last_run_at, paused: data.paused ?? false })
        else setDbState({ run_count: 0, last_run_at: null, paused: false })
      })
  }, [agent.id, user])

  async function handleRun() {
    setRunning(true)
    try {
      const res = await fetch('/api/studio/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erreur run agent')
      } else {
        toast.success(`${agent.name} — mission complète (${data.durationMs}ms)`)
        setDbState(s => ({ ...s, run_count: s.run_count + 1, last_run_at: new Date().toISOString() }))
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setRunning(false)
    }
  }

  async function handlePause() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const newPaused = !dbState.paused
    const { error } = await supabase.from('agent_configs').upsert({
      user_id: user.id, agent_id: agent.id, paused: newPaused,
    }, { onConflict: 'user_id,agent_id' })
    if (error) return toast.error(error.message)
    setDbState(s => ({ ...s, paused: newPaused }))
    toast.success(newPaused ? `${agent.name} mis en pause` : `${agent.name} réactivé`)
  }

  async function handleLogs() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setLogs(data ?? [])
    setLogsOpen(true)
  }
```

- [ ] **Step 3 : Mettre à jour les `StatBox` pour utiliser les données DB**

Remplacer le bloc `{/* Stats */}` dans `AgentInspector` :

```tsx
{
  /* Stats */
}
;<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
  <StatBox label="Runs" value={String(dbState.run_count)} color={agent.color} />
  <StatBox
    label="Status"
    value={dbState.paused ? 'PAUSÉ' : 'ACTIF'}
    color={dbState.paused ? '#fbbf24' : emerald}
  />
  <StatBox
    label="Last"
    value={
      dbState.last_run_at
        ? `${Math.round((Date.now() - new Date(dbState.last_run_at).getTime()) / 60000)}m`
        : '—'
    }
    color={cyan}
  />
  <StatBox label="LV" value={String(agent.level)} color={violet} />
</div>
```

- [ ] **Step 4 : Connecter les boutons Run/Pause/Logs**

Remplacer le bloc `{/* Controls */}` dans `AgentInspector` :

```tsx
{
  /* Controls */
}
;<div style={{ display: 'flex', gap: 8 }}>
  <button
    onClick={handleRun}
    disabled={running || dbState.paused}
    style={{
      flex: 1,
      padding: '10px 12px',
      borderRadius: 8,
      background: running || dbState.paused ? surface2 : agent.color,
      color: running || dbState.paused ? muted : '#0b0d12',
      border: 'none',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 12,
      letterSpacing: '.05em',
      cursor: running || dbState.paused ? 'not-allowed' : 'pointer',
    }}
  >
    {running ? '⏳ Running…' : '▶ Run mission'}
  </button>

  <button
    onClick={handlePause}
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: dbState.paused ? emerald + '22' : surface2,
      color: dbState.paused ? emerald : '#fbbf24',
      border: `1px solid ${dbState.paused ? emerald + '55' : line2}`,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '.14em',
      cursor: 'pointer',
    }}
  >
    {dbState.paused ? 'RESUME' : 'PAUSE'}
  </button>

  <button
    onClick={handleLogs}
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: logsOpen ? agent.color + '22' : surface2,
      color: logsOpen ? agent.color : text,
      border: `1px solid ${logsOpen ? agent.color + '55' : line2}`,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '.14em',
      cursor: 'pointer',
    }}
  >
    LOGS
  </button>

  <button
    onClick={() => setTuneOpen((o) => !o)}
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: tuneOpen ? agent.color + '22' : surface2,
      color: tuneOpen ? agent.color : text,
      border: `1px solid ${tuneOpen ? agent.color + '55' : line2}`,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '.14em',
      cursor: 'pointer',
    }}
  >
    TUNE
  </button>
</div>
```

- [ ] **Step 5 : Ajouter le panneau logs**

Juste avant `{tuneOpen && <TunePanel .../>}`, ajouter :

```tsx
{
  logsOpen && (
    <div
      style={{
        background: surface2,
        border: `1px solid ${line}`,
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          Derniers logs · {agent.name}
        </span>
        <button
          onClick={() => setLogsOpen(false)}
          style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      {logs.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted2 }}>
          Aucun log — déclenchez une mission d&apos;abord.
        </div>
      ) : (
        logs.map((l, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: surface,
              border: `1px solid ${line}`,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: l.role === 'assistant' ? agent.color : muted,
                letterSpacing: 1,
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              {l.role} ·{' '}
              {new Date(l.created_at).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
            <div
              style={{
                fontSize: 12,
                color: text,
                lineHeight: 1.5,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {l.content}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 6 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : 0 erreur. Si erreur sur `WebkitLineClamp` / `WebkitBoxOrient`, les typer ainsi :

```typescript
WebkitLineClamp: 3 as React.CSSProperties['WebkitLineClamp'],
WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
```

- [ ] **Step 7 : Commit**

```bash
git add app/studio/agents/page.tsx
git commit -m "feat(agents): Run/Pause/Logs fonctionnels — état depuis agent_configs DB"
```

---

### Task 5 : ServiceHealth dans automations — données réelles

**Files:**

- Modify: `app/studio/automations/page.tsx`

**Contexte :** `ServiceHealth` affiche 6 services avec statuts hardcodés. On le remplace par un fetch vers `/api/studio/services/health` au montage, qui retourne l'état réel de Ollama et n8n. Supabase, Coolify, Nginx, Stripe restent affichés mais sans ping réel (ce sont des services infra hors scope — on les marque "Non vérifié").

- [ ] **Step 1 : Modifier `ServiceHealth` pour utiliser la vraie route**

Remplacer le composant `ServiceHealth` dans `app/studio/automations/page.tsx` :

```typescript
function ServiceHealth() {
  const [health, setHealth] = useState<Record<string, { ok: boolean; latencyMs?: number; error?: string }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/studio/services/health')
      .then(r => r.ok ? r.json() : {})
      .then(data => setHealth(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const SERVICES_DISPLAY = [
    { id: 'ollama',   label: 'Ollama',   desc: 'LLM local' },
    { id: 'n8n',      label: 'n8n',      desc: 'Automations' },
    { id: 'supabase', label: 'Supabase', desc: 'Auth + DB + Storage', static: true },
    { id: 'coolify',  label: 'Coolify',  desc: 'Déploiement', static: true },
  ]

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Service health</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>live checks</div>
        </div>
        {loading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted }}>⏳ Vérification…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SERVICES_DISPLAY.map(s => {
          const h = health[s.id]
          const isOk = s.static ? null : (h?.ok ?? null)
          const color = isOk === null ? muted : isOk ? emerald : rose
          const statusLabel = isOk === null ? (loading ? '…' : 'N/A') : isOk ? 'OK' : 'KO'
          return (
            <div key={s.id} style={{
              padding: 10, borderRadius: 8,
              background: surface2, border: `1px solid ${line}`,
              display: 'flex', flexDirection: 'column', gap: 4,
              borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{s.label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3,
                  background: `${color}22`, color, letterSpacing: 1, fontWeight: 700,
                }}>● {statusLabel}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted }}>
                {s.desc}
                {'latencyMs' in (h ?? {}) && ` · ${(h as { latencyMs: number }).latencyMs}ms`}
                {h?.error && ` · ${h.error}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Supprimer le tableau `SERVICES` hardcodé**

Supprimer les lignes :

```typescript
const SERVICES = [
  { id: 'n8n', ... },
  ...
]
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/automations/page.tsx
git commit -m "feat(automations): ServiceHealth avec vrais pings Ollama + n8n"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
