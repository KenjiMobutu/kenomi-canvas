ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS prompt_tokens integer,
  ADD COLUMN IF NOT EXISTS completion_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(10,6);

CREATE INDEX IF NOT EXISTS agent_runs_user_cost_idx
  ON public.agent_runs(user_id, created_at DESC)
  WHERE cost_usd IS NOT NULL;
