CREATE TABLE IF NOT EXISTS public.campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  channel text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'blocked', 'approved', 'published', 'failed', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_drafts_own" ON public.campaign_drafts;
CREATE POLICY "campaign_drafts_own" ON public.campaign_drafts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS campaign_drafts_venture_status_idx
  ON public.campaign_drafts(venture_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS campaign_drafts_user_created_idx
  ON public.campaign_drafts(user_id, created_at DESC);
