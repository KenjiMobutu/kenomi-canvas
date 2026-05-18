# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes essentielles

```bash
npm run dev          # Serveur de développement Next.js
npm run build        # Build production (output standalone)
npm run lint         # ESLint (next lint)
npm run typecheck    # TypeScript sans émission
npm run format       # Prettier — formate tout
npm test             # Vitest (tous les tests)
npx vitest run lib/security.test.ts   # Un seul fichier de test
npx prisma generate  # Regénérer le client Prisma (après modification du schéma)
```

Les migrations Supabase s'appliquent manuellement via l'éditeur SQL du dashboard Supabase — il n'y a pas de CLI Supabase local configuré.

## Architecture générale

**Kenomi Canvas** est un « Studio OS » pour entrepreneur solo — interface unique qui agrège ventures, chat IA, automations n8n et gamification. L'app est mono-utilisateur : une seule adresse email (`ALLOWED_EMAIL`) peut accéder au studio.

### Deux zones applicatives distinctes

| Zone                     | Auth                                               | Route          |
| ------------------------ | -------------------------------------------------- | -------------- |
| Studio principal         | Supabase Auth (JWT cookies, `@supabase/ssr`)       | `/studio/*`    |
| Back-office admin        | HMAC SHA-256 journalier (`lib/dashboard-token.ts`) | `/dashboard/*` |
| Pages publiques waitlist | Aucune                                             | `/[slug]`      |

Le middleware (`middleware.ts`) gère toutes les redirections auth pour ces deux systèmes.

### Deux couches d'accès base de données

L'app coexiste avec deux clients DB distincts — ne pas les confondre :

- **Prisma** (`lib/db.ts` → `lib/generated/prisma/`) : schéma legacy pour le modèle ventures (Idea, Venture, LandingPage, Payment, etc.). Client généré dans `lib/generated/prisma/`, pas dans `node_modules/.prisma`.
- **Supabase JS** : données opérationnelles (conversations, messages, automations, gamification, user_settings…). Deux clients :
  - `lib/supabase-browser.ts` — `'use client'`, pour les composants React
  - `lib/supabase-admin.ts` — service role, pour les Server Actions / routes admin
  - `lib/auth-server.ts` — `requireAllowedUser()` retourne `{ user, supabase, response }` — si `response` est non-null, la renvoyer directement (401/403)

Les migrations Supabase sont dans `supabase/migrations/` (fichiers SQL).

#### Stratégie long terme

**Status : stack hybride documentée, migration progressive.**

| Cas | Client à utiliser |
| --- | ----------------- |
| **Nouveau code** | Supabase JS exclusivement |
| **Modèles legacy ventures** | Prisma — regen `lib/generated/prisma/` après tout changement de schéma |
| **Tables récentes** (autonomy, marketing, agent_runs, venture_events, campaign_drafts...) | Supabase JS |
| **Server Actions** | `supabase-admin.ts` (service role) |
| **Routes API authentifiées** | `requireAllowedUser` → `supabase` scopé user |
| **Routes API publiques** (waitlist, events, stripe webhook) | `supabase-admin.ts` |

**Migration future :** Prisma sera retiré une fois les routes ventures core (Idea/Venture/LandingPage/Payment/Campaign/Decision/Metric/BudgetRequest) migrées vers Supabase JS. Le client généré pèse ~17k lignes — un gain de bundle non négligeable. Pas urgent tant que Prisma fonctionne et que les tests E2E passent.

**Anti-pattern :** ne **jamais** dupliquer la même table dans Prisma ET Supabase JS. Si tu touches un modèle Prisma legacy, regen le client. Si tu ajoutes une table, c'est Supabase JS via migration SQL.

### Routes API : pattern commun

Chaque route API studio suit ce patron :

```ts
const cookieStore = await cookies()
const { user, supabase, response } = await requireAllowedUser(cookieStore)
if (response) return response // 401 ou 403
```

Puis rate-limit via `isRateLimited()` (in-memory, se remet à zéro au redémarrage) et validation input.

Les helpers de réponse sont dans `lib/api-response.ts` : `apiError(message, status)` et `apiOk(data)`.

### Protection SSRF

`lib/security.ts` expose `isAllowedOllamaUrl()` et `isAllowedWebhookUrl()` — toute URL externe (Ollama, webhook n8n) doit passer ce filtre avant tout `fetch`. Les hôtes privés de confiance (Ollama local, n8n réseau privé) se déclarent dans `TRUSTED_PRIVATE_HOSTS` (CSV).

### Chat IA (Ollama, SSE)

`app/api/studio/chat/route.ts` envoie une réponse `text/event-stream` en proxiant l'API Ollama. Le format SSE est `data: <json-token>\n\n`, terminé par `data: [DONE]\n\n`. L'URL Ollama et le modèle proviennent de `user_settings` en base, avec des valeurs par défaut codées en dur.

### Système de design

Les tokens visuels sont dans `lib/ck-vars.ts` (palette `--ck-*`). Les pages studio utilisent ces variables **via `style={{ }}` inline**, pas via des classes Tailwind utilitaires. Suivre ce pattern pour toute nouvelle page studio.

## Variables d'environnement requises

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL                  # PostgreSQL pour Prisma
ALLOWED_EMAIL                 # Seul email autorisé
DASHBOARD_TOKEN_SECRET        # Secret HMAC pour le dashboard admin
APP_ORIGIN                    # URL publique
TRUSTED_PRIVATE_HOSTS         # CSV d'hôtes privés autorisés (ex: 192.168.0.14,n8n.local)
```

## Tests

Les fichiers de test sont co-localisés dans `lib/` (`*.test.ts`). Vitest s'exécute en environnement Node, avec l'alias `@` → racine du projet. Il n'y a pas de tests pour les composants React.

## Déploiement

`next.config.ts` configure `output: 'standalone'`. L'image Docker est déployée via Coolify — un `git push origin main` déclenche le déploiement automatique.
