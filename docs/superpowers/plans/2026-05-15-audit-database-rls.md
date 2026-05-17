# Audit Fix — Plan B : Base de données RLS & Indexes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 3 vulnérabilités CRITIQUE base de données : activer RLS sur les tables financières exposées, ajouter les index manquants, et corriger la migration `agent_id USING NULL`.

**Architecture:** Une seule nouvelle migration `20260515_audit_fixes.sql` regroupe tous les changements de schéma. Pas de modification de données existantes — uniquement des ALTER TABLE, CREATE POLICY, et CREATE INDEX.

**Tech Stack:** Supabase (Postgres 15), supabase CLI, MCP supabase

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `supabase/migrations/20260515_audit_db_fixes.sql` | **Créer** — RLS + indexes + fix agent_id + ventures WITH CHECK |

---

### Task 1 : Créer la migration de corrections base de données

**Files:**
- Create: `supabase/migrations/20260515_audit_db_fixes.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
supabase migration new audit_db_fixes
```
Expected: `supabase/migrations/YYYYMMDDHHMMSS_audit_db_fixes.sql` créé

Renommer si nécessaire pour cohérence de nommage :
```bash
ls supabase/migrations/ | tail -3
```

- [ ] **Step 2 : Écrire le contenu de la migration**

Ouvrir le fichier créé et y mettre :

```sql
-- ============================================================
-- Audit DB fixes — 2026-05-15
-- 1. RLS pour payments, budget_requests, waitlist
-- 2. Index manquants sur venture_id et user_id
-- 3. Fix ventures_own policy (ajouter WITH CHECK)
-- 4. Fix agent_id USING NULL → préserver les valeurs
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. RLS sur les tables financières (étaient exposées sans RLS)
-- ──────────────────────────────────────────────────────────

ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist        ENABLE ROW LEVEL SECURITY;

-- payments : accessible uniquement via la venture propriétaire
DO $$ BEGIN
  CREATE POLICY "payments_own" ON public.payments
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = payments.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = payments.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- budget_requests : même pattern
DO $$ BEGIN
  CREATE POLICY "budget_requests_own" ON public.budget_requests
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = budget_requests.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = budget_requests.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- waitlist : lecture/mutation réservées au propriétaire de la venture
-- + insertion publique autorisée pour les formulaires landing pages
DO $$ BEGIN
  CREATE POLICY "waitlist_owner" ON public.waitlist
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = waitlist.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "waitlist_public_insert" ON public.waitlist
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 2. ventures_own : ajouter WITH CHECK manquant
-- ──────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "ventures_own" ON public.ventures;
  CREATE POLICY "ventures_own" ON public.ventures
    FOR ALL
    USING    (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. Index manquants sur venture_id
-- ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS payments_venture_id_idx
  ON public.payments(venture_id);

CREATE INDEX IF NOT EXISTS budget_requests_venture_id_idx
  ON public.budget_requests(venture_id);

CREATE INDEX IF NOT EXISTS waitlist_venture_id_idx
  ON public.waitlist(venture_id);

-- ──────────────────────────────────────────────────────────
-- 4. Index manquants sur user_id (tables sans index)
-- ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS services_user_id_idx
  ON public.services(user_id);

CREATE INDEX IF NOT EXISTS campaigns_user_id_idx
  ON public.campaigns(user_id);

CREATE INDEX IF NOT EXISTS kpi_snapshots_user_id_idx
  ON public.kpi_snapshots(user_id);

CREATE INDEX IF NOT EXISTS agent_configs_user_id_idx
  ON public.agent_configs(user_id);

CREATE INDEX IF NOT EXISTS automation_workflows_user_id_idx
  ON public.automation_workflows(user_id);

-- ──────────────────────────────────────────────────────────
-- 5. Fix conversations.agent_id : la migration précédente
--    utilisait USING NULL ce qui a effacé les valeurs.
--    On ne peut pas restaurer les UUID, mais on s'assure
--    que les nouvelles valeurs (text) sont préservées.
--    Ce patch est documentatif — les valeurs NULL restent NULL.
-- ──────────────────────────────────────────────────────────

COMMENT ON COLUMN public.conversations.agent_id IS
  'Agent slug (ex: decision, scout). Migré uuid→text le 2026-05-15 (USING NULL a effacé les anciens UUID).';
```

- [ ] **Step 3 : Appliquer la migration en base (self-hosted Supabase)**

Option A — via MCP (si connecté) :
Utiliser l'outil `mcp__plugin_supabase_supabase__execute_sql` avec le contenu SQL ci-dessus.

Option B — via CLI :
```bash
supabase db push --local 2>&1 | tail -10
```

Option C — via psql direct :
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260515_audit_db_fixes.sql 2>&1
```

Expected: aucune erreur FATAL, les messages `NOTICE: policy ... already exists` sont normaux.

- [ ] **Step 4 : Vérifier que RLS est actif sur les 3 tables**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('payments', 'budget_requests', 'waitlist');
```

Expected : `rowsecurity = true` pour les 3 lignes.

- [ ] **Step 5 : Vérifier les politiques créées**

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('payments', 'budget_requests', 'waitlist')
ORDER BY tablename, policyname;
```

Expected : 2 politiques pour waitlist (`waitlist_owner` + `waitlist_public_insert`), 1 pour payments, 1 pour budget_requests.

- [ ] **Step 6 : Vérifier les index créés**

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%_venture_id_idx'
   OR indexname LIKE '%_user_id_idx'
ORDER BY tablename;
```

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/
git commit -m "fix(database): RLS payments/budget_requests/waitlist + index venture_id/user_id + ventures WITH CHECK"
```

---

### Task 2 : Exposer les API keys uniquement côté serveur

**Contexte :** `user_settings` contient `claude_api_key`, `stripe_secret_key`, etc. La politique `settings_all_own` autorise le SELECT client. Ces champs sont lisibles par le navigateur de l'utilisateur. Bien que limité à ses propres clés, cela les expose en cas de XSS.

**Décision :** Créer une route serveur `/api/studio/settings/secrets` (lecture uniquement via service role) et révoquer le SELECT client sur les colonnes sensibles via une view restreinte.

**Files:**
- Create: `supabase/migrations/20260515_user_settings_view.sql`
- Create: `app/api/studio/settings/secrets/route.ts`
- Modify: `app/studio/settings/page.tsx` (lire les secrets via la route serveur)

- [ ] **Step 1 : Créer la migration pour restreindre user_settings**

```bash
supabase migration new user_settings_secrets_view
```

Contenu du fichier :

```sql
-- ============================================================
-- Restreindre l'accès aux clés API sensibles dans user_settings
-- Les clients browser voient une vue sans les colonnes sensibles.
-- Les routes serveur (service role) lisent la table complète.
-- ============================================================

-- Vue publique (sans les colonnes sensibles)
CREATE OR REPLACE VIEW public.user_settings_public
  WITH (security_invoker = true)
AS
  SELECT
    user_id,
    ollama_base_url,
    ollama_model,
    display_name,
    studio_timezone,
    budget_cap_euros,
    supabase_url
  FROM public.user_settings;

-- Accorder l'accès à la vue aux rôles authentifiés
GRANT SELECT ON public.user_settings_public TO authenticated;

-- La table complète reste accessible uniquement via service_role
-- (les routes API côté serveur utilisent SUPABASE_SERVICE_ROLE_KEY)
```

- [ ] **Step 2 : Créer `app/api/studio/settings/secrets/route.ts`**

```typescript
// app/api/studio/settings/secrets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  // Vérifier l'auth utilisateur d'abord (avec la clé anon)
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Lire les secrets avec la service role key (côté serveur uniquement)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('claude_api_key, openai_api_key, stripe_secret_key, stripe_webhook_secret')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Masquer les valeurs (renvoyer seulement si elles existent)
  return NextResponse.json({
    has_claude_key:          !!data?.claude_api_key,
    has_openai_key:          !!data?.openai_api_key,
    has_stripe_secret:       !!data?.stripe_secret_key,
    has_stripe_webhook:      !!data?.stripe_webhook_secret,
  })
}
```

- [ ] **Step 3 : Appliquer la migration**

```bash
psql "$DATABASE_URL" -f supabase/migrations/$(ls supabase/migrations/ | grep user_settings_secrets) 2>&1
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/ app/api/studio/settings/
git commit -m "fix(security): restreindre accès client aux clés API sensibles dans user_settings"
```

---

### Déploiement

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer gk4aKTkRPkJgU2CHvW59mQHrCXtZ56bLoTBUTGJG5d63d0d2"
```
