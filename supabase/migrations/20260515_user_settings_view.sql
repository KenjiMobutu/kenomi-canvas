-- Restreindre l'accès aux clés API sensibles dans user_settings
-- Les clients browser voient une vue sans les colonnes sensibles.
-- Les routes serveur (service role) lisent la table complète.

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
    supabase_url
  FROM public.user_settings;

GRANT SELECT ON public.user_settings_public TO authenticated;
