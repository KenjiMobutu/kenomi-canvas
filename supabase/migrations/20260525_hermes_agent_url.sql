ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS hermes_agent_url text DEFAULT 'https://hermes.kenomi.eu';

CREATE OR REPLACE VIEW public.user_settings_public
  WITH (security_invoker = true)
AS
  SELECT
    user_id,
    ollama_base_url,
    ollama_model,
    display_name,
    studio_timezone,
    budget_cap_euros,
    supabase_url,
    proxmox_base_url,
    proxmox_node,
    coolify_url,
    hermes_agent_url,
    nginx_pm_url,
    uptime_kuma_url,
    vaultwarden_url
  FROM public.user_settings;

GRANT SELECT ON public.user_settings_public TO authenticated;
