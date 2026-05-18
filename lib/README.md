# lib/ — Conventions

## Stratégie DB

Stack hybride **Prisma + Supabase JS**. Voir `CLAUDE.md` → "Stratégie long terme".

- Nouveau code → **Supabase JS** exclusivement
- Modèles legacy ventures → **Prisma** (regen `lib/generated/prisma/` après changement)
- Anti-pattern : ne jamais dupliquer la même table dans les deux clients

## Modules par responsabilité

### Clients DB

- `db.ts` — Prisma client (legacy ventures)
- `supabase-admin.ts` — service role (server-side, bypass RLS)
- `supabase-browser.ts` — anon key + cookies (client-side, respecte RLS)
- `auth-server.ts` — `requireAllowedUser(cookieStore)` retourne `{ user, supabase, response }`. Renvoyer `response` directement si non-null.

### Moteur d'autonomie

`lib/autonomy/`

- `config.ts` — `getAutonomyConfig()` : kill switch + dry-run + budget cap global
- `policy.ts` — `requiresApproval()` + `checkBudgetPolicy()`
- `approval-executor.ts` — `resolveHumanApproval()` exécute les actions approuvées (deploy, publish_campaign, stop_venture)
- `run-agent-step.ts` — orchestre un step agent (LLM call → output schema → persist agent_runs avec tokens/coût)
- `job-runner.ts` — runner périodique des `autonomy_jobs`
- `approval-view-model.ts` — formatage pour UI Approval Gates (incluant `extractBudgetBreach`)
- `action-view-model.ts` — formatage pour tabs Jobs / Actions dans /studio/agents
- `agent-orchestration.ts` (parent) — `selectDueAgentRuns()` depuis `agent_schedules`
- `full-loop.test.ts` — E2E Scout → Decision en dry-run

### Modules métier

- `lib/marketing/`
  - `campaign-drafts.ts` — `buildCampaignDrafts()` depuis output Marketing
  - `publish-action.ts` — `executePublishCampaign()` orchestre publisher + venture_events
  - `adapters/{types,mock,n8n,index}.ts` — `MarketingPublisher` interface + adapters
- `lib/stripe/`
  - `server.ts` — `createStripeClient()`
  - `checkout-action.ts` — `buildCheckoutSessionParams()`
  - `webhook-handler.ts` — vérif signature + handler `checkout.session.completed`
- `lib/coolify/client.ts` — client typé SSRF-safe (triggerDeploy, getDeployment)
- `lib/deployments/deploy-action.ts` — pipeline deploy avec approval gate prod
- `lib/metrics/venture-metrics.ts` — `aggregateVentureMetrics()` depuis `venture_events`

### Helpers transverses

- `agent-output-schemas.ts` — schémas Zod par agent (Scout, Validation, Builder, Payment, Marketing, Decision)
- `llm-client.ts` — `llmChat()` Ollama primary + Claude fallback, `computeCostUsd()` pricing par modèle
- `audit-log.ts` — `insertAuditEvent()` vers `agent_events` (sanitize secrets)
- `privacy-export.ts` — `redactPrivacyExport()` pour export RGPD
- `security.ts` — `isAllowedWebhookUrl()`, `isAllowedOllamaUrl()` (SSRF guard via `TRUSTED_PRIVATE_HOSTS`)
- `rate-limit.ts` — in-memory rate-limit (mono-instance, perd l'état au redémarrage)
- `validation.ts` — `isValidEmail()`, validators Zod réutilisables
- `api-response.ts` — `apiOk(data)`, `apiError(message, status)` helpers de réponse JSON
- `pipeline-types.ts` — types `PipelineRow`, `parsePipelineIdea()`, `isAgentUnlocked()`
- `venture-events.ts`, `venture-materializer.ts` — création venture + recalcul revenus_total
- `dashboard-token.ts` — HMAC SHA-256 journalier pour `/dashboard/*`
- `infra-config.ts` — config services topology (private/public endpoint labels)
- `health-check.ts` — `getHealthDependencyConfig()` + `buildHealthSummary()`
- `studio-utils.ts` — hooks UI (`useIsMobile`, `useTick`) + helpers chart (`makeSpark`, `sparkPath`)
- `ck-vars.ts` — palette design tokens (CSS variables `--ck-*`)

## Tests

Co-localisés (`X.ts` ↔ `X.test.ts`). Vitest en environnement Node, alias `@` → racine. 245 tests à ce jour, couverture 100% sur `autonomy/`, `marketing/`, `stripe/`, `coolify/`, `metrics/`.

Pattern fake Supabase : voir `lib/autonomy/full-loop.test.ts` ou `lib/autonomy/approval-executor.test.ts`. Builder fluent qui mute les `tables: Record<TableName, Row[]>`.

## Migrations Supabase

Fichiers SQL versionnés dans `supabase/migrations/`. Application via `curl /pg/query` sur l'instance Coolify (voir `docs/runbooks/database-migrations.md`). Validation distante via `npm run supabase:validate` (`scripts/validate-supabase-remote.mjs`).
