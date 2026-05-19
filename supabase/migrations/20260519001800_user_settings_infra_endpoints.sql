ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS proxmox_base_url text DEFAULT 'https://192.168.0.10:8006',
  ADD COLUMN IF NOT EXISTS proxmox_node text DEFAULT 'pve',
  ADD COLUMN IF NOT EXISTS coolify_url text DEFAULT 'http://192.168.0.19:8000',
  ADD COLUMN IF NOT EXISTS nginx_pm_url text DEFAULT 'https://npm.tailnet.local',
  ADD COLUMN IF NOT EXISTS uptime_kuma_url text DEFAULT 'https://uptime.tailnet.local',
  ADD COLUMN IF NOT EXISTS vaultwarden_url text DEFAULT 'https://vault.tailnet.local';

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
    nginx_pm_url,
    uptime_kuma_url,
    vaultwarden_url
  FROM public.user_settings;

GRANT SELECT ON public.user_settings_public TO authenticated;
