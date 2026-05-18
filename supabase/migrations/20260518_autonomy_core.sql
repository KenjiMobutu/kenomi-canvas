CREATE TABLE IF NOT EXISTS public.autonomy_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  locked_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autonomy_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autonomy_jobs_own" ON public.autonomy_jobs;
CREATE POLICY "autonomy_jobs_own" ON public.autonomy_jobs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS autonomy_jobs_due_idx
  ON public.autonomy_jobs(user_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS public.autonomy_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.autonomy_jobs(id) ON DELETE SET NULL,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'blocked', 'running', 'completed', 'failed', 'cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autonomy_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autonomy_actions_own" ON public.autonomy_actions;
CREATE POLICY "autonomy_actions_own" ON public.autonomy_actions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS autonomy_actions_job_idx
  ON public.autonomy_actions(job_id);

CREATE TABLE IF NOT EXISTS public.human_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.autonomy_actions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.human_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "human_approvals_own" ON public.human_approvals;
CREATE POLICY "human_approvals_own" ON public.human_approvals
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS human_approvals_action_idx
  ON public.human_approvals(action_id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS checkout_mode text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS autonomy_action_id uuid REFERENCES public.autonomy_actions(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ALTER COLUMN customer_email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS payments_autonomy_action_idx
  ON public.payments(autonomy_action_id);

-- Created earlier by 20260516_audit_db_fixes2 because that migration also
-- enables RLS on this table. Keep this guard for existing databases that may
-- have skipped the audit migration or already contain a partial legacy table.
CREATE TABLE IF NOT EXISTS public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  decision text,
  reason text,
  metrics_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS metrics_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decisions_own" ON public.decisions;
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

CREATE INDEX IF NOT EXISTS decisions_venture_created_idx
  ON public.decisions(venture_id, created_at DESC);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.venture_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'kenomi',
  value numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venture_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venture_events_own" ON public.venture_events;
CREATE POLICY "venture_events_own" ON public.venture_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS venture_events_venture_time_idx
  ON public.venture_events(venture_id, occurred_at DESC);
