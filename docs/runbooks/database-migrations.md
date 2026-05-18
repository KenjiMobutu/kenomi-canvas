# Database Migrations Runbook

## Purpose

Kenomi migrations must be replayable from an empty Supabase database and safe
on an existing self-hosted environment. Every migration that alters, indexes, or
adds RLS to a table must first guarantee that the table and referenced columns
exist.

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
