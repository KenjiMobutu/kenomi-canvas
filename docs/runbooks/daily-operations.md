# Exploitation quotidienne

Ce runbook sert a garder Kenomi Canvas exploitable sans transformer chaque journee
en enquete. Les commandes sont non destructives, sauf indication contraire dans
les runbooks specialises.

## Routine du matin

1. Verifier l'etat local du code et des garde-fous:

```bash
npm run ops:readiness
npm run ops:coherence
npm run typecheck
npm test
npm run lint
```

2. Verifier l'etat applicatif local ou prod-like:

```bash
npm run build
npm run smoke
```

`npm run smoke` accepte `SMOKE_BASE_URL` pour cibler une URL distante:

```bash
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
```

3. Verifier Supabase quand le reseau et les secrets sont disponibles:

```bash
npm run supabase:validate
```

## Baseline revenue-first production

Cette baseline sert a savoir si Kenomi est seulement "pret" ou si la boucle
revenue est prouvee en production.

1. Verifier la version Coolify et le disque:

```bash
ssh coolify "docker ps --filter label=coolify.applicationId=3 --format '{{.Image}} {{.Names}} {{.Status}}'; df -h /"
```

Etat releve le 2026-05-19:

- App: `d0f46644e2122a3a5d3b4207685156f780a4d8c3`
- Container: `yup6hpmw0fcowrkkf2o3bzl1-195903076994`
- Status: `healthy`
- Disque `/`: `89%`

`89%` est une zone warning. Ne pas lancer de nettoyage de volumes Supabase.
Les nettoyages autorises en premier recours sont:

```bash
docker builder prune -af
docker image prune -af
```

2. Verifier les compteurs business canoniques:

```bash
ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select 'payments' metric, count(*) value from public.payments union all select 'venture_events', count(*) from public.venture_events union all select 'published_campaigns', count(*) from public.campaign_drafts where published_at is not null;\""
```

Baseline relevee le 2026-05-19 avant preuve live:

| Metric | Value |
| --- | ---: |
| payments | 0 |
| venture_events | 0 |
| published_campaigns | 0 |

3. Verifier les secrets sans imprimer les valeurs:

```bash
ssh coolify "docker inspect <app-container> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(STRIPE_WEBHOOK_SECRET|AGENT_ORCHESTRATOR_SECRET|APP_ORIGIN|AUTONOMY_ENABLED|AUTONOMY_DRY_RUN)=' | sed 's/=.*/=yes/'"
```

Baseline relevee le 2026-05-19:

- `STRIPE_WEBHOOK_SECRET=yes`
- `AGENT_ORCHESTRATOR_SECRET=yes`
- `APP_ORIGIN=yes`
- `AUTONOMY_ENABLED` absent, donc default code: enabled.
- `AUTONOMY_DRY_RUN` absent, donc default code: effets externes actifs apres approval.

## Preuve 100% autonomie revenue-first

Ne pas annoncer "100% autonomie" tant que les signaux suivants ne sont pas
visibles en production:

```bash
ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select event_type, count(*), max(occurred_at) from public.venture_events group by event_type order by max desc; select status, provider_status, count(*) from public.payments group by status, provider_status; select decision, count(*) from public.decisions group by decision;\""
```

Minimum attendu:

- `payments.status='completed'` > 0
- `venture_events.payment_succeeded` > 0
- `venture_events.campaign_published` > 0
- `venture_events.campaign_spend` > 0
- `venture_events.page_view` > 0
- `venture_events.waitlist_signup` > 0
- `decisions.decision in ('scale', 'cut', 'hold')` > 0

## Avant deploy

1. Confirmer que les gates locales passent:

```bash
npm run format:check
npm run typecheck
npm test
npm run lint
npm run build
```

2. Confirmer que l'autonomie est dans le mode attendu:

- `AUTONOMY_ENABLED=false` bloque l'orchestration.
- `AUTONOMY_DRY_RUN=true` neutralise les effets externes approuves.
- `AUTONOMY_GLOBAL_BUDGET_CAP_EUR` limite les actions budgetees.

3. Confirmer les dependances externes:

- Supabase: `npm run supabase:validate`
- Health HTTP: `curl -i "$APP_ORIGIN/api/health"`
- Smoke HTTP: `SMOKE_BASE_URL="$APP_ORIGIN" npm run smoke`

## Premier diagnostic incident

1. Identifier la surface en panne:

- Auth / studio: verifier `/login`, `/studio`, `ALLOWED_EMAIL`, Supabase Auth.
- Base / RLS: lancer `npm run supabase:validate`.
- Documents: verifier le bucket `documents` via `/api/health`.
- Autonomie: ouvrir `/studio/agents`, puis verifier jobs, actions et approvals.
- Stripe: utiliser [Webhook Stripe](stripe-webhook.md).
- Coolify: utiliser [Deploiement Coolify](coolify-deploy.md).
- Migrations: utiliser [Migrations Supabase](database-migrations.md).

2. Mettre l'autonomie en mode calme si l'incident touche des effets externes:

```bash
AUTONOMY_ENABLED=false
AUTONOMY_DRY_RUN=true
```

3. Rejouer les checks dans cet ordre:

```bash
npm run ops:readiness
npm run ops:coherence
npm run smoke
npm run supabase:validate
```

`npm run ops:coherence` verifie que les pages Studio n'affichent pas des
compteurs critiques sans source explicite. Si ce check echoue, corriger d'abord
la source de verite ou le libelle avant de chercher une panne metier.

4. Ne reparer qu'un axe a la fois: auth, base, storage, LLM, automation,
   paiement, deploiement. Noter le symptome, la commande lancee et le resultat.

## Cadence recommandee

- Quotidien: `ops:readiness`, `ops:coherence`, `typecheck`, `test`, `lint`.
- Avant deploy: `format:check`, `build`, `smoke`, `supabase:validate`.
- Apres incident: ajouter une note au runbook specialise si la procedure a
  manque une etape.
