# Audit Fix — Plan C : Isolation client & Qualité du code

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 8 problèmes CRITIQUE de manque de filtre `user_id` côté client, les 7 problèmes HAUT de race conditions/gestion d'erreur, et les principaux problèmes MOYEN d'UX.

**Architecture:** Corrections chirurgicales dans 4 fichiers. Pas de nouveaux composants. Chaque tâche est indépendante et testable.

**Tech Stack:** Next.js 15 App Router, React hooks, Supabase browser client

---

## Fichiers modifiés

| Fichier | Action | Lignes clés |
|---|---|---|
| `lib/auth-context.tsx` | **Modifier** — supprimer `getSession()` redondant | L.25-28 |
| `app/studio/ventures/page.tsx` | **Modifier** — user_id filters + cancelled flag | L.357-398 |
| `app/studio/chat/page.tsx` | **Modifier** — user_id filters + message ID unique | L.55-97 |
| `app/studio/automations/page.tsx` | **Modifier** — user_id filters + error handling + confirmation | L.449-468 |

---

### Task 1 : Corriger le double setState dans auth-context

**Files:**
- Modify: `lib/auth-context.tsx`

**Problème :** `getSession()` et `onAuthStateChange` s'exécutent en parallèle et appellent `setSession` deux fois, provoquant 2 re-renders inutiles au démarrage.

- [ ] **Step 1 : Remplacer le `useEffect` dans `lib/auth-context.tsx`**

Remplacer :
```typescript
  useEffect(() => {
    const supabase = createSupabaseBrowser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setLoading(false)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])
```

Par :
```typescript
  useEffect(() => {
    const supabase = createSupabaseBrowser()
    // onAuthStateChange émet INITIAL_SESSION au démarrage — pas besoin de getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])
```

- [ ] **Step 2 : Vérifier que le login fonctionne toujours**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add lib/auth-context.tsx
git commit -m "fix(auth): supprimer getSession() redondant — onAuthStateChange INITIAL_SESSION suffit"
```

---

### Task 2 : Filtres user_id + cancelled flag dans ventures/page.tsx

**Files:**
- Modify: `app/studio/ventures/page.tsx`

**Problèmes :**
- `SELECT *` sans `.eq('user_id', user.id)` — isolation inter-utilisateurs absente
- `UPDATE` et `DELETE` sans `.eq('user_id', user.id)` — mutation de ventures étrangères possible
- Pas de flag `cancelled` — setState sur composant démonté possible

- [ ] **Step 1 : Corriger la fonction `load()`**

Remplacer (ligne ~357) :
```typescript
  async function load() {
    const { data } = await supabase.from('ventures').select('*').order('score', { ascending: false })
    const list = (data as Venture[]) || []
    const dvs = list.map(toDisplay)
    setItems(dvs)
    if (!selectedId && dvs.length > 0) setSelectedId(dvs[0].id)
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
```

Par :
```typescript
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('ventures')
        .select('*')
        .eq('user_id', user!.id)
        .order('score', { ascending: false })
      if (cancelled) return
      if (error) { toast.error(error.message); return }
      const dvs = ((data as Venture[]) || []).map(toDisplay)
      setItems(dvs)
      if (!selectedId && dvs.length > 0) setSelectedId(dvs[0].id)
    }
    load()
    return () => { cancelled = true }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  function reload() {
    // Déclenche un re-render du useEffect en touchant user (pas nécessaire si on passe par un tick)
    // Alternative simple : extraire load() dans un useCallback
    const supabase = createSupabaseBrowser()
    supabase.from('ventures').select('*')
      .eq('user_id', user!.id)
      .order('score', { ascending: false })
      .then(({ data }) => {
        const dvs = ((data as Venture[]) || []).map(toDisplay)
        setItems(dvs)
      })
  }
```

**Note :** La fonction `load()` était appelée par `create`, `update`, `remove` pour rafraîchir la liste. Remplacer les 3 appels `load()` par `reload()`.

- [ ] **Step 2 : Corriger `update()` — ajouter `.eq('user_id', user.id)`**

Remplacer (ligne ~382) :
```typescript
  async function update(id: string, f: EditForm) {
    const { error } = await supabase.from('ventures').update({
      name: f.name.trim(), niche: f.niche.trim(), stage: f.stage,
      score: parseInt(f.score) || 0, mrr: f.mrr, cac: f.cac,
      conversion: f.conversion, next_action: f.next_action, insight: f.insight,
    }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Venture mise à jour')
    load()
  }
```

Par :
```typescript
  async function update(id: string, f: EditForm) {
    const { error } = await supabase.from('ventures').update({
      name: f.name.trim(), niche: f.niche.trim(), stage: f.stage,
      score: Math.max(0, Math.min(100, parseInt(f.score) || 0)),
      mrr: f.mrr, cac: f.cac, conversion: f.conversion,
      next_action: f.next_action, insight: f.insight,
    }).eq('id', id).eq('user_id', user!.id)
    if (error) { toast.error(error.message); return }
    toast.success('Venture mise à jour')
    reload()
  }
```

- [ ] **Step 3 : Corriger `remove()` — ajouter `.eq('user_id', user.id)`**

Remplacer (ligne ~392) :
```typescript
  async function remove(id: string) {
    const { error } = await supabase.from('ventures').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setSelectedId(null)
    toast.success('Venture supprimée')
    load()
  }
```

Par :
```typescript
  async function remove(id: string) {
    const { error } = await supabase.from('ventures').delete()
      .eq('id', id).eq('user_id', user!.id)
    if (error) { toast.error(error.message); return }
    setSelectedId(null)
    toast.success('Venture supprimée')
    reload()
  }
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5 : Commit**

```bash
git add app/studio/ventures/page.tsx
git commit -m "fix(isolation): filtres user_id + cancelled flag sur ventures/page.tsx"
```

---

### Task 3 : Filtres user_id dans chat/page.tsx

**Files:**
- Modify: `app/studio/chat/page.tsx`

**Problèmes :**
- `conversations` SELECT sans `.eq('user_id', user.id)`
- `conversations` DELETE sans `.eq('user_id', user.id)`
- IDs temporaires `'u-' + Date.now()` non-uniques

- [ ] **Step 1 : Corriger `loadConvs()`**

Remplacer (ligne ~55) :
```typescript
  async function loadConvs() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('conversations').select('id,title,updated_at,agent_id')
      .order('updated_at', { ascending: false })
    setConvs(data || [])
    if (!activeId && data?.[0]) setActiveId(data[0].id)
  }
```

Par :
```typescript
  async function loadConvs() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('conversations')
      .select('id,title,updated_at,agent_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) { toast.error(error.message); return }
    setConvs(data || [])
    if (!activeId && data?.[0]) setActiveId(data[0].id)
  }
```

- [ ] **Step 2 : Corriger `deleteConv()`**

Remplacer (ligne ~85) :
```typescript
  async function deleteConv(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('conversations').delete().eq('id', id)
    if (activeId === id) { setActiveId(null); setMessages([]) }
    loadConvs()
  }
```

Par :
```typescript
  async function deleteConv(id: string) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('conversations').delete()
      .eq('id', id).eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    if (activeId === id) { setActiveId(null); setMessages([]) }
    loadConvs()
  }
```

- [ ] **Step 3 : Corriger les IDs temporaires non-uniques**

Remplacer (ligne ~96) :
```typescript
    const userMsgId = 'u-' + Date.now()
    const asstMsgId = 'a-' + Date.now()
```

Par :
```typescript
    const userMsgId = 'u-' + crypto.randomUUID()
    const asstMsgId = 'a-' + crypto.randomUUID()
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5 : Commit**

```bash
git add app/studio/chat/page.tsx
git commit -m "fix(isolation): filtres user_id sur conversations + IDs uniques avec randomUUID"
```

---

### Task 4 : Filtres user_id + error handling dans automations/page.tsx

**Files:**
- Modify: `app/studio/automations/page.tsx`

**Problèmes :**
- `loadWorkflows()` SELECT sans `.eq('user_id', user.id)`
- `toggleWorkflow` : optimistic update même si Supabase échoue
- `deleteWorkflow` : pas de confirmation, pas de filtre `user_id`

- [ ] **Step 1 : Corriger `loadWorkflows()`**

Remplacer (ligne ~449) :
```typescript
  async function loadWorkflows() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('automation_workflows').select('*').order('created_at', { ascending: false })
    setDbWorkflows((data as DbWorkflow[]) || [])
  }
```

Par :
```typescript
  async function loadWorkflows() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('automation_workflows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { toast.error(error.message); return }
    setDbWorkflows((data as DbWorkflow[]) || [])
  }
```

- [ ] **Step 2 : Corriger `toggleWorkflow()` — error handling + user_id filter**

Remplacer (ligne ~457) :
```typescript
  async function toggleWorkflow(id: string, enabled: boolean) {
    const supabase = createSupabaseBrowser()
    await supabase.from('automation_workflows').update({ enabled }).eq('id', id)
    setDbWorkflows(wf => wf.map(w => w.id === id ? { ...w, enabled } : w))
  }
```

Par :
```typescript
  async function toggleWorkflow(id: string, enabled: boolean) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('automation_workflows')
      .update({ enabled })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    setDbWorkflows(wf => wf.map(w => w.id === id ? { ...w, enabled } : w))
  }
```

- [ ] **Step 3 : Corriger `deleteWorkflow()` — confirmation + user_id filter**

Remplacer (ligne ~463) :
```typescript
  async function deleteWorkflow(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('automation_workflows').delete().eq('id', id)
    if (dbSelectedId === id) setDbSelectedId(null)
    loadWorkflows()
    toast.success('Workflow supprimé')
  }
```

Par :
```typescript
  async function deleteWorkflow(id: string) {
    if (!user) return
    if (!window.confirm('Supprimer ce workflow ? Cette action est irréversible.')) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('automation_workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    if (dbSelectedId === id) setDbSelectedId(null)
    loadWorkflows()
    toast.success('Workflow supprimé')
  }
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5 : Commit**

```bash
git add app/studio/automations/page.tsx
git commit -m "fix(isolation): user_id filters automations + optimistic update conditionnel + confirmation suppression"
```

---

### Task 5 : Build final + déploiement

- [ ] **Step 1 : Lancer les tests**

```bash
npm test 2>&1 | tail -10
```
Expected: tous les tests passent (15 gamification + 9 security si Plan A exécuté)

- [ ] **Step 2 : Build de production**

```bash
npx next build 2>&1 | tail -15
```
Expected: build réussi sans erreurs

- [ ] **Step 3 : Push et déploiement**

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```

Expected : `{"deployments":[{"message":"Application kenomi-canvas deployment queued.",...}]}`
