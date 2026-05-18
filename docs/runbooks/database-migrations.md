# Database Migrations Runbook

## Purpose

Kenomi migrations must be replayable from an empty Supabase database and safe
on an existing self-hosted environment. Every migration that alters, indexes, or
adds RLS to a table must first guarantee that the table and referenced columns
exist.

## Prérequis pour la validation locale

- **Supabase CLI ≥ 2.98** : `brew install supabase/tap/supabase`
- **Docker Desktop opérationnel** : `docker info` doit répondre sans timeout
- **Réseau Docker** : les extensions Little Snitch, AdGuard, NordVPN Threat
  Protection peuvent bloquer les pulls `public.ecr.aws/supabase/*`. Si
  `supabase start` échoue avec `failed to pull docker image: context deadline
  exceeded`, autorisez Docker dans Little Snitch et désactivez le filtrage
  AdGuard pour `*.ecr.aws` et `*.docker.io`.
- **Ports libres** : 54321 (Studio), 54322 (Postgres), 54323 (Inbucket),
  54324 (Edge runtime)

## Local Validation

Run the full migration chain before merging schema changes:

```bash
supabase start
supabase db reset
supabase db lint --local
```

Expected result:

- migrations apply from a clean database;
- `supabase db lint --local` returns no fatal errors;
- RLS policies are present on user-owned and venture-owned tables.

## Alternative : appliquer une migration sans environnement local

Si Docker local est indisponible, appliquer la migration directement sur la
base self-hosted via `/pg/query` (service-role) :

```bash
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/<file>.sql)"
```

Réponse `[]` = succès. Pour les checks RLS, valider via une query de contrôle :

```bash
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/pg/query" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query": "select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('campaign_drafts', 'venture_events', 'autonomy_actions') order by tablename;"}'
```

Cette approche n'a PAS la couverture de `db lint --local` (pas de détection
des migrations non-rejouables sur base vierge). Privilégier le setup local
dès que possible.

## Ordering Rules

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

## Recovery

If `supabase db reset` fails:

1. Read the first failing migration and line number.
2. Check whether the failing statement assumes an existing table, column, policy,
   extension, enum, or seed row.
3. Add an idempotent guard in the same migration before the failing statement.
4. Re-run `supabase db reset`.
5. Re-run `supabase db lint --local`.

Do not bypass a failing migration by editing migration history on a deployed
environment. Create a forward-only repair migration when production has already
applied the faulty migration.
