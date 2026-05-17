-- venture_pipeline : état de la chaîne orchestrée Scout → Decision
CREATE TABLE IF NOT EXISTS public.venture_pipeline (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Output Scout
  idea_title     text NOT NULL DEFAULT '',
  idea_niche     text NOT NULL DEFAULT '',
  idea_problem   text NOT NULL DEFAULT '',
  idea_solution  text NOT NULL DEFAULT '',
  idea_market    text NOT NULL DEFAULT '',
  scout_raw      text NOT NULL DEFAULT '',

  -- Statut global de la chaîne
  -- 'pending_validation' | 'approved' | 'rejected' | 'running' | 'done'
  status         text NOT NULL DEFAULT 'pending_validation',

  -- Outputs des agents suivants (null = pas encore exécuté)
  validation_output  text,
  validation_score   integer,
  builder_output     text,
  payment_output     text,
  marketing_output   text,
  decision_output    text,

  -- Venture créée après validation humaine
  venture_id     uuid REFERENCES public.ventures(id) ON DELETE SET NULL,

  -- Quel agent est en cours d'exécution
  current_agent  text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venture_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_own" ON public.venture_pipeline
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pipeline_user_status_idx
  ON public.venture_pipeline(user_id, status);
