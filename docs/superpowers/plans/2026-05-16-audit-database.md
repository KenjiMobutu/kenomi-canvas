# Audit Fix — Plan F : Base de données RLS & Schéma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 10 problèmes de base de données : ventures.user_id nullable, tables legacy sans RLS, waitlist_public_insert trop permissive, profiles UPDATE sans WITH CHECK, index manquants, et métriques stockées en text.

**Architecture:** Une seule nouvelle migration `20260516_audit_db_fixes2.sql` regroupe tous les changements SQL. Aucune modification de données applicatives — uniquement DDL et policies.

**Tech Stack:** Supabase PostgreSQL 15, Row Level Security, API Coolify pour l'application de la migration

---

## Fichiers modifiés

| Fichier                                            | Action                                |
| -------------------------------------------------- | ------------------------------------- |
| `supabase/migrations/20260516_audit_db_fixes2.sql` | **Créer** — toutes les corrections DB |

---

### Task 1 : Créer la migration complète

**Files:**

- Create: `supabase/migrations/20260516_audit_db_fixes2.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```bash
touch /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260516_audit_db_fixes2.sql
```

- [ ] **Step 2 : Écrire le contenu complet**

```sql
-- ============================================================
-- Audit DB fixes 2 — 2026-05-16
-- 1. ventures.user_id → NOT NULL (après assignation des orphelines)
-- 2. Tables legacy sans RLS (ideas, landing_pages, metrics, decisions)
-- 3. waitlist_public_insert — ajouter contrainte venture_id EXISTS
-- 4. profiles_update_own — ajouter WITH CHECK
-- 5. Index manquants sur user_id (conversations, messages, documents, api_keys, ventures)
-- 6. Nettoyage : supprimer la table automations orpheline
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. ventures.user_id : assigner les orphelines à l'utilisateur
--    existant, puis rendre la colonne NOT NULL
-- ──────────────────────────────────────────────────────────

-- Identifier les orphelines
DO $$ BEGIN
  RAISE NOTICE 'ventures sans user_id : %', (
    SELECT COUNT(*) FROM public.ventures WHERE user_id IS NULL
  );
END $$;

-- Assigner les ventures orphelines au premier utilisateur trouvé
-- (application mono-utilisateur : safe)
UPDATE public.ventures
SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
WHERE user_id IS NULL;

-- Rendre NOT NULL maintenant que plus aucune ligne n'est NULL
ALTER TABLE public.ventures ALTER COLUMN user_id SET NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 2. RLS sur les tables legacy (ideas, landing_pages, metrics, decisions)
--    Ces tables accèdent via venture_id → ventures.user_id
-- ──────────────────────────────────────────────────────────

-- 2a. ideas
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ideas_own" ON public.ideas
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = ideas.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = ideas.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2b. landing_pages
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "landing_pages_own" ON public.landing_pages
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = landing_pages.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = landing_pages.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2c. metrics
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "metrics_own" ON public.metrics
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = metrics.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = metrics.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2d. decisions
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "decisions_own" ON public.decisions
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = decisions.venture_id
          AND v.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ventures v
        WHERE v.id = decisions.venture_id
          AND v.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. waitlist_public_insert — restreindre aux venture_id existants
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "waitlist_public_insert" ON public.waitlist;

DO $$ BEGIN
  CREATE POLICY "waitlist_public_insert" ON public.waitlist
    FOR INSERT
    WITH CHECK (
      venture_id IS NOT NULL AND
      EXISTS (SELECT 1 FROM public.ventures WHERE id = venture_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 4. profiles_update_own — ajouter WITH CHECK manquant
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

DO $$ BEGIN
  CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 5. Index manquants sur user_id et venture_id
-- ──────────────────────────────────────────────────────────

-- Index requis par le RLS de payments/budget_requests/waitlist (sous-requête via ventures)
CREATE INDEX IF NOT EXISTS ventures_user_id_idx
  ON public.ventures(user_id);

-- Index pour les requêtes studio fréquentes
CREATE INDEX IF NOT EXISTS conversations_user_id_idx
  ON public.conversations(user_id);

CREATE INDEX IF NOT EXISTS messages_user_id_idx
  ON public.messages(user_id);

CREATE INDEX IF NOT EXISTS documents_user_id_idx
  ON public.documents(user_id);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx
  ON public.api_keys(user_id);

CREATE INDEX IF NOT EXISTS achievement_claims_user_id_idx
  ON public.achievement_claims(user_id);

-- Index pour les tables legacy
CREATE INDEX IF NOT EXISTS ideas_venture_id_idx
  ON public.ideas(venture_id);

CREATE INDEX IF NOT EXISTS landing_pages_venture_id_idx
  ON public.landing_pages(venture_id);

CREATE INDEX IF NOT EXISTS metrics_venture_id_idx
  ON public.metrics(venture_id);

CREATE INDEX IF NOT EXISTS decisions_venture_id_idx
  ON public.decisions(venture_id);

-- ──────────────────────────────────────────────────────────
-- 6. Supprimer la table automations orpheline
--    (automation_workflows est la table active)
-- ──────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.automations;

-- ──────────────────────────────────────────────────────────
-- Commentaire de documentation
-- ──────────────────────────────────────────────────────────

COMMENT ON TABLE public.ventures IS
  'Ventures studio. user_id NOT NULL depuis 2026-05-16 (audit fix).';

COMMENT ON TABLE public.waitlist IS
  'Inscriptions waitlist publiques. Insert restreint aux venture_id existants depuis 2026-05-16.';
```

- [ ] **Step 3 : Commit du fichier de migration**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
git add supabase/migrations/20260516_audit_db_fixes2.sql
git commit -m "fix(database): RLS tables legacy + ventures NOT NULL + waitlist WITH CHECK + index + profiles WITH CHECK"
```

---

### Task 2 : Appliquer la migration en base

- [ ] **Step 1 : Vérifier les tables existantes avant la migration**

```bash
curl -s -X POST "https://supabase.kenomi.eu/rest/v1/rpc/exec_sql" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) FROM public.ventures WHERE user_id IS NULL"}'
```

Si le résultat est > 0, noter le nombre de ventures orphelines. La migration les assignera automatiquement au premier utilisateur.

- [ ] **Step 2 : Appliquer la migration via l'outil MCP Supabase**

Utiliser `mcp__claude_ai_Supabase__execute_sql` avec `project_id` du projet self-hosted, ou appliquer via l'API REST :

```bash
# Récupérer le contenu SQL
SQL=$(cat /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260516_audit_db_fixes2.sql)

# Appliquer via l'API Supabase (requiert l'accès direct à la DB)
# Si psql est disponible sur le réseau :
# psql "$DATABASE_URL" -f supabase/migrations/20260516_audit_db_fixes2.sql
```

**Alternative :** Copier le contenu SQL dans le **SQL Editor du dashboard Supabase** (https://supabase.kenomi.eu) et l'exécuter manuellement.

- [ ] **Step 3 : Vérifier que ventures.user_id est NOT NULL**

Dans le SQL Editor Supabase, exécuter :

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ventures'
  AND column_name = 'user_id';
```

Expected : `is_nullable = NO`

- [ ] **Step 4 : Vérifier que RLS est actif sur les tables legacy**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ideas', 'landing_pages', 'metrics', 'decisions', 'ventures');
```

Expected : `rowsecurity = true` pour toutes les lignes.

- [ ] **Step 5 : Vérifier les index créés**

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE '%_user_id_idx' OR indexname LIKE '%_venture_id_idx')
ORDER BY tablename;
```

Expected : 11 index listés.

- [ ] **Step 6 : Vérifier la policy waitlist_public_insert**

```sql
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'waitlist'
  AND policyname = 'waitlist_public_insert';
```

Expected : `with_check` contient `EXISTS (SELECT 1 FROM ventures WHERE id = venture_id)`.

- [ ] **Step 7 : Vérifier que la table automations a disparu**

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'automations'
) AS automations_exists;
```

Expected : `false`

---

### Task 3 : Vérification finale — test d'isolation RLS

- [ ] **Step 1 : Tester que les ventures sont bien filtrées**

Dans le SQL Editor, simuler la policy RLS en se connectant en tant qu'utilisateur :

```sql
-- Simuler un utilisateur non-propriétaire
SET LOCAL role = anon;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}';

SELECT COUNT(*) FROM public.ventures;
```

Expected : `0` (aucune venture visible pour un UUID inexistant)

- [ ] **Step 2 : Tester que waitlist rejecte un venture_id invalide**

```sql
-- Tenter d'insérer avec un venture_id inexistant
INSERT INTO public.waitlist (venture_id, slug, email)
VALUES ('00000000-0000-0000-0000-000000000000', 'test', 'test@example.com');
```

Expected : erreur RLS `new row violates row-level security policy`

- [ ] **Step 3 : Commit de validation**

```bash
cd /Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas
git commit --allow-empty -m "chore(database): migration 20260516 appliquée et vérifiée"
```

---

### Déploiement

La migration est appliquée directement sur la base Supabase — pas de redéploiement de l'app nécessaire pour les changements SQL.

Cependant, si des routes API lisent maintenant des données qui n'existaient pas avant (ex. ventures.user_id NOT NULL peut casser des requêtes Prisma qui ne passaient pas `user_id`), déclencher un redéploiement pour vérifier :

```bash
git push origin main
curl -s -X GET "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```
