# Plan G — Corrections urgentes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 3 problèmes immédiats : `getSession()` déprécié dans le middleware (vulnérabilité auth), la table `ideas` sans policy RLS utilisateur (table inaccessible), et `DASHBOARD_TOKEN_SECRET` manquant en production (crash au démarrage).

**Architecture:** Corrections chirurgicales dans 3 endroits. `middleware.ts` remplace `getSession` par `getUser`. Une migration SQL ajoute `user_id` à `ideas` et la policy RLS associée. Coolify reçoit la variable manquante via son API REST. `.env.example` est mis à jour pour éviter le problème à l'avenir.

**Tech Stack:** Next.js 15 middleware, Supabase Auth (@supabase/ssr), PostgreSQL RLS, Coolify REST API, API REST Supabase self-hosted (`/pg/query`).

---

## Fichiers modifiés

| Fichier                                             | Action                                           |
| --------------------------------------------------- | ------------------------------------------------ |
| `middleware.ts`                                     | Modifier — remplacer `getSession` par `getUser`  |
| `supabase/migrations/20260516_plan_g_ideas_rls.sql` | Créer — ajouter `user_id` à `ideas` + policy RLS |
| `.env.example`                                      | Modifier — ajouter `DASHBOARD_TOKEN_SECRET`      |

---

### Task 1 : Remplacer `getSession` par `getUser` dans le middleware

**Files:**

- Modify: `middleware.ts:38`

**Contexte :** `getSession()` lit le JWT depuis le cookie sans le valider côté serveur — un cookie forgé peut passer. `getUser()` fait une requête au serveur Supabase pour valider le token. C'est le changement recommandé par Supabase dans leur guide de sécurité SSR.

- [ ] **Step 1 : Modifier middleware.ts**

Ouvrir `middleware.ts`. Remplacer le bloc :

```typescript
const {
  data: { session },
} = await supabase.auth.getSession()
const loggedIn = !!session

// ── Whitelist : seul l'email autorisé peut accéder au studio ──────────────
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL
if (loggedIn && ALLOWED_EMAIL && session.user.email !== ALLOWED_EMAIL) {
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
}
```

Par :

```typescript
const {
  data: { user },
} = await supabase.auth.getUser()
const loggedIn = !!user

// ── Whitelist : seul l'email autorisé peut accéder au studio ──────────────
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL
if (loggedIn && ALLOWED_EMAIL && user.email !== ALLOWED_EMAIL) {
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
}
```

Remplacer aussi toutes les occurrences suivantes où `session` est utilisé implicitement pour déduire `loggedIn`. Le reste du fichier utilise uniquement `loggedIn` (booléen) donc aucune autre modification n'est nécessaire.

- [ ] **Step 2 : Vérifier la compilation**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
npx tsc --noEmit 2>&1 | head -20
```

Expected : 0 erreur

- [ ] **Step 3 : Commit**

```bash
git add middleware.ts
git commit -m "fix(security): middleware getUser() au lieu de getSession() — validation JWT serveur"
```

---

### Task 2 : Ajouter `user_id` à `ideas` et sa policy RLS

**Files:**

- Create: `supabase/migrations/20260516_plan_g_ideas_rls.sql`

**Contexte :** La table `ideas` a RLS activé mais n'a ni `user_id` ni `venture_id` — seul `service_role` peut la lire (via la policy existante). La table n'est pas encore utilisée dans le code applicatif (grep confirme 0 résultat). On peut donc ajouter `user_id` en toute sécurité avec une valeur par défaut = premier utilisateur existant.

- [ ] **Step 1 : Créer le fichier de migration**

Créer `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260516_plan_g_ideas_rls.sql` avec ce contenu :

```sql
-- ============================================================
-- Plan G — ideas : ajout user_id + policy RLS
-- La table ideas n'a ni user_id ni venture_id.
-- On ajoute user_id nullable puis on l'assigne + NOT NULL.
-- ============================================================

-- 1. Ajouter la colonne user_id (nullable d'abord)
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Assigner les lignes existantes au premier utilisateur
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'auth.users est vide — migration impossible';
  END IF;
END $$;

UPDATE public.ideas
SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
WHERE user_id IS NULL;

-- 3. Rendre NOT NULL
ALTER TABLE public.ideas ALTER COLUMN user_id SET NOT NULL;

-- 4. Index pour les performances RLS
CREATE INDEX IF NOT EXISTS ideas_user_id_idx ON public.ideas(user_id);

-- 5. Remplacer la policy service_role par une policy utilisateur
DROP POLICY IF EXISTS "Service role full access" ON public.ideas;

DO $$ BEGIN
  CREATE POLICY "ideas_own" ON public.ideas
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ideas IS
  'Idées studio. user_id NOT NULL + RLS depuis 2026-05-16 (Plan G).';
```

- [ ] **Step 2 : Appliquer la migration en base**

```bash
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# Étape 1 : ajouter la colonne
curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id)"}' && echo " colonne OK"

# Étape 2 : assigner + NOT NULL
curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE public.ideas SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL"}' && echo " update OK"

curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE public.ideas ALTER COLUMN user_id SET NOT NULL"}' && echo " NOT NULL OK"

# Étape 3 : index
curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE INDEX IF NOT EXISTS ideas_user_id_idx ON public.ideas(user_id)"}' && echo " index OK"

# Étape 4 : drop la policy service_role, créer ideas_own
curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "DROP POLICY IF EXISTS \"Service role full access\" ON public.ideas"}' && echo " drop policy OK"

curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "DO $$ BEGIN CREATE POLICY \"ideas_own\" ON public.ideas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$"}' && echo " policy OK"
```

Expected : toutes les lignes se terminent par "OK"

- [ ] **Step 3 : Vérifier en base**

```bash
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

curl -s -X POST "https://supabase.kenomi.eu/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT policyname, cmd FROM pg_policies WHERE schemaname='\''public'\'' AND tablename='\''ideas'\''"}'
```

Expected : `[{"policyname":"ideas_own","cmd":"ALL"}]`

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260516_plan_g_ideas_rls.sql
git commit -m "fix(database): ideas — ajout user_id + policy RLS utilisateur (Plan G)"
```

---

### Task 3 : Ajouter `DASHBOARD_TOKEN_SECRET` dans Coolify et `.env.example`

**Files:**

- Modify: `.env.example`

**Contexte :** `lib/dashboard-token.ts` lance `throw new Error('DASHBOARD_TOKEN_SECRET est requis')` si la variable est absente. En production sur Coolify, cette variable n'a pas encore été ajoutée — le dashboard admin crashe au démarrage.

- [ ] **Step 1 : Ajouter la variable dans Coolify via son API**

```bash
# Récupérer d'abord les envs actuels pour voir l'UUID exact de la variable si elle existe
curl -s "http://192.168.0.19:8000/api/v1/applications/yup6hpmw0fcowrkkf2o3bzl1/envs" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" | python3 -c "import json,sys; envs=json.load(sys.stdin); [print(e['key'], e['uuid']) for e in envs if 'DASHBOARD' in e['key']]" 2>/dev/null
```

Si `DASHBOARD_TOKEN_SECRET` n'apparaît pas, la créer :

```bash
curl -s -X POST "http://192.168.0.19:8000/api/v1/applications/yup6hpmw0fcowrkkf2o3bzl1/envs" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "DASHBOARD_TOKEN_SECRET", "value": "kenomi2025-dashboard-secret-change-me", "is_preview": false}'
```

Expected : réponse JSON avec `"key": "DASHBOARD_TOKEN_SECRET"`

- [ ] **Step 2 : Mettre à jour `.env.example`**

Ouvrir `.env.example`. Ajouter les variables manquantes pour qu'il reflète ce que `.env.local` contient :

```
SUPABASE_URL=https://your-supabase-url.com
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_STUDIO_SERVICE_KEY=your_service_role_key

DATABASE_URL=postgresql://postgres:password@host:5432/postgres

DASHBOARD_PASSWORD=your_dashboard_password
DASHBOARD_TOKEN_SECRET=your_hmac_secret_at_least_32_chars

APP_ORIGIN=https://your-domain.com
ALLOWED_EMAIL=you@example.com
```

**Important :** retirer les valeurs réelles du `.env.example` actuel (il contient la vraie `SUPABASE_SERVICE_ROLE_KEY`).

- [ ] **Step 3 : Redéployer pour prendre en compte la nouvelle variable**

```bash
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```

Expected : `{"deployments":[{"message":"Application kenomi-canvas deployment queued."...}]}`

- [ ] **Step 4 : Commit**

```bash
git add .env.example
git commit -m "fix(config): .env.example — retirer les vraies clés + ajouter DASHBOARD_TOKEN_SECRET"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
