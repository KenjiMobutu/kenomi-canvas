-- Vision alignment core — business status columns and indexes.
-- Idempotent migration for the self-hosted Supabase database on Coolify.

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS current_decision text,
  ADD COLUMN IF NOT EXISTS last_decision_at timestamptz;

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS provider_product_id text,
  ADD COLUMN IF NOT EXISTS provider_price_id text,
  ADD COLUMN IF NOT EXISTS provider_session_id text;

ALTER TABLE public.campaign_drafts
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_run_id text,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_status text NOT NULL DEFAULT 'proposed';

ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.ventures
    ADD CONSTRAINT ventures_lifecycle_status_check
    CHECK (lifecycle_status IN ('draft', 'validating', 'ready', 'launched', 'scaling', 'pivoting', 'stopped', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ventures
    ADD CONSTRAINT ventures_current_decision_check
    CHECK (current_decision IS NULL OR current_decision IN ('continue', 'pivot', 'scale', 'stop'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.landing_pages
    ADD CONSTRAINT landing_pages_health_status_check
    CHECK (health_status IN ('unknown', 'missing', 'repair_required', 'ready', 'deployed', 'stopped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_provider_status_check
    CHECK (provider_status IN ('not_configured', 'approval_required', 'pending', 'ready', 'completed', 'failed', 'disabled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.decisions
    ADD CONSTRAINT decisions_action_status_check
    CHECK (action_status IN ('proposed', 'blocked', 'approved', 'executed', 'rejected', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS ventures_lifecycle_idx
  ON public.ventures(user_id, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ventures_current_decision_idx
  ON public.ventures(user_id, current_decision, last_decision_at DESC);

CREATE INDEX IF NOT EXISTS landing_pages_health_idx
  ON public.landing_pages(venture_id, health_status);

CREATE INDEX IF NOT EXISTS payments_provider_status_idx
  ON public.payments(venture_id, provider_status, created_at DESC);

CREATE INDEX IF NOT EXISTS campaign_drafts_published_idx
  ON public.campaign_drafts(user_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS decisions_action_status_idx
  ON public.decisions(venture_id, action_status, created_at DESC);

COMMENT ON COLUMN public.ventures.lifecycle_status IS
  'Canonical supervised autonomy lifecycle status for Kenomi ventures.';

COMMENT ON COLUMN public.landing_pages.health_status IS
  'Public landing readiness status used by Studio repair surfaces.';

COMMENT ON COLUMN public.payments.provider_status IS
  'Stripe/provider readiness status for monetization flows.';
