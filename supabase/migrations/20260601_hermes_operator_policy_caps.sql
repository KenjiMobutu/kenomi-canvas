ALTER TABLE public.user_operator_settings
  ADD COLUMN IF NOT EXISTS notification_mode text NOT NULL DEFAULT 'studio_only',
  ADD COLUMN IF NOT EXISTS max_auto_actions_per_day integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS max_auto_prospect_runs_per_day integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_auto_follow_up_scans_per_day integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_auto_devops_runs_per_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.user_operator_settings
  DROP CONSTRAINT IF EXISTS user_operator_settings_notification_mode_check;

ALTER TABLE public.user_operator_settings
  ADD CONSTRAINT user_operator_settings_notification_mode_check
  CHECK (notification_mode IN ('studio_only', 'email', 'webhook'));

ALTER TABLE public.hermes_operator_recommendations
  ADD COLUMN IF NOT EXISTS policy_block_reason text,
  ADD COLUMN IF NOT EXISTS auto_execution_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_execution_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_execution_blocked_at timestamptz;

ALTER TABLE public.hermes_operator_runs
  ADD COLUMN IF NOT EXISTS blocked_by_policy_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_by_policy_reason_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS hermes_operator_recommendations_user_created_idx
  ON public.hermes_operator_recommendations(user_id, created_at DESC);
