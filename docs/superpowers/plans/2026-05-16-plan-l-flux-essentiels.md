# Plan L — Flux Essentiels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter les flux fonctionnels du MVP prod : afficher l'historique des runs d'automation dans l'UI, ajouter une route API pour lire les runs, et corriger la suppression de documents (rollback storage si delete DB échoue).

**Architecture:** Une route `GET /api/studio/automations/runs?workflow_id=xxx` retourne les 20 derniers runs d'un workflow. La page `automations/page.tsx` est enrichie d'un panneau "Derniers runs" alimenté en temps réel. La fonction `deleteDoc` dans `documents/page.tsx` est corrigée pour supprimer d'abord le storage puis la DB et gérer l'erreur proprement.

**Tech Stack:** Next.js 15 Route Handlers, Supabase anon (RLS), React 19, TypeScript strict. La table `automation_runs` a été créée en Plan K.

**Dépendance :** Plan K doit être exécuté avant (table `automation_runs` requise).

---

## Fichiers modifiés

| Fichier                                    | Action                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| `app/api/studio/automations/runs/route.ts` | Créer — GET runs d'un workflow                                |
| `app/studio/automations/page.tsx`          | Modifier — panneau runs réels + fetch après trigger           |
| `app/studio/documents/page.tsx`            | Modifier — corriger delete (storage avant DB, gestion erreur) |

---

### Task 1 : Route GET `/api/studio/automations/runs`

**Files:**

- Create: `app/api/studio/automations/runs/route.ts`

- [ ] **Step 1 : Créer la route**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/automations/runs/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const workflowId = req.nextUrl.searchParams.get('workflow_id')
  if (!workflowId) return apiError('workflow_id requis', 400)

  // Vérifier ownership du workflow avant de retourner ses runs
  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('id')
    .eq('id', workflowId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!wf) return apiError('Not found', 404)

  const { data: runs, error } = await supabase
    .from('automation_runs')
    .select('id, status, http_status, duration_ms, error_message, triggered_at')
    .eq('workflow_id', workflowId)
    .eq('user_id', user!.id)
    .order('triggered_at', { ascending: false })
    .limit(20)

  if (error) return apiError('Erreur serveur', 500)

  return NextResponse.json(runs ?? [])
}
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add app/api/studio/automations/runs/route.ts
git commit -m "feat(automations): route GET /api/studio/automations/runs"
```

---

### Task 2 : Afficher les runs réels dans la page automations

**Files:**

- Modify: `app/studio/automations/page.tsx`

**Contexte :** La page a déjà une section `RunsFeed` qui affiche des données statiques. On la remplace par des données réelles issues de la route créée en Task 1, chargées quand un workflow DB est sélectionné. Après chaque trigger réussi ou raté, on recharge les runs.

- [ ] **Step 1 : Lire la section RunsFeed et la zone de state existante**

```bash
grep -n "RunsFeed\|runsOf\|loadRuns\|setRuns\|AutoRun\|interface.*Run\|DbRun" \
  /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/automations/page.tsx | head -30
```

- [ ] **Step 2 : Ajouter l'interface AutoRun et le state runs**

En tête du composant principal (après `const [dbWorkflows, setDbWorkflows] = useState<DbWorkflow[]>([])`), ajouter :

```typescript
interface AutoRun {
  id: string
  status: 'success' | 'error' | 'timeout'
  http_status: number | null
  duration_ms: number | null
  error_message: string | null
  triggered_at: string
}

const [selectedDbId, setSelectedDbId] = useState<string | null>(null)
const [runs, setRuns] = useState<AutoRun[]>([])
const [runsLoading, setRunsLoading] = useState(false)
```

**Note :** si `selectedId` existe déjà dans le composant pour les workflows DB, utilise ce nom plutôt que `selectedDbId` — adapte selon ce qui est déjà déclaré.

- [ ] **Step 3 : Ajouter la fonction loadRuns**

Juste après les useState, ajouter :

```typescript
const loadRuns = async (workflowId: string) => {
  setRunsLoading(true)
  try {
    const res = await fetch(`/api/studio/automations/runs?workflow_id=${workflowId}`)
    if (res.ok) {
      const data = await res.json()
      setRuns(data)
    }
  } finally {
    setRunsLoading(false)
  }
}
```

- [ ] **Step 4 : Déclencher loadRuns à la sélection et après un trigger**

Dans le handler `onSelect` du composant (qui appelle `setSelectedId` ou `setSelectedDbId`), ajouter un appel à `loadRuns(id)`.

Dans le handler `onRun` (qui appelle `/api/studio/automations/trigger`), après le fetch qui réussit ou échoue, ajouter :

```typescript
// Recharger les runs après trigger (succès ou erreur)
if (selectedDbId) await loadRuns(selectedDbId)
```

- [ ] **Step 5 : Remplacer le contenu de RunsFeed par les runs réels**

Trouver la fonction `RunsFeed` (elle reçoit `dbWorkflows` et affiche une liste statique "Derniers runs"). La remplacer par :

```typescript
function RunsFeed({ runs, loading }: { runs: AutoRun[]; loading: boolean }) {
  const statusColor = (s: AutoRun['status']) =>
    s === 'success' ? '#34d399' : s === 'timeout' ? '#fbbf24' : '#fb7185'
  const statusLabel = (s: AutoRun['status']) =>
    s === 'success' ? '✓' : s === 'timeout' ? '⏱' : '✗'

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: text, marginBottom: 12 }}>
        Derniers runs
      </div>
      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Chargement…</div>
      ) : runs.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>
          Aucun run enregistré. Déclenchez un workflow pour voir l'historique.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {runs.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', borderRadius: 8,
              background: surface2, border: `1px solid ${line}`,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                color: statusColor(r.status), minWidth: 14, textAlign: 'center',
              }}>{statusLabel(r.status)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, flex: 1 }}>
                {new Date(r.triggered_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {r.duration_ms !== null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted }}>
                  {r.duration_ms}ms
                </span>
              )}
              {r.http_status !== null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted }}>
                  HTTP {r.http_status}
                </span>
              )}
              {r.error_message && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fb7185', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.error_message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6 : Passer les props runs/loading au composant RunsFeed**

Dans le JSX du composant principal, trouver `<RunsFeed dbWorkflows={dbWorkflows} />` et le remplacer par :

```typescript
<RunsFeed runs={runs} loading={runsLoading} />
```

- [ ] **Step 7 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : 0 erreur. Si des erreurs apparaissent sur des props supprimées (`dbWorkflows`), vérifier que toutes les utilisations de l'ancienne interface sont mises à jour.

- [ ] **Step 8 : Commit**

```bash
git add app/studio/automations/page.tsx
git commit -m "feat(automations): historique runs réels dans l'UI — chargé après sélection/trigger"
```

---

### Task 3 : Corriger la suppression de documents

**Files:**

- Modify: `app/studio/documents/page.tsx`

**Contexte :** La fonction `deleteDoc` actuelle supprime d'abord la ligne DB, puis le fichier storage, sans gérer l'erreur de l'étape storage. Si le delete storage échoue, le fichier reste orphelin dans le bucket. On inverse l'ordre (storage d'abord) et on affiche un toast si le delete storage échoue.

- [ ] **Step 1 : Lire la fonction deleteDoc existante**

```bash
grep -n "deleteDoc\|async function delete\|remove\|\.delete(" \
  /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/documents/page.tsx | head -15
```

- [ ] **Step 2 : Trouver et remplacer la fonction de suppression**

Trouver le bloc de code qui supprime un document (il fait un appel à `supabase.storage.from('documents').remove(...)` et un appel à `supabase.from('documents').delete()`).

Remplacer ce bloc par :

```typescript
async function deleteDoc(d: Doc) {
  // Storage d'abord pour éviter les orphelins
  const { error: storageError } = await supabase.storage.from('documents').remove([d.storage_path])
  if (storageError) {
    return toast.error(`Suppression storage échouée : ${storageError.message}`)
  }

  const { error: dbError } = await supabase
    .from('documents')
    .delete()
    .eq('id', d.id)
    .eq('user_id', user!.id)
  if (dbError) {
    return toast.error(`Suppression base échouée : ${dbError.message}`)
  }

  toast.success('Document supprimé')
  load()
}
```

**Note :** La fonction s'appelle peut-être différemment (chercher la ligne qui fait `.remove([d.storage_path])` et `.delete().eq('id', d.id)`). Adapte le nom si nécessaire, mais garde la même signature.

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur

- [ ] **Step 4 : Commit**

```bash
git add app/studio/documents/page.tsx
git commit -m "fix(documents): delete storage avant DB + gestion erreur à chaque étape"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
