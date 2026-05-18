# Kenomi Canvas

Studio OS pour entrepreneurs solo — gérez vos ventures, automatisez vos workflows et pilotez votre activité depuis une interface unifiée.

## Fonctionnalités

- **Cockpit** — vue d'ensemble de toutes vos ventures avec scores et KPIs
- **Chat IA** — conversations avec des agents spécialisés (Ollama, streaming SSE)
- **Ventures** — gestion du cycle de vie de vos projets
- **Automations** — workflows n8n déclenchés depuis l'interface
- **Documents** — base de connaissance par venture
- **Gamification** — achievements et progression pour maintenir la motivation
- **Marketing** — landing pages et waitlist publique par venture
- **Infrastructure** — vue de l'état de vos services
- **API Keys** — gestion des clés d'accès
- **Dashboard admin** — back-office séparé avec authentification dédiée

## Stack technique

| Couche          | Technologie                                       |
| --------------- | ------------------------------------------------- |
| Framework       | Next.js 16 (App Router, proxy, standalone output) |
| UI              | React 19, Tailwind CSS v4, Lucide, Sonner         |
| Auth            | Supabase Auth (@supabase/ssr, JWT cookies)        |
| Base de données | Supabase PostgreSQL 15 + Row Level Security       |
| ORM             | Prisma 6 (schéma ventures legacy)                 |
| LLM             | Ollama (local, streaming SSE)                     |
| Automations     | n8n (webhooks)                                    |
| Déploiement     | Docker standalone, Coolify self-hosted            |

## Architecture Status

Kenomi Canvas est le cockpit du Kenomi AI Venture Studio. Il fournit la gestion des ventures, l'exécution des agents, les triggers n8n, la capture waitlist, la santé de l'infrastructure et le routage LLM local-first.

L'autonomie est intentionnellement supervisée : les actions risquées (paiement, déploiement, publication publique) requièrent une approbation humaine explicite.

Statut actuel :

- **Core studio** : cockpit, ventures, documents, marketing, automations, chat IA et API keys opérationnels.
- **Agents** : pipeline séquentiel, runs manuels, audit events et orchestration due/ready/gated via `agent_schedules`.
- **Autonomie** : jobs, actions, approvals, budget gates, kill switch et dry-run sont exposés dans `/studio/agents`.
- **Monétisation** : création Stripe Checkout et webhook `checkout.session.completed` intégrés derrière approbation humaine.
- **Déploiement** : action Coolify déclenchable derrière approbation humaine, avec mode dry-run.
- **Infrastructure** : vue topology alimentée par `/api/studio/infra/services`, avec configuration extensible par variables d'environnement.
- **Privacy** : export RGPD multi-tables et suppression confirmée avec token temporel.
- **Sécurité** : RLS Supabase, allowlist email, proxy Next.js, protections SSRF et secrets côté serveur.

Limites connues avant exploitation autonome continue :

- Backups/restores Supabase documentés et testés.
- Validation locale Supabase complète requiert un accès Docker fonctionnel.
- Authenticated browser smoke test à rejouer avec une session Studio réelle.
- Baseline Prettier à traiter dans un commit dédié.

## Architecture de sécurité

- **Mono-utilisateur** : `ALLOWED_EMAIL` dans le middleware bloque tout autre compte
- **RLS Supabase** : chaque table est isolée par `user_id` — aucune donnée cross-utilisateur possible
- **Auth à deux niveaux** : Supabase Auth pour `/studio`, HMAC SHA-256 pour `/dashboard`
- **Signup désactivé** : GoTrue `DISABLE_SIGNUP=true` + redirect middleware `/signup → /login`
- **SSRF protection** : blocklist IP privées (IPv4, IPv6, hex, décimal, IPv6-mapped)

## Installation locale

```bash
# Dépendances
npm install

# Variables d'environnement
cp .env.example .env.local
# Remplir NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ALLOWED_EMAIL, DASHBOARD_TOKEN_SECRET

# Générer le client Prisma
npx prisma generate

# Lancer en développement
npm run dev
```

## Variables d'environnement requises

| Variable                        | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL de l'instance Supabase                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase (publique)                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Clé service role Supabase (serveur uniquement)                   |
| `DATABASE_URL`                  | URL PostgreSQL pour Prisma                                       |
| `ALLOWED_EMAIL`                 | Seul email autorisé à accéder au studio                          |
| `DASHBOARD_PASSWORD`            | Mot de passe du dashboard admin                                  |
| `DASHBOARD_TOKEN_SECRET`        | Secret HMAC pour les tokens dashboard                            |
| `APP_ORIGIN`                    | URL publique de l'application                                    |
| `STRIPE_SECRET_KEY`             | Clé serveur Stripe, idéalement restricted key par environnement  |
| `STRIPE_WEBHOOK_SECRET`         | Secret de signature du webhook Stripe `/api/stripe/webhook`      |
| `COOLIFY_URL`                   | URL API Coolify autorisée côté serveur                           |
| `COOLIFY_TOKEN`                 | Token API Coolify côté serveur                                   |
| `TRUSTED_PRIVATE_HOSTS`         | Hosts privés autorisés pour appels serveur, séparés par virgules |

### Health check

`GET /api/health` vérifie l'env, Prisma/PostgreSQL, Supabase REST et le bucket Storage `documents`.
Par défaut, chaque dépendance est considérée requise et une panne retourne `503`.

Pour un environnement local ou de preview où Prisma n'est pas censé joindre la base directe, définir :

```bash
HEALTH_DATABASE_REQUIRED=false
```

Les équivalents `HEALTH_SUPABASE_REQUIRED=false` et `HEALTH_STORAGE_REQUIRED=false` existent pour isoler un incident ou un environnement incomplet, mais ne doivent pas être utilisés en production autonome.

### Métriques Prometheus

`GET /api/metrics` expose un endpoint au format Prometheus avec :

- `kenomi_process_*` — CPU, mémoire, event loop (defaults `prom-client`)
- `kenomi_nodejs_*` — version, GC, heap
- `kenomi_agent_runs_total{agent_id, provider, fallback}` — compteur par run
- `kenomi_agent_run_cost_usd_total{agent_id, model}` — coût cumulé en USD
- `kenomi_http_requests_total{method, route, status}` — compteur HTTP
- `kenomi_http_request_duration_ms{method, route, status}` — histogramme

Protection optionnelle via `METRICS_TOKEN` : si défini, l'endpoint exige `Authorization: Bearer <token>`. Sinon ouvert.

Scrape config Prometheus exemple :

```yaml
scrape_configs:
  - job_name: kenomi-canvas
    metrics_path: /api/metrics
    static_configs:
      - targets: ['lab.kenomi.eu:443']
    scheme: https
    authorization:
      credentials: <METRICS_TOKEN>
```

### Runbooks opérationnels

- [Incident autonomie](docs/runbooks/autonomy-incident.md)
- [Webhook Stripe](docs/runbooks/stripe-webhook.md)
- [Déploiement Coolify](docs/runbooks/coolify-deploy.md)
- [Migrations Supabase](docs/runbooks/database-migrations.md)
- [Smoke tests (HTTP + browser auth)](docs/runbooks/smoke-tests.md)

## Déploiement

L'application est packagée en image Docker standalone et déployée via Coolify.

```bash
# Build
docker build -t kenomi-canvas .

# Push + déploiement automatique via Coolify webhook
git push origin main
```

## Base de données

Les migrations Supabase sont dans `supabase/migrations/`. Elles s'appliquent manuellement via l'éditeur SQL du dashboard Supabase ou via l'API.

```bash
# Vérifier l'état des migrations
ls supabase/migrations/
```

## Tests

```bash
npm test
```

## Structure du projet

```
app/
├── studio/          # Interface principale (auth Supabase requise)
│   ├── page.tsx     # Cockpit
│   ├── chat/        # Chat IA
│   ├── ventures/    # Gestion des ventures
│   ├── automations/ # Workflows n8n
│   ├── documents/   # Base de connaissance
│   ├── gamification/
│   ├── marketing/
│   ├── api-keys/
│   └── settings/
├── dashboard/       # Back-office admin (auth HMAC requise)
├── api/             # Routes API
│   ├── studio/chat/ # Streaming SSE chat
│   └── waitlist/    # Inscription waitlist publique
└── [slug]/          # Pages waitlist publiques par venture

lib/
├── agent-orchestration.ts # Calcul des schedules agents
├── auth-server.ts   # Helper requireAllowedUser (routes API)
├── privacy-export.ts # Export RGPD et redaction secrets
├── security.ts      # Validation SSRF des webhooks
├── dashboard-token.ts # Auth HMAC dashboard
└── supabase*.ts     # Clients Supabase (browser / server)
```
