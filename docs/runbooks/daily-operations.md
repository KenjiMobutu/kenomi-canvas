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
