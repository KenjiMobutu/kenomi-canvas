-- Lock down: ENABLE RLS sur kenomi_jobs et saas_opportunities sans policy
-- → seul le service_role (bypass RLS) peut y accéder. Tout autre client (anon
--   key, JWT user) verra une table vide.
--
-- kenomi_jobs est utilisée par un worker externe (optiworker-01) qui passe
-- en service_role, donc cette policy ne casse rien.
-- saas_opportunities est vide et non utilisée, on la sécurise par défaut.

ALTER TABLE public.kenomi_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_opportunities ENABLE ROW LEVEL SECURITY;

-- Pas de CREATE POLICY: l'absence de policy + RLS activée = deny all.
-- Le service_role contourne RLS automatiquement (privilege BYPASSRLS).
