-- agent_configs: config par agent (modèle, system prompt, température)
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  model text DEFAULT 'qwen3:8b',
  system_prompt text DEFAULT '',
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 2048,
  UNIQUE(user_id, agent_id)
);
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "agent_configs_own" ON public.agent_configs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- automation_workflows: workflows CRUD avec déclenchement réel
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text DEFAULT 'Manual',
  webhook_url text DEFAULT '',
  enabled boolean DEFAULT true,
  run_count integer DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "automations_own" ON public.automation_workflows
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
