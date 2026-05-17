-- Colonne model dans agent_configs (manquante alors que l'UI la gère)
ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'qwen3:8b';

-- Colonnes n8n dans user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS n8n_base_url  text,
  ADD COLUMN IF NOT EXISTS n8n_api_key   text;
