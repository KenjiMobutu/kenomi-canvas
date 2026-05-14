-- Kenomi Business Factory — Schema initial
-- Les tables ideas, ventures, landing_pages, metrics, campaigns, decisions
-- existent déjà dans Supabase. Cette migration crée uniquement les nouvelles tables.
-- On utilise CREATE TABLE IF NOT EXISTS pour idempotence.

CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venture_id uuid REFERENCES ventures(id) ON DELETE CASCADE,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount_eur numeric(10,2) NOT NULL,
  currency text DEFAULT 'eur',
  status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  customer_email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venture_id uuid REFERENCES ventures(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  amount_eur numeric(10,2) NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  telegram_message_id bigint,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venture_id uuid REFERENCES ventures(id) ON DELETE CASCADE,
  slug text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(slug, email)
);
