CREATE TABLE IF NOT EXISTS public.hermes_operator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  status text NOT NULL,
  model text NOT NULL,
  model_family text NOT NULL,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL DEFAULT '',
  executed_actions_count integer NOT NULL DEFAULT 0,
  enqueued_jobs_count integer NOT NULL DEFAULT 0,
  alerts_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_operator_runs_mode_check CHECK (mode IN ('observe', 'recommend', 'act')),
  CONSTRAINT hermes_operator_runs_status_check CHECK (status IN ('completed', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS public.hermes_operator_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hermes_operator_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  priority integer NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  action_type text,
  risk_level text,
  status text NOT NULL DEFAULT 'open',
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_operator_recommendations_status_check
    CHECK (status IN ('open', 'accepted', 'dismissed', 'executed', 'expired'))
);

CREATE TABLE IF NOT EXISTS public.user_operator_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_mode text NOT NULL DEFAULT 'observe',
  notify_in_studio boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT false,
  notify_webhook boolean NOT NULL DEFAULT false,
  notification_webhook_url text NOT NULL DEFAULT '',
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_operator_settings_mode_check CHECK (operator_mode IN ('observe', 'recommend', 'act'))
);

ALTER TABLE public.hermes_operator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_operator_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_operator_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hermes_operator_runs_own ON public.hermes_operator_runs;
CREATE POLICY hermes_operator_runs_own
  ON public.hermes_operator_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hermes_operator_recommendations_own ON public.hermes_operator_recommendations;
CREATE POLICY hermes_operator_recommendations_own
  ON public.hermes_operator_recommendations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_operator_settings_own ON public.user_operator_settings;
CREATE POLICY user_operator_settings_own
  ON public.user_operator_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_operator_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_operator_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_operator_settings TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_operator_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_operator_recommendations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_operator_settings TO service_role;

CREATE INDEX IF NOT EXISTS hermes_operator_runs_user_created_idx
  ON public.hermes_operator_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hermes_operator_recommendations_user_status_idx
  ON public.hermes_operator_recommendations(user_id, status, created_at DESC);
