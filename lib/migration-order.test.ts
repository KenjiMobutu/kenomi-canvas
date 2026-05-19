import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readMigration(fileName: string) {
  return readFileSync(join(root, 'supabase', 'migrations', fileName), 'utf8')
}

describe('migration ordering', () => {
  it('creates decisions before the audit migration enables RLS or indexes it', () => {
    const migration = readMigration('20260516_audit_db_fixes2.sql')

    const createTable = migration.indexOf('CREATE TABLE IF NOT EXISTS public.decisions')
    const enableRls = migration.indexOf('ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY')
    const createIndex = migration.indexOf('decisions_venture_id_idx')

    expect(createTable).toBeGreaterThanOrEqual(0)
    expect(enableRls).toBeGreaterThan(createTable)
    expect(createIndex).toBeGreaterThan(createTable)
  })

  it('keeps autonomy core idempotent for existing decisions tables', () => {
    const migration = readMigration('20260518_autonomy_core.sql')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.decisions')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS venture_id')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS metrics_snapshot')
  })

  it('keeps the vision alignment migration idempotent and business-status focused', () => {
    const migration = readMigration('20260519_vision_alignment_core.sql')

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS lifecycle_status')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS current_decision')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS health_status')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS provider_status')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS published_at')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS executed_at')
    expect(migration).toContain('ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS ventures_lifecycle_idx')
  })

  it('keeps legacy decisions columns compatible with revenue autopilot inserts', () => {
    const migration = readMigration('20260519_decisions_legacy_compat.sql')

    expect(migration).toContain('ALTER TABLE public.decisions')
    expect(migration).toContain('ALTER COLUMN agent DROP NOT NULL')
    expect(migration).toContain('ALTER COLUMN action DROP NOT NULL')
  })
})
