CREATE TABLE IF NOT EXISTS public.agent_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 1440 CHECK (interval_minutes >= 15),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  requires_human_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

ALTER TABLE public.agent_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_schedules_all_own" ON public.agent_schedules;
CREATE POLICY "agent_schedules_all_own" ON public.agent_schedules
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_events_select_own" ON public.agent_events;
CREATE POLICY "agent_events_select_own" ON public.agent_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent_events_insert_own" ON public.agent_events;
CREATE POLICY "agent_events_insert_own" ON public.agent_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_schedules_due_idx
  ON public.agent_schedules(user_id, enabled, next_run_at);

CREATE INDEX IF NOT EXISTS agent_events_user_created_idx
  ON public.agent_events(user_id, created_at DESC);
