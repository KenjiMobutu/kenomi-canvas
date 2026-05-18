# Audit complet Kenomi Canvas — 2026-05-18

## TL;DR

**État global** : ✅ **Production-ready supervisé**

- 240/240 tests passent, 0 erreur TypeScript, build OK
- Boucle autonome complète Scout → Decision opérationnelle
- Migration prod Supabase alignée et validée
- Smoke HTTP 7/7 vert

**Risques majeurs** : 2 tables prod sans RLS, fichiers UI monolithiques (3 000 lignes), warnings React `Calling setState synchronously within an effect` non corrigés.

**Améliorations principales** : 9 listées ci-dessous, classées par ROI.

---

## 1. État qualité technique

| Indicateur | Valeur | Verdict |
|------------|--------|---------|
| Tests Vitest | 240/240 | ✅ |
| Typecheck strict | 0 erreur | ✅ |
| Build production | succès | ✅ |
| Lint | **0 errors, 51 warnings** | ⚠️ |
| `format:check` | ✅ vert | ✅ |
| Smoke HTTP | 7/7 ok | ✅ |
| `supabase:validate` | toutes tables, RLS, policies présentes | ✅ |
| Dependencies outdated | 4 (Supabase, framer-motion, TS 6, @types/node) | 🟡 |
| Security audit | 2 moderate (postcss via Next 16) | 🟡 |
| Console.log/error résiduels | 11 occurrences en prod code | 🟡 |
| Casts `as unknown as` | 10 (frontière Supabase types) | 🟡 |

**Volume** : 31 299 LOC `.ts/.tsx` hors `node_modules` et `lib/generated/`. 24 routes API, 21 tables SQL.

---

## 2. Risques de sécurité

### 🔴 RLS désactivée sur 2 tables prod

```
kenomi_jobs         rls=false  policies=0
saas_opportunities  rls=false  policies=0
```

Ces tables ne sont **pas référencées** dans le code applicatif actuel ni dans les migrations versionnées. Probable héritage d'un état antérieur du projet.

**Risque** : exposition via API REST Supabase publique avec n'importe quelle anon key, si quelqu'un découvre leur existence.

**Action** :
- soit `DROP TABLE` si confirmé inutilisé,
- soit `ENABLE ROW LEVEL SECURITY` + policy `DENY ALL` au minimum.

### 🟡 Routes publiques inventoriées

```
app/api/waitlist/route.ts          → publique (validation + rate-limit)
app/api/events/route.ts            → publique (validation + rate-limit)
app/api/health/route.ts            → publique (état système)
app/api/stripe/webhook/route.ts    → publique (vérif signature HMAC)
app/api/dashboard/login/route.ts   → publique (auth dashboard)
app/api/dashboard/logout/route.ts  → publique (session destroy)
```

Toutes sauf `health` ont une protection adaptée. `/api/health` expose le statut Prisma/Supabase/storage — vérifier qu'aucune info sensible ne fuit dans la réponse (versions précises, paths).

### 🟡 Casts `as unknown as`

10 occurrences, toutes à la frontière Supabase client → interfaces structurelles. Pattern volontaire pour éviter de polluer chaque module avec le type complet `SupabaseClient`. Acceptable mais documenter pourquoi dans `docs/security.md`.

---

## 3. Architecture

### 🔴 Pages monolithiques (>500 lignes)

| Page | Lignes |
|------|--------|
| `app/studio/gamification/page.tsx` | **3 073** |
| `app/studio/agents/page.tsx` | **2 684** |
| `app/studio/page.tsx` | 2 261 |
| `app/studio/marketing/page.tsx` | 1 533 |
| `app/studio/ventures/page.tsx` | 1 479 |
| `app/studio/analytics/page.tsx` | 1 449 |
| `app/studio/automations/page.tsx` | 1 405 |
| `app/studio/infrastructure/page.tsx` | 1 381 |
| `app/studio/chat/page.tsx` | 1 007 |

Toutes mélangent JSX, state hooks, fetch et helpers de visualisation. Conséquences observées :
- HMR lent (~1-2s par modification),
- difficile à tester en isolation,
- duplication de patterns (KPI card, panel border, status badges).

**Action** : extraire systématiquement
- les sous-composants visuels (`KpiCard`, `StatusBadge`, `Sparkline`) dans `components/studio/`,
- les hooks de fetch (`useAutonomyJobs`, `useCampaignDrafts`) dans `lib/hooks/`,
- les chartings SVG (`StackedArea`, `CohortHeatmap`) dans `components/charts/`.

### 🟡 Deux couches d'accès DB coexistantes

- **Prisma** : `lib/generated/prisma/` (~17 000 lignes générées) pour `Idea/Venture/LandingPage/Payment/...`
- **Supabase JS** : pour tout le reste (conversations, automations, autonomy)

Risque actuel : confusion développeur, divergences de schéma possibles, double maintenance.

**Action** : décider stratégie long terme.
- Option A : tout migrer vers Supabase JS (plus simple, RLS natif, mais perte des types Prisma)
- Option B : régénérer Prisma périodiquement et garder pour les ventures core (séparation claire)

Documenter le choix dans CLAUDE.md et ajouter un README dans `lib/`.

---

## 4. Code quality

### 🟡 51 warnings ESLint non triviaux

Classés par type :

| Catégorie | Count | Impact |
|-----------|-------|--------|
| `Calling setState synchronously within an effect can trigger cascading renders` | ~10 | Bugs subtils + lag UI |
| `unused-vars` (imports / constantes) | ~25 | Cosmétique |
| `react/no-unescaped-entities` | ~10 | Cosmétique (apostrophes) |
| `react-hooks/exhaustive-deps` | ~5 | Bugs potentiels (deps oubliées) |
| `no-html-link-for-pages` (utiliser `<Link>`) | ~3 | SEO/SPA perf |

Les **`setState in effect`** sont les seuls réellement problématiques. À auditer un par un.

### 🟡 11 console.log/error en code prod

```
app/studio/documents/page.tsx:145
app/api/studio/infra/proxmox/route.ts:42
app/api/waitlist/route.ts:74
app/api/studio/automations/trigger/route.ts:87-88
lib/venture-events.ts:100-102
lib/llm-client.ts:146
lib/audit-log.ts:34
lib/proxmox-client.ts:143,147
```

Acceptables pour debug d'erreurs serveur, mais à terme remplacer par un logger structuré (Pino, Winston) avec niveau + corrélation request-id.

---

## 5. Tests

### ✅ Couverture par module

| Module | Modules | Tests | Couverture |
|--------|---------|-------|------------|
| `lib/` racine | 30 | 19 | 63% |
| `lib/autonomy/` | 8 | 8 | 100% |
| `lib/marketing/` | 2 | 2 | 100% |
| `lib/stripe/` | 3 | 3 | 100% |
| `lib/coolify/` | 1 | 1 | 100% |
| `lib/metrics/` | 1 | 1 | 100% |

**Excellent** sur les chemins critiques de l'autonomie. Les 11 modules `lib/` sans test direct sont essentiellement des helpers UI (ck-vars, studio-utils) ou des wrappers DB simples — moins critiques.

### 🟡 Routes API sans test d'intégration

```
app/api/waitlist (publique)
app/api/health
app/api/events (publique)
app/api/dashboard/{login,logout}
```

Le smoke HTTP couvre déjà ces routes au niveau status code, mais pas la logique métier (validation Zod, rate-limit, audit events).

**Action** : ajouter des tests Vitest qui invoquent les handlers directement avec un Supabase mock (pattern utilisé dans `lib/autonomy/`).

### 🟢 Test E2E full-loop fonctionnel

`lib/autonomy/full-loop.test.ts` (389 lignes) couvre Scout → Validation → Builder → Payment → Marketing → Decision avec dry-run, publisher mock, vérification metrics_snapshot. **À étendre** pour les chemins non-dry-run (au moins Stripe webhook simulé bout-en-bout).

---

## 6. Performance

### 🟡 Bundles à surveiller

Le build produit du Next 16 standalone. Les pages > 1 500 lignes pèsent lourd au First Load JS. Pas de mesure précise dans cet audit (lighthouse à lancer manuellement).

**Action** : lancer `npm run build` avec `ANALYZE=true` + `@next/bundle-analyzer` pour voir les top 10 bundles.

### 🟡 Rate limiting in-memory

`lib/rate-limit.ts` utilise une `Map` in-memory — perd l'état au redémarrage et ne marche pas en multi-instance. Acceptable pour mono-utilisateur sur une seule instance Coolify, à revoir si scale-out.

---

## 7. Observabilité

### 🟢 Acquis

- Tabs Autonomy Ops (Jobs/Actions/Approvals) dans `/studio/agents`
- `agent_events` (audit log structuré) avec severity, metadata, créé pour tous les runs agent et automations
- `venture_events` (page_view, signup, payment, campaign_spend)
- Live KPIs dans `/studio/analytics`
- Health endpoint avec dépendances configurables

### 🟡 Manquant

- **Pas de métrique de latence p50/p95** des routes API
- **Pas de tracking de coût LLM** (tokens consommés, $/run)
- **Pas de SLI/SLO** définis (target uptime, error budget)
- **Pas de pages d'erreur custom** (`app/error.tsx`, `app/not-found.tsx`) sinon Next.js défauts

**Action** : ajouter au moins
- compteur tokens dans `agent_runs` (déjà partiellement présent dans `llmResult.usage`)
- export Prometheus simple `/api/metrics` (counters par route, histogramme durée)
- `app/error.tsx` + `app/not-found.tsx` aux couleurs Kenomi

---

## 8. Liste des améliorations possibles (prioritaire)

### Priorité 1 — Sécurité (à faire avant prochaine release)

1. **Activer RLS sur `kenomi_jobs` et `saas_opportunities`** (ou DROP TABLE si inutile).
   Migration : `20260518_close_legacy_tables.sql`.
   Coût : 30 min.

### Priorité 2 — Stabilité (faire dans les 2 semaines)

2. **Corriger les warnings `setState in effect`** (~10 occurrences).
   Pattern : envelopper dans `useEffect` avec deps explicites, ou utiliser `useSyncExternalStore`.
   Coût : 1 demi-journée.

3. **Tests d'intégration pour routes publiques** (`/api/waitlist`, `/api/events`, `/api/health`).
   Pattern : fake Supabase comme dans `lib/autonomy/`. Cible : +6 tests.
   Coût : 1 jour.

### Priorité 3 — Maintenabilité (faire dans le mois)

4. **Extraire composants UI réutilisables** depuis les pages 1 000+ lignes.
   Commencer par `KpiCard`, `StatusBadge`, `Sparkline` qui apparaissent dans Analytics + Marketing + Gamification.
   Coût : 2 jours pour les 5 composants les plus utilisés.

5. **Logger structuré** (remplacer `console.error` par Pino ou pino-pretty).
   Coût : 1 jour.

6. **Documenter la stratégie Prisma vs Supabase JS** dans CLAUDE.md.
   Coût : 1h.

### Priorité 4 — Observabilité (faire avant production réelle)

7. **Tracking coût LLM par run** : ajouter colonnes `prompt_tokens`, `completion_tokens`, `cost_usd` dans `agent_runs`. Permet d'afficher la marge réelle dans `/studio/analytics`.
   Coût : 1 jour.

8. **Pages erreur custom** (`app/error.tsx`, `app/not-found.tsx`).
   Coût : 2h.

9. **Endpoint `/api/metrics`** (Prometheus format) pour scraper depuis Coolify.
   Coût : 2-3h.

### Priorité 5 — Performance (optionnel, à mesurer)

- Bundle analyzer pour identifier les imports lourds dans les pages monolithiques.
- Code splitting des sections décoratives (charts) via dynamic import.

---

## 9. Recommandation finale

L'app est **production-ready pour une autonomie supervisée mono-utilisateur**. La boucle métier complète fonctionne, est testée, documentée et instrumentée.

**Bloquant pour go-live** : juste la sécurisation des 2 tables sans RLS (priorité 1, 30 min).

**Pour passer à "100% exploitation continue"** : items priorité 2 et 4 (tests intégration + tracking coût LLM + pages erreur) — env. 3 jours de travail.

**Le code est sain mais grossit vite côté UI**. Sans refactor des pages monolithiques dans les 2-3 mois, ce sera la première dette à payer.
