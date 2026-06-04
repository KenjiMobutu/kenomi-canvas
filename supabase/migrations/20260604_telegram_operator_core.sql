ALTER TABLE public.user_operator_settings
  ADD COLUMN IF NOT EXISTS telegram_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_allowed_chat_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_bot_label text NOT NULL DEFAULT 'Hermes';

CREATE TABLE IF NOT EXISTS public.operator_remote_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram')),
  remote_actor text NOT NULL DEFAULT '',
  intent_kind text NOT NULL,
  raw_text text NOT NULL DEFAULT '',
  executed boolean NOT NULL DEFAULT false,
  blocked_reason text,
  response_summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_remote_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operator_remote_commands_own ON public.operator_remote_commands;
CREATE POLICY operator_remote_commands_own
  ON public.operator_remote_commands
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_remote_commands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_remote_commands TO service_role;

CREATE INDEX IF NOT EXISTS operator_remote_commands_user_created_idx
  ON public.operator_remote_commands(user_id, created_at DESC);
