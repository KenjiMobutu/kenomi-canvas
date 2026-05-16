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

-- Garde : échoue explicitement si aucun utilisateur n'existe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'auth.users est vide — migration impossible sans utilisateur existant';
  END IF;
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

-- 2a. ideas (pas de venture_id ni user_id — RLS activé sans policy = accès service_role uniquement)
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

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

-- Index pour les tables legacy (ideas exclue : pas de venture_id)
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

DROP TABLE IF EXISTS public.automations CASCADE;

-- ──────────────────────────────────────────────────────────
-- Commentaire de documentation
-- ──────────────────────────────────────────────────────────

COMMENT ON TABLE public.ventures IS
  'Ventures studio. user_id NOT NULL depuis 2026-05-16 (audit fix).';

COMMENT ON TABLE public.waitlist IS
  'Inscriptions waitlist publiques. Insert restreint aux venture_id existants depuis 2026-05-16.';
