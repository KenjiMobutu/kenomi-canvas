-- Decisions legacy compatibility — self-hosted Supabase/Coolify.
-- Older Kenomi databases can still have legacy public.decisions.agent/action
-- columns marked NOT NULL. Modern revenue autopilot writes decision/reason/
-- metrics_snapshot, so legacy required columns must not block inserts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'decisions'
      AND column_name = 'agent'
  ) THEN
    EXECUTE 'ALTER TABLE public.decisions ALTER COLUMN agent DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'decisions'
      AND column_name = 'action'
  ) THEN
    EXECUTE 'ALTER TABLE public.decisions ALTER COLUMN action DROP NOT NULL';
  END IF;
END $$;
