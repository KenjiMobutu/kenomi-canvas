CREATE TABLE IF NOT EXISTS public.business_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.hermes_operator_runs(id) ON DELETE SET NULL,
  severity text NOT NULL,
  category text NOT NULL,
  dedupe_key text NOT NULL,
  headline text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  channel text NOT NULL DEFAULT 'studio',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_alerts_severity_check CHECK (severity IN ('info', 'warn', 'critical')),
  CONSTRAINT business_alerts_status_check CHECK (status IN ('open', 'sent', 'seen', 'resolved', 'muted')),
  CONSTRAINT business_alerts_channel_check CHECK (channel IN ('studio', 'email', 'webhook')),
  CONSTRAINT business_alerts_user_dedupe_unique UNIQUE (user_id, dedupe_key)
);

ALTER TABLE public.business_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_alerts_own ON public.business_alerts;
CREATE POLICY business_alerts_own
  ON public.business_alerts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_alerts TO service_role;

CREATE INDEX IF NOT EXISTS business_alerts_user_status_idx
  ON public.business_alerts(user_id, status, created_at DESC);
