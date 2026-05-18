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

| Couche | Technologie |
|--------|------------|
| Framework | Next.js 15 (App Router, standalone output) |
| UI | React 19, Tailwind CSS v4, Lucide, Sonner |
| Auth | Supabase Auth (@supabase/ssr, JWT cookies) |
| Base de données | Supabase PostgreSQL 15 + Row Level Security |
| ORM | Prisma 6 (schéma ventures legacy) |
| LLM | Ollama (local, streaming SSE) |
| Automations | n8n (webhooks) |
| Déploiement | Docker standalone, Coolify self-hosted |

## Architecture Status

Kenomi Canvas est le cockpit du Kenomi AI Venture Studio. Il fournit la gestion des ventures, l'exécution des agents, les triggers n8n, la capture waitlist, la santé de l'infrastructure et le routage LLM local-first.

L'autonomie est intentionnellement supervisée : les actions risquées (paiement, déploiement, publication publique) requièrent une approbation humaine explicite.

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

| Variable | Description |
|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de l'instance Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase (publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase (serveur uniquement) |
| `DATABASE_URL` | URL PostgreSQL pour Prisma |
| `ALLOWED_EMAIL` | Seul email autorisé à accéder au studio |
| `DASHBOARD_PASSWORD` | Mot de passe du dashboard admin |
| `DASHBOARD_TOKEN_SECRET` | Secret HMAC pour les tokens dashboard |
| `APP_ORIGIN` | URL publique de l'application |

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
├── auth-server.ts   # Helper requireAllowedUser (routes API)
├── security.ts      # Validation SSRF des webhooks
├── dashboard-token.ts # Auth HMAC dashboard
└── supabase*.ts     # Clients Supabase (browser / server)
```
