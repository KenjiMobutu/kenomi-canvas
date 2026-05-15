-- ============================================================
-- Audit DB fixes — 2026-05-15
-- 1. RLS pour payments, budget_requests, waitlist
-- 2. Index manquants sur venture_id et user_id
-- 3. Fix ventures_own policy (ajouter WITH CHECK)
-- 4. Commentaire conversations.agent_id
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. RLS sur les tables financières (étaient exposées sans RLS)
-- ──────────────────────────────────────────────────────────

ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist        ENABLE ROW LEVEL SECURITY;

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
-- 4. Index manquants sur user_id
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
-- 5. Commentaire conversations.agent_id
-- ──────────────────────────────────────────────────────────

COMMENT ON COLUMN public.conversations.agent_id IS
  'Agent slug (ex: decision, scout). Migré uuid→text le 2026-05-15 (USING NULL a effacé les anciens UUID).';
