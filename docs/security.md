# Security Model

Kenomi Canvas considère toutes les surfaces admin et studio comme privées par défaut.

- `/studio/*` — Supabase Auth + `ALLOWED_EMAIL`.
- `/dashboard/*` — cookie HMAC journalier.
- Egress vers des hôtes privés — requiert `TRUSTED_PRIVATE_HOSTS` (CSV).
- `/api/studio/services/health` — protégée par Supabase Auth.
- `Hermes Agent` — exposé publiquement via Coolify, mais l'instance Ollama derrière reste privée sur le Mac Mini M4.
- `Hermes Operator` — surface privée d'orchestration business, attachée à Supabase Auth, au scheduler interne et aux garde-fous d'autonomie.
- `Ollama` — jamais exposé directement au navigateur public.
- Waitlist — rate-limitée et validée en entrée.
- Secrets — jamais retournés bruts au browser ; uniquement des flags de présence.
- Actions agents et automations — loggées dans `agent_events`.
- Actions autonomes risquées — passent par `autonomy_actions` et `human_approvals` avant tout appel Stripe, Coolify, publication marketing ou augmentation de budget.
- Notifications opérateur — n'exécutent jamais directement d'écritures sensibles; elles recommandent ou enqueue uniquement du low-risk tant que le mode runtime ne permet pas davantage.
- Mode arrêt — `AUTONOMY_ENABLED=false` bloque l'orchestration autonome ; `AUTONOMY_DRY_RUN=true` neutralise les effets externes approuvés.
- Export RGPD — `GET /api/studio/privacy/export` retourne les données sanitisées (pas de secrets en clair).

## Privacy Controls

- Export : `GET /api/studio/privacy/export` couvre settings, ventures, conversations, messages, documents, automations, runs agents, runs automations et événements agents.
- Redaction : les secrets connus sont remplacés par des flags de présence via `redactPrivacyExport`.
- Robustesse : les erreurs de lecture partielles sont retournées dans `export_errors` au lieu de faire disparaître silencieusement une section.
- Suppression : `POST /api/studio/privacy/delete` exige un token temporel comparé en temps constant et journalise `privacy.delete.confirmed` avant purge.
- Portée : la suppression cible les tables studio liées au `user_id`; les surfaces admin restent protégées par le modèle HMAC séparé.

## Incident References

- Autonomie : `docs/runbooks/autonomy-incident.md`
- Stripe : `docs/runbooks/stripe-webhook.md`
- Coolify : `docs/runbooks/coolify-deploy.md`
