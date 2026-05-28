CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  target_icp text,
  default_price_eur numeric(12,2),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers_own" ON public.offers;
CREATE POLICY "offers_own" ON public.offers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO service_role;

CREATE INDEX IF NOT EXISTS offers_user_created_idx
  ON public.offers(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS offers_user_status_idx
  ON public.offers(user_id, status, created_at DESC);

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_variant text,
  ADD COLUMN IF NOT EXISTS outreach_angle text;

CREATE INDEX IF NOT EXISTS prospects_user_offer_idx
  ON public.prospects(user_id, offer_id, pipeline_status);
