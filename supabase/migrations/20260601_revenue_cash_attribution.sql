CREATE TABLE IF NOT EXISTS public.payment_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  payment_provider text NOT NULL DEFAULT 'stripe',
  payment_reference text,
  stripe_payment_intent_id text,
  checkout_session_id text,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  offer_variant text,
  outreach_angle text,
  source text,
  band text,
  amount_eur numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'eur',
  payment_status text NOT NULL DEFAULT 'pending',
  attribution_status text NOT NULL DEFAULT 'unknown',
  confidence_score numeric(4,2) NOT NULL DEFAULT 0,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attributions_payment_status_check
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'cancelled')),
  CONSTRAINT payment_attributions_attribution_status_check
    CHECK (attribution_status IN ('exact', 'inferred', 'unknown'))
);

ALTER TABLE public.payment_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attributions_own ON public.payment_attributions;
CREATE POLICY payment_attributions_own
  ON public.payment_attributions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_attributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_attributions TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attributions_checkout_session_uidx
  ON public.payment_attributions(checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attributions_payment_intent_uidx
  ON public.payment_attributions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_attributions_user_attributed_idx
  ON public.payment_attributions(user_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS payment_attributions_user_offer_idx
  ON public.payment_attributions(user_id, offer_id, payment_status, attributed_at DESC);
