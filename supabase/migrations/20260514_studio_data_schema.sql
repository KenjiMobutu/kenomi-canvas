-- ============================================================
-- Studio data tables: ventures (alter existing), services,
-- campaigns, kpi_snapshots, funnel_steps
-- ============================================================

-- ventures already exists with a different schema — add missing columns
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS niche text DEFAULT '';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS stage text DEFAULT 'Validation';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS score integer DEFAULT 0;
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS mrr text DEFAULT '€0';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS cac text DEFAULT '€0';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS conversion text DEFAULT '0%';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS next_action text DEFAULT '';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS insight text DEFAULT '';
ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ventures_own" ON public.ventures
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- services (infrastructure)
CREATE TABLE IF NOT EXISTS public.services (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'Draft',
  detail text DEFAULT '',
  endpoint text DEFAULT 'https://service.local',
  role text DEFAULT '',
  next_action text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "services_own" ON public.services
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- campaigns (marketing)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  draft_count integer DEFAULT 0,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "campaigns_own" ON public.campaigns
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- kpi_snapshots (analytics metrics per period)
CREATE TABLE IF NOT EXISTS public.kpi_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period text NOT NULL,
  revenue text DEFAULT '€0',
  revenue_delta text DEFAULT '+0%',
  ctr text DEFAULT '0%',
  ctr_delta text DEFAULT '+0 pts',
  conversion text DEFAULT '0%',
  conversion_delta text DEFAULT '+0 pts',
  retention text DEFAULT '0%',
  retention_delta text DEFAULT '+0 pts',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period)
);

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "kpis_own" ON public.kpi_snapshots
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- funnel_steps (analytics conversion funnel)
CREATE TABLE IF NOT EXISTS public.funnel_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  rate text NOT NULL,
  UNIQUE(user_id, position)
);

ALTER TABLE public.funnel_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "funnel_own" ON public.funnel_steps
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
