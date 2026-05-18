ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS deletion_token text,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
