CREATE TABLE IF NOT EXISTS public.weekly_revenue_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'saved',
  summary_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_revenue_reviews_status_check CHECK (status IN ('saved')),
  CONSTRAINT weekly_revenue_reviews_week_unique UNIQUE (user_id, week_start, week_end)
);

ALTER TABLE public.weekly_revenue_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_revenue_reviews_own ON public.weekly_revenue_reviews;
CREATE POLICY weekly_revenue_reviews_own
  ON public.weekly_revenue_reviews
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_revenue_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_revenue_reviews TO service_role;

CREATE INDEX IF NOT EXISTS weekly_revenue_reviews_user_week_idx
  ON public.weekly_revenue_reviews(user_id, week_start DESC);
