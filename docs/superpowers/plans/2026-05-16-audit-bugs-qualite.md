# Audit Fix — Plan E : Bugs & Qualité du code

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 10 bugs identifiés dans l'audit : quick commands cassés, bouton RÉCLAMER absent, requêtes sans user_id dans le cockpit/chat, client Supabase recréé à chaque render, window.confirm mobile, et isolation de données manquante sur api-keys/documents.

**Architecture:** Corrections chirurgicales dans 5 pages. Aucun nouveau composant. Chaque tâche est indépendante.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase browser client, TypeScript

---

## Fichiers modifiés

| Fichier | Action | Bugs corrigés |
|---|---|---|
| `app/studio/chat/page.tsx` | **Modifier** | BUG-1 (quick commands), BUG-4 (update sans user_id), BUG-5 (messages sans user_id), BUG-6 (supabase recréé) |
| `app/studio/gamification/page.tsx` | **Modifier** | BUG-2 (justUnlocked inversé) |
| `app/studio/page.tsx` | **Modifier** | BUG-3 (ventures sans user_id), BUG-6 (supabase recréé), BUG-7 (agentById non-null) |
| `app/studio/automations/page.tsx` | **Modifier** | BUG-8 (window.confirm) |
| `app/studio/api-keys/page.tsx` | **Modifier** | isolation user_id manquante (load + delete) |
| `app/studio/documents/page.tsx` | **Modifier** | isolation user_id manquante (load) |

---

### Task 1 : Corriger les quick commands dans chat/page.tsx

**Files:**
- Modify: `app/studio/chat/page.tsx` (ligne ~358)

**Problème :** Le handler `onClick` appelle `newConv()` mais n'envoie jamais le texte de la commande.

- [ ] **Step 1 : Refactoriser `newConv` pour retourner l'ID et créer `newConvAndSend`**

Dans `app/studio/chat/page.tsx`, remplacer la fonction `newConv` :

```typescript
  async function newConv(): Promise<string | null> {
    if (!user) return null
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase.from('conversations')
      .insert({ user_id: user.id, title: 'Nouvelle conversation', agent_id: agentId })
      .select().single()
    if (error) { toast.error(error.message); return null }
    await loadConvs()
    setActiveId(data.id)
    return data.id
  }

  async function newConvAndSend(text: string) {
    const id = await newConv()
    if (!id) return
    // handleSend lit activeId via closure — on passe le texte directement à l'API
    if (!user) return
    setSending(true)
    setInput('')
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    try {
      const res = await fetch('/api/studio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message: text, agentId }),
      })
      if (!res.ok || !res.body) { toast.error('Erreur chat'); setSending(false); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      const assistantId = crypto.randomUUID()
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          const t = line.trim()
          if (!t.startsWith('data: ')) continue
          const raw = t.slice(6)
          if (raw === '[DONE]') break
          try { const token = JSON.parse(raw) as string; full += token; setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: full } : m)) } catch { }
        }
      }
    } catch (e) { toast.error((e as Error).message) }
    setSending(false)
    loadConvs()
  }
```

- [ ] **Step 2 : Mettre à jour le handler des quick commands (ligne ~362)**

Remplacer :
```typescript
<button key={cmd} onClick={async () => { await newConv(); }} style={{
```

Par :
```typescript
<button key={cmd} onClick={() => newConvAndSend(cmd)} style={{
```

- [ ] **Step 3 : Compiler**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 4 : Commit**

```bash
git add app/studio/chat/page.tsx
git commit -m "fix(chat): quick commands — envoyer le texte après création de la conversation"
```

---

### Task 2 : Corriger l'isolation user_id dans chat/page.tsx

**Files:**
- Modify: `app/studio/chat/page.tsx` (lignes ~73, ~147)

- [ ] **Step 1 : Ajouter le filtre user_id sur les messages chargés (ligne ~73)**

Remplacer :
```typescript
    supabase.from('messages').select('*').eq('conversation_id', activeId)
      .order('created_at').then(({ data }) => setMessages(data || []))
```

Par :
```typescript
    supabase.from('messages').select('*')
      .eq('conversation_id', activeId)
      .eq('user_id', user!.id)
      .order('created_at')
      .then(({ data }) => setMessages(data || []))
```

- [ ] **Step 2 : Ajouter le filtre user_id sur l'update du titre (ligne ~147)**

Remplacer :
```typescript
      await supabase.from('conversations').update({ title: msgText.slice(0, 48) }).eq('id', activeId)
```

Par :
```typescript
      await supabase.from('conversations').update({ title: msgText.slice(0, 48) })
        .eq('id', activeId).eq('user_id', user!.id)
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4 : Commit**

```bash
git add app/studio/chat/page.tsx
git commit -m "fix(isolation): messages + update titre avec filtre user_id dans chat"
```

---

### Task 3 : Corriger `justUnlocked` dans gamification/page.tsx

**Files:**
- Modify: `app/studio/gamification/page.tsx` (ligne ~528)

**Problème :** `find(a => !a.unlocked)` ne retourne que des éléments non débloqués, donc `justUnlocked.unlocked` est toujours `false` → le bouton RÉCLAMER du hero banner ne s'affiche jamais.

- [ ] **Step 1 : Corriger la logique de `justUnlocked`**

Remplacer (ligne ~528) :
```typescript
  const justUnlocked = achievements.find(a => !a.unlocked) ?? achievements[0] ?? { ...ACHIEVEMENTS_META[0], unlocked: false, pct: 0 }
```

Par :
```typescript
  // Priorité 1 : achievement débloqué mais pas encore réclamé (bouton RÉCLAMER visible)
  // Priorité 2 : prochain achievement non encore débloqué (affiche la progression)
  const justUnlocked =
    achievements.find(a => a.unlocked && !claimed.has(a.id)) ??
    achievements.find(a => !a.unlocked) ??
    achievements[0] ??
    { ...ACHIEVEMENTS_META[0], unlocked: false, pct: 0 }
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3 : Vérifier visuellement**

Démarrer le serveur dev et naviguer vers `/studio/gamification`. Le hero banner doit afficher :
- Le bouton "RÉCLAMER" si un achievement est débloqué mais non réclamé
- La barre de progression sinon

```bash
npm run dev &
```

- [ ] **Step 4 : Commit**

```bash
git add app/studio/gamification/page.tsx
git commit -m "fix(gamification): justUnlocked — prioriser les achievements réclamables"
```

---

### Task 4 : Corriger les requêtes sans user_id dans le cockpit

**Files:**
- Modify: `app/studio/page.tsx` (lignes ~987-988)

- [ ] **Step 1 : Ajouter les filtres user_id**

Dans `app/studio/page.tsx`, remplacer (ligne ~987) :
```typescript
        supabase.from('ventures').select('*').order('score', { ascending: false }),
        supabase.from('kpi_snapshots').select('*').eq('period', '30d').limit(1).single(),
```

Par :
```typescript
        supabase.from('ventures').select('*').eq('user_id', user.id).order('score', { ascending: false }),
        supabase.from('kpi_snapshots').select('*').eq('user_id', user.id).eq('period', '30d').limit(1).maybeSingle(),
```

**Note :** `single()` est remplacé par `maybeSingle()` pour éviter une erreur si aucun snapshot n'existe.

- [ ] **Step 2 : Mémoïser le client Supabase (ligne ~957)**

Ajouter l'import `useMemo` si absent en haut du fichier, puis remplacer :
```typescript
  const supabase = createSupabaseBrowser()
```

Par :
```typescript
  const supabase = useMemo(() => createSupabaseBrowser(), [])
```

- [ ] **Step 3 : Corriger l'assertion non-null sur `agentById` (ligne ~141)**

Remplacer :
```typescript
  const agentById = (id: string) => AGENTS_STATIC.find(a => a.id === id)!
```

Par :
```typescript
  const agentById = (id: string) => AGENTS_STATIC.find(a => a.id === id) ?? AGENTS_STATIC[0]
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreur

- [ ] **Step 5 : Commit**

```bash
git add app/studio/page.tsx
git commit -m "fix(isolation): ventures + kpi_snapshots avec user_id dans cockpit + supabase mémoïsé"
```

---

### Task 5 : Remplacer window.confirm dans automations

**Files:**
- Modify: `app/studio/automations/page.tsx` (ligne ~476)

**Problème :** `window.confirm()` est bloquant et inutilisable sur mobile. L'app utilise `sonner` partout ailleurs.

- [ ] **Step 1 : Ajouter un state de confirmation et remplacer window.confirm**

Dans `app/studio/automations/page.tsx`, ajouter un state :
```typescript
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
```

Remplacer la fonction `deleteWorkflow` (ligne ~476) :
```typescript
  async function deleteWorkflow(id: string) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('automation_workflows')
      .delete().eq('id', id).eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    toast.success('Workflow supprimé')
    setConfirmDelete(null)
    loadWorkflows()
  }
```

Remplacer le bouton de suppression dans le JSX — remplacer le `onClick` qui appelait `deleteWorkflow` directement :
```typescript
onClick={() => setConfirmDelete(wf.id)}
```

Ajouter juste avant le `return` du composant un toast de confirmation :
```typescript
  // Confirmation de suppression
  useEffect(() => {
    if (!confirmDelete) return
    const id = confirmDelete
    toast('Supprimer ce workflow ?', {
      description: 'Cette action est irréversible.',
      action: { label: 'Supprimer', onClick: () => deleteWorkflow(id) },
      cancel: { label: 'Annuler', onClick: () => setConfirmDelete(null) },
    })
  }, [confirmDelete]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add app/studio/automations/page.tsx
git commit -m "fix(ux): remplacer window.confirm par toast sonner dans automations"
```

---

### Task 6 : Isolation user_id dans api-keys et documents

**Files:**
- Modify: `app/studio/api-keys/page.tsx` (lignes ~55, ~81)
- Modify: `app/studio/documents/page.tsx` (ligne ~54)

- [ ] **Step 1 : Corriger `load()` dans api-keys/page.tsx (ligne ~55)**

Remplacer :
```typescript
    const { data } = await supabase.from('api_keys')
      .select('id,name,key_prefix,last_used_at,created_at')
      .order('created_at', { ascending: false })
```

Par :
```typescript
    const { data } = await supabase.from('api_keys')
      .select('id,name,key_prefix,last_used_at,created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
```

- [ ] **Step 2 : Corriger la suppression dans api-keys/page.tsx (ligne ~81)**

Remplacer :
```typescript
    await supabase.from('api_keys').delete().eq('id', id)
```

Par :
```typescript
    await supabase.from('api_keys').delete().eq('id', id).eq('user_id', user!.id)
```

- [ ] **Step 3 : Corriger `load()` dans documents/page.tsx (ligne ~54)**

Remplacer :
```typescript
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
```

Par :
```typescript
    const { data } = await supabase.from('documents').select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5 : Commit**

```bash
git add app/studio/api-keys/page.tsx app/studio/documents/page.tsx
git commit -m "fix(isolation): filtre user_id sur api-keys (load + delete) et documents"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
