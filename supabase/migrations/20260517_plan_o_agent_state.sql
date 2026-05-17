ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS paused       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS run_count    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at  timestamptz;
