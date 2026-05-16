-- Table des runs d'automation avec historique complet
CREATE TABLE IF NOT EXISTS automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id     uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  http_status     int,
  duration_ms     int,
  error_message   text,
  triggered_at    timestamptz NOT NULL DEFAULT now()
);

-- Index pour requêtes par workflow (liste des runs récents)
CREATE INDEX IF NOT EXISTS automation_runs_workflow_id_idx
  ON automation_runs (workflow_id, triggered_at DESC);

-- Index pour requêtes par user (vue globale)
CREATE INDEX IF NOT EXISTS automation_runs_user_id_idx
  ON automation_runs (user_id, triggered_at DESC);

-- RLS
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_runs_own"
  ON automation_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
