# Audit Vision Kenomi — 2026-05-19

Audit de l'app Kenomi Canvas contre la vision documentée dans
`docs/superpowers/plans/2026-05-19-kenomi-vision-100-alignment.md`.

## TL;DR

**État global** : 🟢 **App alignée à ~75% sur la vision**

- ✅ Boucle autonome Scout → Decision complète et testée (362 tests passent)
- ✅ Tous les scripts ops sont verts : `ops:coherence`, `ops:readiness`, `smoke:vision`
- ✅ Tracking tokens + coût LLM exposé dans `/studio/agents`
- 🔴 **Bloquant production** : Supabase distant (Kong) renvoie 404 sur toutes les routes — incident infra à régler immédiatement
- 🟡 Pages monolithiques (gamification 3066, agents 2899, infrastructure 2314) — dette UI
- 🟡 Plusieurs items "Ready/Repair UI", "Ops Health cockpit", "retry n8n", non implémentés en UI

## 1. État technique

| Indicateur          | Valeur                              | Verdict |
| ------------------- | ----------------------------------- | ------- |
| Tests Vitest        | 362/362                             | ✅      |
| Typecheck strict    | 0 erreur                            | ✅      |
| Build production    | succès                              | ✅      |
| Lint                | 0 errors, 12 warnings               | ✅      |
| `ops:coherence`     | ok studio + business                | ✅      |
| `ops:readiness`     | scripts/runbooks/env tous présents  | ✅      |
| `smoke:vision`      | ok vision loop smoke                | ✅      |
| `supabase:validate` | **404 sur tous les endpoints Kong** | 🔴      |
| LOC source          | 35 693                              |         |
| Routes API          | 34                                  |         |
| Migrations SQL      | 24                                  |         |
| Tests modules       | 67 fichiers .test.ts                |         |

## 2. Alignement par phase

### Phase 0 — Cohérence & vérité données ✅ COMPLÈTE

- `scripts/audit-studio-coherence.mjs` + `scripts/audit-business-data.mjs` présents
- `lib/studio-data-consistency.{ts,test.ts}` présents
- `npm run ops:coherence` passe
- Runbook `daily-operations.md` documenté

### Phase 1 — Modèle business canonique ✅ COMPLÈTE

- `supabase/migrations/20260519_vision_alignment_core.sql` présent
- Colonnes durcies, indexes, RLS validés par script
- ⚠️ Validation distante échoue côté Coolify (404), non testable en live

### Phase 2 — Boucle idée → venture → landing 🟡 PARTIELLE (75%)

**Vérifié dans le code** :

- ✅ Scout approval → venture créée automatiquement
  (`app/api/studio/agents/pipeline/route.ts:74` insert ventures + statut approved)
- ✅ Builder → landing_pages.health_status='ready' via `materializeBuilderOutput`
- ✅ `lib/public-landing-health.{ts,test.ts}` présents
- ✅ Test full-loop couvre la chaîne
- ❌ **`/studio/ventures` n'affiche PAS** les badges `Ready`/`Repair required`/`Missing landing`/`Missing CTA`/`Tracking missing`
- ❌ Pas de CTA "Lancer Builder" idempotent

**Action restante** : intégrer les états de réparation dans la page ventures (~3h).

### Phase 3 — Analytics réel sans données décoratives ✅ COMPLÈTE

- ✅ `lib/metrics/source-contract.{ts,test.ts}` présent
- ✅ Bande Live KPIs dans `/studio/analytics` connectée à `venture_events`
- ✅ 8e KPI "Coût LLM" connecté à `/api/studio/analytics/llm-cost`
- ✅ Audit qui empêche les tableaux hardcodés

### Phase 4 — Monétisation Stripe ✅ ARCHITECTURE COMPLÈTE

- ✅ `app/api/studio/stripe/checkout/route.ts:101` : `requireApproval` + blocage en production
- ✅ Action `create_checkout` créée bloquée si approval requis
- ✅ Webhook `checkout.session.completed` insère `venture_events.payment_succeeded`
- ⚠️ Items non cochés dans le plan : "Vérifier que checkout en production crée d'abord une action bloquée", "Sur landing publique, CTA checkout si payment ready" — à valider en E2E une fois Supabase distant rétabli.

### Phase 5 — Coolify deploy depuis Studio 🟡 PARTIELLE (50%)

- ✅ `lib/coolify/client.ts` + route `/api/studio/deployments` + `executeDeploy`
- ✅ Approval gate en production
- 🟡 `/studio/infrastructure` affiche `commitShort` mais **pas l'état complet**
  (queue_id, started_at, finished_at, container health absents de l'UI)
- ❌ Pas de "smoke post-deploy automatique"
- ❌ Pas de bouton "réparer/rejouer" un déploiement

**Action restante** : exposer le détail Coolify deployments + bouton retry (~1j).

### Phase 6 — Marketing autonome 🟢 COMPLÈTE EN BACKEND

- ✅ Draft par canal créé par `runAgentStep` Marketing
- ✅ `publish_campaign` bloquée par approval
- ✅ Adapter n8n + mock testés
- ✅ Retry/cancel jobs UI **existent dans `/studio/agents`** (lignes 1162-1199)
- ❌ Bouton retry **direct sur une campagne échouée dans `/studio/marketing`** absent
- ❌ Affichage `budget cap par venture` dans l'UI marketing

### Phase 7 — Decision agent ✅ COMPLÈTE BACKEND

- ✅ Verdicts `continue` / `pivot` / `stop` traités par `run-agent-step`
- ✅ `scale_budget`, `stop_venture`, pivot Scout job tous câblés dans `approval-executor`
- ✅ Tests `full-loop` couvrent le scénario
- 🟡 Affichage des décisions dans `/studio/ventures` à étoffer (raison, confiance, source data)

### Phase 8 — Observabilité 🟡 PARTIELLE (60%)

- ✅ Endpoint `/api/metrics` Prometheus
- ✅ Tokens + coût visibles par run dans `/studio/agents` (ligne 1635)
- ✅ Retry job + cancel job actionnables
- ❌ **Pas de carte "Ops Health" dans le Cockpit `/studio`**
- ❌ Pas de compteurs Prometheus pour `approval_backlog`, `deploy_failures`
- ❌ Runbook `observability.md` absent

### Phase 9 — Sécurité, RGPD, secrets ✅ ARCHITECTURE COMPLÈTE

- ✅ Export RGPD couvre toutes les tables business (route export route.ts)
- ✅ Secrets redactés via `redactPrivacyExport`
- ✅ Suppression RGPD purge tables business
- ✅ Validation distante détecte tables sans RLS
- ✅ Note kill switch dans `docs/security.md`

### Phase 10 — UX & dette structurelle 🔴 NON FAIT

3 composants extraits (`KpiCard`, `StatusBadge`, `EmptyState`) mais les pages monolithiques restent volumineuses :

| Page                                 | Lignes    | Évolution depuis audit précédent |
| ------------------------------------ | --------- | -------------------------------- |
| `app/studio/gamification/page.tsx`   | **3 066** | -7 (négligeable)                 |
| `app/studio/agents/page.tsx`         | **2 899** | +215 (a grossi)                  |
| `app/studio/infrastructure/page.tsx` | **2 314** | +933 (a grossi de +67%)          |
| `app/studio/ventures/page.tsx`       | 1 632     | +153                             |
| `app/studio/marketing/page.tsx`      | 1 586     | +53                              |
| `app/studio/analytics/page.tsx`      | 1 508     | +59                              |
| `app/studio/automations/page.tsx`    | 1 480     | +75                              |
| `app/studio/settings/page.tsx`       | 1 220     | +325                             |
| `app/studio/chat/page.tsx`           | 1 004     | -3                               |

**Action** : reprendre P3.1 du plan précédent et extraire `SectionPanel`, `Sparkline`, hooks fetch (`useAutonomyJobs`, `useCampaignDrafts`).

### Phase 11 — E2E production-like ✅ SMOKE STATIQUE OK

- ✅ `scripts/smoke-vision-loop.mjs` passe (check structurel : présence fichiers + signaux dans code)
- ✅ `npm run smoke` HTTP non-auth fonctionne en local
- 🟡 E2E full-loop test étendu existe mais Supabase distant pas joignable
- ❌ Pas de "définition de release acceptable" documentée

## 3. Risques critiques

### 🔴 Bloquant — Supabase Coolify down

```bash
curl https://supabase.kenomi.eu/rest/v1/   → 404
curl https://supabase.kenomi.eu/auth/v1/settings → 404
curl https://supabase.kenomi.eu/pg/query → 404
```

OpenResty répond, mais aucun upstream Kong/PostgREST mappé. **L'app ne peut pas écrire en prod**. À diagnostiquer côté Coolify :

```bash
ssh coolify "docker ps --filter name=supabase | head -20"
ssh coolify "docker logs --tail 50 <supabase-kong-container>"
```

**Impact** : `/api/health` retourne 503 en prod, toutes les routes Studio échouent.

### 🟡 Dette UI majeure (Phase 10)

3 pages > 2 000 lignes, 4 pages > 1 500 lignes. Les pages **ont grossi** depuis l'audit précédent (notamment infrastructure +67%, settings +325 lignes). Risque : HMR lent, refactor manuel difficile.

### 🟡 Gaps UI / état de réparation

Le code backend pour Phase 2 (venture readiness) et Phase 5 (Coolify deploy state) est en place, mais l'UI ne les expose pas. L'utilisateur ne **voit** pas l'état réel via le Studio — il doit aller en DB.

## 4. Definition of Done — checklist actuelle

| Item                                    | État      |
| --------------------------------------- | --------- |
| `npm run format:check`                  | ✅        |
| `npm run typecheck`                     | ✅        |
| `npm test`                              | ✅        |
| `npm run ops:coherence`                 | ✅        |
| `npm run ops:readiness`                 | ✅        |
| `npm run supabase:validate` contre prod | 🔴 404    |
| `npm run build`                         | ✅        |
| `npm run smoke` local                   | ✅        |
| `SMOKE_BASE_URL=...kenomi.eu smoke`     | 🔴 supabase down |
| `smoke-vision-loop.mjs`                 | ✅        |
| Studio affiche sources / approvals / erreurs / réparations / dernier deploy | 🟡 partiel |
| Aucune action externe sans approval     | ✅        |
| Kill switch + dry-run bloquent          | ✅        |

**Score actuel : 9/13 DoD verts = 69%** (mais ~75% si on accorde la moitié aux 🟡).

## 5. Priorités recommandées (semaine prochaine)

### P0 — Production restorée (bloquant)

1. **Diagnostiquer Supabase Coolify** : pourquoi Kong renvoie 404 sur tout ?
   Probable cause : container Kong arrêté ou Caddy/Traefik mal-configuré.
   Coût : 1-2h investigation, possiblement quick fix.

### P1 — Combler les gaps UI (1-2 jours)

2. **Phase 2 UI** : ajouter badges `Ready/Repair/Missing` dans `/studio/ventures` (~3h)
3. **Phase 5 UI** : exposer queue_id/started_at/finished_at + bouton retry deploy dans `/studio/infrastructure` (~3h)
4. **Phase 8 cockpit** : carte "Ops Health" dans `/studio` (jobs failed, approvals pending, deploy state) (~2h)

### P2 — Dette UI (2-3 jours)

5. **Phase 10** : extraire `SectionPanel`, `Sparkline`, hooks fetch. Cible : passer les 3 pages > 2 000 lignes sous la barre des 1 500.

### P3 — E2E preuve (1 jour)

6. **Documenter "release acceptable"** dans README
7. **Étendre `smoke-vision-loop`** pour exécuter (pas juste vérifier la présence des fichiers) un dry-run complet en local

## 6. Conclusion

L'app **respecte la vision à 75% en backend** : toutes les boucles métier critiques sont implémentées et testées. Les chemins d'autonomie supervisée (approvals, dry-run, kill switch, budget caps) fonctionnent.

**Le gap principal n'est pas dans le code mais dans l'UI** : Phase 2/5/8 ont du backend prêt mais l'utilisateur ne voit pas l'état dans le Studio. La dette UI (pages > 2k lignes) ralentit chaque ajout.

**Bloquant immédiat** : Supabase prod down (Kong 404). Tant que c'est cassé, aucun smoke distant ne peut passer.

L'app est **prête pour autonomie supervisée mono-utilisateur** une fois Supabase rétabli. Pour passer à "exploitation continue", il manque ~1 semaine de travail focalisé sur les gaps UI + dette structurelle.
