ALTER TABLE public.autonomy_jobs
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS runner_type text;

CREATE INDEX IF NOT EXISTS autonomy_jobs_runner_due_idx
  ON public.autonomy_jobs(status, kind, next_run_at);

CREATE INDEX IF NOT EXISTS autonomy_jobs_running_expiry_idx
  ON public.autonomy_jobs(status, kind, lock_expires_at);
