import { describe, expect, it } from 'vitest'
import {
  ensureBusinessSchedulesForUser,
  runBusinessScheduler,
  updateBusinessSchedule,
  type BusinessScheduleRow,
} from './scheduler'

type TableRow = Record<string, unknown>

function createFakeSupabase(
  initialSchedules: BusinessScheduleRow[] = [],
  initialJobs: TableRow[] = [],
  initialControls: TableRow[] = []
) {
  const tables = {
    business_schedules: initialSchedules.map((row) => ({ ...row })) as TableRow[],
    autonomy_jobs: initialJobs.map((row) => ({ ...row })) as TableRow[],
    autonomy_controls: initialControls.map((row) => ({ ...row })) as TableRow[],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) throw new Error(`Unexpected table ${table}`)
      const rows = tables[table as keyof typeof tables]
      const state = {
        patch: null as Record<string, unknown> | null,
        insertRows: null as TableRow[] | null,
        filters: [] as Array<{ field: string; value: unknown }>,
        lteFilter: null as { field: string; value: string } | null,
        limit: null as number | null,
        orderField: null as string | null,
        ascending: true,
      }

      const builder = {
        select: () => builder,
        update: (patch: Record<string, unknown>) => {
          state.patch = patch
          return builder
        },
        insert: (row: TableRow | TableRow[]) => {
          state.insertRows = Array.isArray(row) ? row : [row]
          return builder
        },
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        in: (field: string, values: unknown[]) => {
          state.filters.push({ field, value: values })
          return builder
        },
        lte: (field: string, value: string) => {
          state.lteFilter = { field, value }
          return builder
        },
        order: (field: string, options?: { ascending?: boolean }) => {
          state.orderField = field
          state.ascending = options?.ascending ?? true
          return builder
        },
        limit: (count: number) => {
          state.limit = count
          return builder
        },
        maybeSingle: async () => {
          const matches = resolveRows()
          return { data: matches[0] ?? null, error: null }
        },
        then: async (
          onfulfilled?: ((value: { data: TableRow[] | null; error: null }) => unknown) | null
        ) => {
          const value = { data: resolveRows(), error: null }
          return onfulfilled ? onfulfilled(value) : value
        },
      }

      function resolveRows() {
        if (state.insertRows) {
          const inserted = state.insertRows.map((row, index) => ({
            id: row.id ?? `${table}-generated-${rows.length + index + 1}`,
            ...row,
          }))
          for (const row of inserted) {
            rows.push({ ...row })
          }
          return inserted.map((row) => ({ ...row }))
        }

        let matches = rows.filter((row) => {
          const matchesEq = state.filters.every((filter) =>
            Array.isArray(filter.value)
              ? (filter.value as unknown[]).includes(row[filter.field])
              : row[filter.field] === filter.value
          )
          const matchesLte =
            !state.lteFilter || String(row[state.lteFilter.field]) <= state.lteFilter.value
          return matchesEq && matchesLte
        })

        if (state.patch) {
          matches.forEach((row) => Object.assign(row, state.patch))
        }

        if (state.orderField) {
          matches = [...matches].sort((a, b) => {
            const left = String(a[state.orderField!])
            const right = String(b[state.orderField!])
            return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
          })
        }

        if (state.limit !== null) {
          matches = matches.slice(0, state.limit)
        }

        return matches.map((row) => ({ ...row }))
      }

      return builder
    },
  }
}

function createSchedule(overrides: Partial<BusinessScheduleRow>): BusinessScheduleRow {
  return {
    id: overrides.id ?? 'sched-1',
    user_id: overrides.user_id ?? 'user-1',
    schedule_key: overrides.schedule_key ?? 'scout',
    label: overrides.label ?? 'Scout Reddit',
    status: overrides.status ?? 'active',
    interval_minutes: overrides.interval_minutes ?? 30,
    last_enqueued_at: overrides.last_enqueued_at ?? null,
    last_completed_at: overrides.last_completed_at ?? null,
    next_run_at: overrides.next_run_at ?? '2026-05-27T08:00:00.000Z',
    payload: overrides.payload ?? { agentId: 'scout' },
    created_at: overrides.created_at ?? '2026-05-27T07:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-05-27T07:00:00.000Z',
  }
}

describe('ensureBusinessSchedulesForUser', () => {
  it('bootstrap les cinq schedules par défaut', async () => {
    const supabase = createFakeSupabase()
    const schedules = await ensureBusinessSchedulesForUser({
      supabase,
      userId: 'user-1',
      now: new Date('2026-05-27T09:00:00.000Z'),
    })

    expect(schedules.map((row) => row.schedule_key)).toEqual([
      'scout',
      'prospect',
      'follow_ups',
      'devops',
      'hermes_operator',
    ])
    expect(supabase.tables.business_schedules).toHaveLength(5)
  })
})

describe('runBusinessScheduler', () => {
  it('enqueue les schedules dus et avance next_run_at', async () => {
    const supabase = createFakeSupabase([
      createSchedule({
        id: 'sched-follow-ups',
        schedule_key: 'follow_ups',
        label: 'Follow-up Scan',
        interval_minutes: 30,
        payload: { mode: 'follow_ups' },
      }),
      createSchedule({
        id: 'sched-devops',
        schedule_key: 'devops',
        label: 'DevOps Diagnostics',
        interval_minutes: 30,
        payload: { agentId: 'devops' },
        next_run_at: '2026-05-27T11:00:00.000Z',
      }),
    ])

    const report = await runBusinessScheduler({
      supabase,
      now: new Date('2026-05-27T09:00:00.000Z'),
      limit: 10,
    })

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      scheduleKey: 'follow_ups',
      status: 'enqueued',
    })
    expect(supabase.tables.autonomy_jobs).toHaveLength(1)
    expect(supabase.tables.autonomy_jobs[0]).toMatchObject({
      kind: 'follow_up_scan',
      user_id: 'user-1',
    })
    expect(supabase.tables.business_schedules[0]).toMatchObject({
      schedule_key: 'follow_ups',
      last_enqueued_at: '2026-05-27T09:00:00.000Z',
      next_run_at: '2026-05-27T09:30:00.000Z',
    })
  })

  it('ignore les schedules pausés ou futur', async () => {
    const supabase = createFakeSupabase([
      createSchedule({
        id: 'sched-paused',
        schedule_key: 'scout',
        status: 'paused',
      }),
      createSchedule({
        id: 'sched-future',
        schedule_key: 'prospect',
        next_run_at: '2026-05-27T10:00:00.000Z',
        payload: { agentId: 'prospect' },
      }),
    ])

    const report = await runBusinessScheduler({
      supabase,
      now: new Date('2026-05-27T09:00:00.000Z'),
      limit: 10,
    })

    expect(report).toHaveLength(0)
    expect(supabase.tables.autonomy_jobs).toHaveLength(0)
  })

  it('enqueue un hermes_operator_tick pour le schedule Hermes', async () => {
    const supabase = createFakeSupabase([
      createSchedule({
        id: 'sched-hermes',
        schedule_key: 'hermes_operator',
        label: 'Hermes Operator',
        interval_minutes: 60,
        payload: { mode: 'observe' },
      }),
    ])

    const report = await runBusinessScheduler({
      supabase,
      now: new Date('2026-05-27T09:00:00.000Z'),
      limit: 10,
    })

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      scheduleKey: 'hermes_operator',
      status: 'enqueued',
    })
    expect(supabase.tables.autonomy_jobs[0]).toMatchObject({
      kind: 'hermes_operator_tick',
      user_id: 'user-1',
      payload: {
        mode: 'observe',
        scheduleId: 'sched-hermes',
        scheduleKey: 'hermes_operator',
        scheduled: true,
      },
    })
  })

  it('ignore les schedules quand le contrôle global utilisateur est en pause', async () => {
    const supabase = createFakeSupabase(
      [
        createSchedule({
          id: 'sched-devops',
          schedule_key: 'devops',
          label: 'DevOps Diagnostics',
          interval_minutes: 30,
          payload: { agentId: 'devops' },
        }),
      ],
      [],
      [
        {
          user_id: 'user-1',
          status: 'paused',
          reason: 'incident',
          max_scheduler_jobs_per_run: 10,
          max_worker_jobs_per_drain: 10,
          paused_at: '2026-05-27T08:55:00.000Z',
          created_at: '2026-05-27T08:55:00.000Z',
          updated_at: '2026-05-27T08:55:00.000Z',
        },
      ]
    )

    const report = await runBusinessScheduler({
      supabase,
      now: new Date('2026-05-27T09:00:00.000Z'),
      limit: 10,
    })

    expect(report).toEqual([
      {
        userId: 'user-1',
        scheduleKey: 'devops',
        status: 'skipped',
        reason: 'autonomy_paused',
      },
    ])
    expect(supabase.tables.autonomy_jobs).toHaveLength(0)
  })

  it('respecte le plafond scheduler par utilisateur', async () => {
    const supabase = createFakeSupabase(
      [
        createSchedule({
          id: 'sched-scout',
          schedule_key: 'scout',
          payload: { agentId: 'scout' },
        }),
        createSchedule({
          id: 'sched-devops',
          schedule_key: 'devops',
          payload: { agentId: 'devops' },
        }),
      ],
      [],
      [
        {
          user_id: 'user-1',
          status: 'active',
          reason: null,
          max_scheduler_jobs_per_run: 1,
          max_worker_jobs_per_drain: 10,
          paused_at: null,
          created_at: '2026-05-27T08:55:00.000Z',
          updated_at: '2026-05-27T08:55:00.000Z',
        },
      ]
    )

    const report = await runBusinessScheduler({
      supabase,
      now: new Date('2026-05-27T09:00:00.000Z'),
      limit: 10,
    })

    expect(report.map((item) => item.status)).toEqual(['enqueued', 'skipped'])
    expect(report[1]).toMatchObject({ reason: 'scheduler_limit_reached' })
    expect(supabase.tables.autonomy_jobs).toHaveLength(1)
  })
})

describe('updateBusinessSchedule', () => {
  it('met à jour le status et la cadence d un schedule', async () => {
    const supabase = createFakeSupabase([createSchedule({ schedule_key: 'devops' })])
    const updated = await updateBusinessSchedule({
      supabase,
      userId: 'user-1',
      scheduleKey: 'devops',
      status: 'paused',
      intervalMinutes: 45,
      now: new Date('2026-05-27T09:00:00.000Z'),
    })

    expect(updated).toMatchObject({
      schedule_key: 'devops',
      status: 'paused',
      interval_minutes: 45,
    })
  })
})
