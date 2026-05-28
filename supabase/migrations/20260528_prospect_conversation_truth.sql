CREATE TABLE IF NOT EXISTS public.prospect_conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'positive_reply',
      'soft_interest',
      'hard_no',
      'budget_block',
      'timing_block',
      'wrong_person',
      'referral',
      'meeting_booked',
      'closed_won',
      'closed_lost'
    )
  ),
  event_value text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospect_conversation_events_own ON public.prospect_conversation_events;
CREATE POLICY prospect_conversation_events_own
  ON public.prospect_conversation_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_conversation_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_conversation_events TO service_role;

CREATE INDEX IF NOT EXISTS prospect_conversation_events_user_created_idx
  ON public.prospect_conversation_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_conversation_events_prospect_created_idx
  ON public.prospect_conversation_events(prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_conversation_events_user_type_idx
  ON public.prospect_conversation_events(user_id, event_type, created_at DESC);
