-- ============================================================
-- Schema fixes — applied live 2026-05-15 via pg/query
-- ============================================================

-- 1. conversations.agent_id: uuid → text (stores agent slug e.g. 'decision')
ALTER TABLE public.conversations
  ALTER COLUMN agent_id TYPE text USING NULL;

-- 2. user_settings: add studio configuration columns
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS claude_api_key        text,
  ADD COLUMN IF NOT EXISTS openai_api_key        text,
  ADD COLUMN IF NOT EXISTS stripe_secret_key     text,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret text,
  ADD COLUMN IF NOT EXISTS supabase_url          text    DEFAULT 'https://supabase.kenomi.eu',
  ADD COLUMN IF NOT EXISTS display_name          text    DEFAULT 'Kenomi Operator',
  ADD COLUMN IF NOT EXISTS studio_timezone       text    DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS budget_cap_euros      integer DEFAULT 50;

-- 3. achievement_claims: track claimed gamification achievements
CREATE TABLE IF NOT EXISTS public.achievement_claims (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text        NOT NULL,
  xp             integer     NOT NULL DEFAULT 0,
  claimed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.achievement_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY achievement_claims_own ON public.achievement_claims
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
