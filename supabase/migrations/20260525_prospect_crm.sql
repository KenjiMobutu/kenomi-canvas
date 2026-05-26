ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS prospect_sources text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS prospect_outreach_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prospect_crm_provider text NOT NULL DEFAULT 'supabase';

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
    supabase_url,
    proxmox_base_url,
    proxmox_node,
    coolify_url,
    hermes_agent_url,
    prospect_sources,
    prospect_outreach_email,
    prospect_crm_provider,
    nginx_pm_url,
    uptime_kuma_url,
    vaultwarden_url
  FROM public.user_settings;

GRANT SELECT ON public.user_settings_public TO authenticated;

CREATE TABLE IF NOT EXISTS public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_url text,
  company_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_role text,
  score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  band text NOT NULL DEFAULT 'cold',
  outreach_subject text,
  outreach_body text,
  crm_record_id text,
  draft_provider text,
  draft_external_id text,
  draft_created_at timestamptz,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pipeline_status text NOT NULL DEFAULT 'new',
  operator_notes text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  last_activity_at timestamptz,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospects_own" ON public.prospects;
CREATE POLICY "prospects_own" ON public.prospects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS prospects_user_status_idx
  ON public.prospects(user_id, status);

CREATE INDEX IF NOT EXISTS prospects_user_followup_idx
  ON public.prospects(user_id, next_followup_at);

CREATE INDEX IF NOT EXISTS prospects_user_score_idx
  ON public.prospects(user_id, score DESC);

CREATE TABLE IF NOT EXISTS public.prospect_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  detail text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospect_activities_own" ON public.prospect_activities;
CREATE POLICY "prospect_activities_own" ON public.prospect_activities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_activities TO service_role;

CREATE INDEX IF NOT EXISTS prospect_activities_user_prospect_idx
  ON public.prospect_activities(user_id, prospect_id, created_at DESC);
