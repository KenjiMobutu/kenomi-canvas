ALTER TABLE public.autonomy_actions
  ADD COLUMN IF NOT EXISTS estimated_cost_eur numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_cap_eur numeric;

CREATE INDEX IF NOT EXISTS autonomy_actions_budget_idx
  ON public.autonomy_actions(user_id, action_type, status, estimated_cost_eur);
