# Database Migrations Runbook

## Purpose

Kenomi migrations must be replayable from an empty Supabase database and safe
on the existing self-hosted environment (Coolify). Every migration that alters,
indexes, or adds RLS to a table must first guarantee that the table and
referenced columns exist.

## Architecture

L'app utilise **Supabase self-hosted déployé via Coolify** (`supabase.kenomi.eu`).
Il n'y a **pas** de Supabase local sur la machine de dev. Toute validation se
fait soit en statique (tests), soit directement contre l'instance Coolify.

Important : certains `DATABASE_URL` pointent vers le hostname Postgres interne
du stack Coolify (`supabase-db-...`). Ce nom n'est résolvable que depuis la VM
Coolify ou un environnement rattaché au même réseau Docker. Depuis une machine
de dev externe, `supabase db push --db-url "$DATABASE_URL"` peut donc échouer au
DNS même si la base fonctionne.

## Validation des migrations

### 1. Garde statique (toujours obligatoire)

```bash
npm test lib/migration-order.test.ts
```

Vérifie que les migrations critiques respectent l'ordre attendu (par ex.
`CREATE TABLE public.decisions` apparaît avant tout `ALTER TABLE` ou
`ENABLE ROW LEVEL SECURITY` sur cette table).

### 2. Validation distante Coolify

```bash
npm run supabase:validate
```

Le script vérifie :

- REST API et Auth API joignables ;
- endpoint SQL `/pg/query` joignable ;
- tables critiques présentes ;
- RLS activée ;
- policies présentes ;
- colonnes nécessaires à l'autonomie (`autonomy_actions`, `human_approvals`,
  `venture_events`, `payments.autonomy_action_id`, etc.).

### 3. Appliquer une migration sur Coolify

Depuis la VM Coolify, ou depuis un shell qui voit le réseau interne du stack,
utiliser de préférence l'historique de migrations Supabase :

```bash
supabase db push --db-url "$DATABASE_URL"
```

Si la CLI Supabase n'est pas disponible dans cet environnement, appliquer la
migration via le endpoint SQL exposé par l'instance self-hosted :

```bash
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/<file>.sql)"
```

Réponse `[]` (array vide) = succès. Toute autre réponse contient l'erreur PG.

Pour la migration settings infra, le fichier attendu est :

```bash
supabase/migrations/20260519001800_user_settings_infra_endpoints.sql
```

### 4. Vérifier l'état après application

```bash
# Tables + RLS activé
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query": "select tablename, rowsecurity from pg_tables where schemaname='\''public'\'' and tablename in ('\''campaign_drafts'\'', '\''venture_events'\'', '\''autonomy_actions'\'') order by tablename;"}'

# Policies créées
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query": "select schemaname, tablename, policyname, cmd from pg_policies where schemaname='\''public'\'' order by tablename, policyname;"}'
```

Ou relancer :

```bash
npm run supabase:validate
```

## Règles d'écriture

- Use `CREATE TABLE IF NOT EXISTS` before any `ALTER TABLE`, `CREATE INDEX`, or
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for that table.
- Use `ADD COLUMN IF NOT EXISTS` when a migration depends on columns that may be
  absent from older self-hosted databases.
- Keep policy creation idempotent with `DROP POLICY IF EXISTS` or a guarded
  `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block.
- Do not place production data backfills before their target table and columns
  are guaranteed.
- If a later migration owns the canonical schema for a table that an earlier
  migration must touch, duplicate a minimal safe `CREATE TABLE IF NOT EXISTS`
  guard in the earlier migration and document why.

## En cas d'échec sur Coolify

1. Lire le message d'erreur dans la réponse JSON.
2. Identifier si l'erreur est :
   - Une table/colonne manquante → ajouter une garde `IF NOT EXISTS` dans une
     migration ultérieure de réparation
   - Une policy déjà créée → ajouter `DROP POLICY IF EXISTS` avant
   - Une contrainte violée par les données existantes → écrire une migration
     forward-only avec backfill avant la contrainte
3. **Ne jamais** rollback ou rejouer une migration déjà appliquée. Écrire une
   migration de réparation forward-only.
4. Tester la garde via `lib/migration-order.test.ts` si l'erreur révèle un
   pattern systémique.

## Optionnel : Supabase local complet

Si un setup complet `supabase start && db lint --local` devient nécessaire
(par ex. pour CI/CD), prévoir :

- Docker Desktop opérationnel
- Réseau outbound non filtré par Little Snitch, AdGuard, ou exit node Tailscale
- Ports libres : 54321 (Studio), 54322 (Postgres), 54323 (Inbucket), 54324 (Edge)

Pour Kenomi en mono-développeur, l'application directe sur Coolify + tests
statiques + smoke HTTP couvrent les besoins sans la complexité d'une VM locale.
