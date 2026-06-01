# Plan P — UI Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecter les boutons OPEN/BRIEF des ventures, corriger le MRR Analytics (données réelles depuis kpi_snapshots), brancher le cockpit sur les agents réels depuis `agent_configs`, et ajouter la liste des workflows n8n réels dans la page automations.

**Architecture:** Pas de nouvelles routes API — tout utilise des routes existantes ou Supabase anon direct. OPEN sur une venture navigue vers `/studio/ventures?id=xxx`. BRIEF génère un résumé textuel de la venture (nom, niche, stage, score, metrics) copié dans le clipboard. Le MRR utilise les `kpi_snapshots` existants (period = 'current', metric = 'mrr'). Les n8n workflows réels viennent de `GET /api/studio/n8n/workflows` (créée en Plan N).

**Tech Stack:** Next.js 15 App Router, Supabase anon, React 19, `useRouter` de next/navigation.

**Dépendance :** Plan N doit être exécuté avant (route n8n/workflows). Plan O optionnel pour les agents.

---

## Fichiers modifiés

| Fichier                           | Action                                     |
| --------------------------------- | ------------------------------------------ |
| `app/studio/ventures/page.tsx`    | Modifier — boutons OPEN/BRIEF fonctionnels |
| `app/studio/analytics/page.tsx`   | Modifier — MRR depuis kpi_snapshots réels  |
| `app/studio/automations/page.tsx` | Modifier — liste workflows n8n réels       |

---

### Task 1 : Boutons OPEN et BRIEF dans ventures

**Files:**

- Modify: `app/studio/ventures/page.tsx`

**Contexte :** Les boutons OPEN et BRIEF dans `VentureCard` n'ont pas d'`onClick`. OPEN doit sélectionner la venture dans l'inspector (la page a déjà un state `selectedId` et un `VentureInspector`). BRIEF génère un texte résumé de la venture et le copie dans le clipboard avec un toast de confirmation.

- [ ] **Step 1 : Trouver la signature de `VentureCard`**

```bash
grep -n "function VentureCard\|onOpen\|onBrief\|OPEN\|BRIEF" \
  /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/ventures/page.tsx | head -20
```

- [ ] **Step 2 : Ajouter `onOpen` et `onBrief` dans les props de `VentureCard`**

Modifier la signature :

```typescript
function VentureCard({ v, stageColor, active, onClick, onOpen, onBrief }: {
  v: DV; stageColor: string; active: boolean
  onClick: () => void
  onOpen: () => void
  onBrief: () => void
}) {
```

- [ ] **Step 3 : Connecter les boutons OPEN/BRIEF**

Remplacer le rendu des boutons OPEN/BRIEF (ligne avec `.map(lbl => ...`) par :

```tsx
<button
  key="OPEN"
  type="button"
  onClick={e => { e.stopPropagation(); onOpen() }}
  style={{ padding: '10px 12px', borderRadius: 8, background: surface2, color: text, border: `1px solid ${line2}`, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer' }}
>OPEN</button>
<button
  key="BRIEF"
  type="button"
  onClick={e => { e.stopPropagation(); onBrief() }}
  style={{ padding: '10px 12px', borderRadius: 8, background: surface2, color: text, border: `1px solid ${line2}`, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer' }}
>BRIEF</button>
```

- [ ] **Step 4 : Ajouter `generateBrief` dans le composant page**

Dans `VenturesPage`, ajouter la fonction :

```typescript
function generateBrief(v: DV): string {
  return [
    `# ${v.name}`,
    `Niche : ${v.niche || '—'}`,
    `Stage : ${v.stage} | Score : ${v.score}/100 | Statut : ${v.status}`,
    `MRR : ${v.mrr || '—'} | CAC : ${v.cac || '—'} | Conversion : ${v.conversion || '—'}`,
    `Prochaine action : ${v.next_action || '—'}`,
    `Insight : ${v.insight || '—'}`,
  ].join('\n')
}
```

- [ ] **Step 5 : Passer les props aux `VentureCard` dans le JSX**

Trouver toutes les utilisations de `<VentureCard` dans le JSX et ajouter les props :

```tsx
<VentureCard
  key={v.id}
  v={v}
  stageColor={stage.color}
  active={v.id === selectedId}
  onClick={() => setSelectedId(v.id)}
  onOpen={() => setSelectedId(v.id)}
  onBrief={() => {
    navigator.clipboard
      .writeText(generateBrief(v))
      .then(() => toast.success('Brief copié dans le presse-papier'))
      .catch(() => toast.error('Impossible de copier'))
  }}
/>
```

- [ ] **Step 6 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 7 : Commit**

```bash
git add app/studio/ventures/page.tsx
git commit -m "feat(ventures): boutons OPEN sélectionne + BRIEF copie résumé clipboard"
```

---

### Task 2 : Analytics — MRR depuis kpi_snapshots réels

**Files:**

- Modify: `app/studio/analytics/page.tsx`

**Contexte :** Le graphe MRR utilise `makeSpark()` avec une seed pseudo-aléatoire. Les vraies données MRR sont dans `kpi_snapshots` (colonnes : `period`, `mrr`, `cac`, `conversion_rate`, `arr`, `burn_rate`). On charge toutes les snapshots de l'utilisateur, on les trie par date, et on affiche la vraie série MRR.

- [ ] **Step 1 : Lire comment kpi_snapshots est chargé**

```bash
grep -n "kpi_snapshots\|useState\|setMrr\|makeSpark\|MRR\|mrr" \
  /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/analytics/page.tsx | head -30
```

- [ ] **Step 2 : Ajouter le state pour les snapshots historiques**

Après les states existants, ajouter :

```typescript
const [mrrSeries, setMrrSeries] = useState<number[]>([])
```

- [ ] **Step 3 : Charger l'historique kpi_snapshots**

Dans le `useEffect` qui charge les données (ou en ajouter un nouveau) :

```typescript
useEffect(() => {
  if (!user) return
  const supabase = createSupabaseBrowser()
  supabase
    .from('kpi_snapshots')
    .select('mrr, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(30)
    .then(({ data }) => {
      if (data && data.length > 0) {
        setMrrSeries(
          data.map((d) =>
            typeof d.mrr === 'number' ? d.mrr : parseFloat(String(d.mrr ?? '0')) || 0
          )
        )
      }
    })
}, [user]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4 : Remplacer `makeSpark` par `mrrSeries` dans le graphe MRR**

Chercher la ligne qui génère le spark du MRR (ex: `makeSpark(24, ..., 'mrr'.length * ...)` ou similaire). La remplacer par :

```typescript
const mrrSparkData = mrrSeries.length >= 2 ? mrrSeries : makeSpark(24, 50, 18, 42)
```

Puis utiliser `mrrSparkData` à la place du `makeSpark` hardcodé dans le rendu SVG.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add app/studio/analytics/page.tsx
git commit -m "feat(analytics): MRR depuis kpi_snapshots réels (fallback makeSpark si vide)"
```

---

### Task 3 : Automations — liste workflows n8n réels

**Files:**

- Modify: `app/studio/automations/page.tsx`

**Contexte :** La page automations affiche uniquement les workflows créés dans l'app (`DbWorkflowsList`). On ajoute une section "Workflows n8n" qui charge les vrais workflows depuis `GET /api/studio/n8n/workflows` et les affiche en lecture seule (nom, actif/inactif, trigger type). Si n8n n'est pas configuré, la section n'apparaît pas.

**Note :** Les workflows n8n sont en lecture seule ici — on ne peut pas les déclencher directement (n8n gère son propre scheduling). On les affiche juste pour avoir une vue unifiée.

- [ ] **Step 1 : Ajouter l'interface N8nWorkflow et le state**

Dans `app/studio/automations/page.tsx`, ajouter après `interface AutoRun` :

```typescript
interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}
```

Dans `AutomationsPage`, ajouter le state :

```typescript
const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflow[]>([])
const [n8nLoading, setN8nLoading] = useState(false)
const [n8nError, setN8nError] = useState<string | null>(null)
```

- [ ] **Step 2 : Charger les workflows n8n au montage**

Ajouter un `useEffect` dans `AutomationsPage` :

```typescript
useEffect(() => {
  setN8nLoading(true)
  fetch('/api/studio/n8n/workflows')
    .then((r) => {
      if (!r.ok)
        return r.json().then((e) => {
          throw new Error(e.error || 'Erreur n8n')
        })
      return r.json()
    })
    .then((data: N8nWorkflow[]) => setN8nWorkflows(data))
    .catch((e) => setN8nError(e.message))
    .finally(() => setN8nLoading(false))
}, [])
```

- [ ] **Step 3 : Ajouter le composant `N8nWorkflowsList`**

Ajouter avant `export default function AutomationsPage()` :

```typescript
function N8nWorkflowsList({ workflows, loading, error }: { workflows: N8nWorkflow[]; loading: boolean; error: string | null }) {
  if (error?.includes('Non configuré') || error?.includes('URL')) return null
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Workflows n8n</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em' }}>
          {loading ? '…' : error ? '⚠ erreur' : `${workflows.length} total`}
        </span>
      </div>
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Chargement…</div>}
      {error && !error.includes('Non configuré') && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#fb7185' }}>{error}</div>
      )}
      {!loading && !error && workflows.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Aucun workflow n8n. Configurez l&apos;URL n8n dans Settings.</div>
      )}
      {workflows.map(w => (
        <div key={w.id} style={{
          padding: 10, borderRadius: 10,
          background: surface2, border: `1px solid ${line}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: w.active ? emerald : muted2, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, background: w.active ? `${emerald}18` : `${muted2}18`, color: w.active ? emerald : muted2, letterSpacing: 1 }}>
            {w.active ? 'ACTIF' : 'INACTIF'}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4 : Intégrer dans le JSX de `AutomationsPage`**

Dans le JSX, après `<DbWorkflowsList ... />`, ajouter :

```tsx
<N8nWorkflowsList workflows={n8nWorkflows} loading={n8nLoading} error={n8nError} />
```

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add app/studio/automations/page.tsx
git commit -m "feat(automations): liste workflows n8n réels depuis API n8n"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
