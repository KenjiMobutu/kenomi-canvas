-- Payment revenue truth — distinguish expected revenue from cash collected.
-- `amount_eur` is legacy and remains the expected checkout amount. New revenue
-- logic must use `collected_amount_eur` for ROI, scaling and venture revenue.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS expected_amount_eur numeric(10,2),
  ADD COLUMN IF NOT EXISTS collected_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;

UPDATE public.payments
SET expected_amount_eur = COALESCE(expected_amount_eur, amount_eur)
WHERE expected_amount_eur IS NULL;

UPDATE public.payments p
SET collected_amount_eur = COALESCE(
  (
    SELECT (ve.value::numeric / 100.0)::numeric(10,2)
    FROM public.venture_events ve
    WHERE ve.event_type = 'payment_succeeded'
      AND ve.metadata->>'stripe_session_id' = p.stripe_session_id
    ORDER BY ve.occurred_at DESC
    LIMIT 1
  ),
  CASE
    WHEN p.status IN ('paid', 'completed', 'succeeded', 'success')
      OR p.provider_status IN ('paid', 'completed', 'succeeded', 'success')
    THEN COALESCE(p.collected_amount_eur, p.amount_eur, 0)
    ELSE COALESCE(p.collected_amount_eur, 0)
  END
)
WHERE p.checkout_url IS NOT NULL;

UPDATE public.ventures v
SET revenus_total = COALESCE((
  SELECT sum(p.collected_amount_eur)
  FROM public.payments p
  WHERE p.venture_id = v.id
    AND p.status = 'completed'
), 0)
WHERE EXISTS (
  SELECT 1
  FROM public.payments p
  WHERE p.venture_id = v.id
);

CREATE INDEX IF NOT EXISTS payments_collected_status_idx
  ON public.payments(venture_id, status, collected_amount_eur, created_at DESC);
