# Security Model

Kenomi Canvas considère toutes les surfaces admin et studio comme privées par défaut.

- `/studio/*` — Supabase Auth + `ALLOWED_EMAIL`.
- `/dashboard/*` — cookie HMAC journalier.
- Egress vers des hôtes privés — requiert `TRUSTED_PRIVATE_HOSTS` (CSV).
- `/api/studio/services/health` — protégée par Supabase Auth.
- Waitlist — rate-limitée et validée en entrée.
- Secrets — jamais retournés bruts au browser ; uniquement des flags de présence.
- Actions agents et automations — loggées dans `agent_events`.
- Export RGPD — `GET /api/studio/privacy/export` retourne les données sanitisées (pas de secrets en clair).
