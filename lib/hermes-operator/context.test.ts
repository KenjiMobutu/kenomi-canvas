import { describe, expect, it } from 'vitest'
import { buildHermesOperatorContext } from '@/lib/hermes-operator/context'
import { normalizeOperatorMode } from '@/lib/hermes-operator/types'

type TableMap = Record<string, Record<string, unknown>[]>

function createFakeSupabase(tables: TableMap) {
  function build(table: string, rows: Record<string, unknown>[]) {
    let current = [...rows]

    const api = {
      select() {
        return api
      },
      eq(field: string, value: unknown) {
        current = current.filter((row) => row[field] === value)
        return api
      },
      order(field: string, options?: { ascending?: boolean }) {
        const ascending = options?.ascending ?? true
        current = [...current].sort((left, right) => {
          const leftValue = left[field]
          const rightValue = right[field]
          if (leftValue === rightValue) return 0
          if (leftValue === undefined || leftValue === null) return ascending ? 1 : -1
          if (rightValue === undefined || rightValue === null) return ascending ? -1 : 1
          return String(leftValue).localeCompare(String(rightValue)) * (ascending ? 1 : -1)
        })
        return api
      },
      limit(count: number) {
        current = current.slice(0, count)
        return api
      },
      maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
      then: (onfulfilled?: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: current, error: null })),
    }

    return api
  }

  return {
    from(table: string) {
      return build(table, tables[table] ?? [])
    },
  }
}

describe('normalizeOperatorMode', () => {
  it('normalizes invalid runtime modes to observe', () => {
    expect(normalizeOperatorMode('wrong')).toBe('observe')
    expect(normalizeOperatorMode('recommend')).toBe('recommend')
    expect(normalizeOperatorMode('act')).toBe('act')
  })
})

describe('buildHermesOperatorContext', () => {
  it('builds one operator snapshot from revenue, prospects, infra, and autonomy state', async () => {
    const supabase = createFakeSupabase({
      offers: [{ id: 'offer-a', user_id: 'user-1', name: 'Outbound Sprint' }],
      prospects: [
        {
          id: 'p1',
          user_id: 'user-1',
          source: 'linkedin',
          band: 'warm',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          pipeline_status: 'won',
          created_at: '2026-05-28T08:00:00.000Z',
          next_followup_at: '2026-05-28T09:00:00.000Z',
          metadata: { model: 'hermes3:8b', model_family: 'hermes' },
        },
        {
          id: 'p2',
          user_id: 'user-1',
          source: 'reddit',
          band: 'hot',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          pipeline_status: 'awaiting_approval',
          created_at: '2026-05-28T08:30:00.000Z',
          next_followup_at: '2026-05-28T08:45:00.000Z',
          metadata: { model: 'hermes3:8b', model_family: 'hermes' },
        },
      ],
      prospect_activities: [
        { prospect_id: 'p1', type: 'marked_sent', created_at: '2026-05-28T08:10:00.000Z' },
        { prospect_id: 'p1', type: 'marked_replied', created_at: '2026-05-28T09:10:00.000Z' },
        { prospect_id: 'p1', type: 'marked_won', created_at: '2026-05-28T10:10:00.000Z' },
      ],
      prospect_conversation_events: [
        { prospect_id: 'p1', event_type: 'closed_won', created_at: '2026-05-28T10:10:00.000Z' },
      ],
      autonomy_controls: [
        {
          user_id: 'user-1',
          status: 'active',
          reason: null,
          max_scheduler_jobs_per_run: 10,
          max_worker_jobs_per_drain: 10,
          paused_at: null,
          created_at: '2026-05-28T07:00:00.000Z',
          updated_at: '2026-05-28T07:00:00.000Z',
        },
      ],
      autonomy_jobs: [
        {
          id: 'job-1',
          user_id: 'user-1',
          kind: 'run_agent',
          status: 'queued',
          next_run_at: '2026-05-28T10:30:00.000Z',
          last_error: null,
          payload: { agentId: 'prospect' },
          created_at: '2026-05-28T10:00:00.000Z',
        },
        {
          id: 'job-2',
          user_id: 'user-1',
          kind: 'run_agent',
          status: 'failed',
          next_run_at: '2026-05-28T09:30:00.000Z',
          last_error: 'network',
          payload: { agentId: 'devops' },
          created_at: '2026-05-28T09:00:00.000Z',
        },
      ],
      human_approvals: [
        {
          id: 'approval-1',
          user_id: 'user-1',
          status: 'pending',
          created_at: '2026-05-28T09:50:00.000Z',
        },
      ],
      devops_diagnostic_runs: [
        {
          id: 'run-1',
          user_id: 'user-1',
          summary_status: 'degraded',
          checked_at: '2026-05-28T10:05:00.000Z',
          created_at: '2026-05-28T10:05:03.000Z',
          summary_payload: {
            headline: '1 open infra incident',
            summary: 'Ollama is degraded.',
            operator_next_step: 'Restart Ollama if latency remains high.',
            global_status: 'degraded',
            services: [{ id: 'ollama', status: 'degraded' }],
          },
          runtime_payload: { commitShort: 'abc1234', sourceCommit: 'abc123456789' },
          timeline_payload: {
            incidents: [{ id: 'incident-1', title: 'Ollama latency', status: 'open' }],
          },
        },
      ],
    })

    const snapshot = await buildHermesOperatorContext({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-05-28T10:30:00.000Z'),
    })

    expect(snapshot.revenue.conversions.bestOffer?.offerName).toBe('Outbound Sprint')
    expect(snapshot.prospects.pendingApprovals).toBe(1)
    expect(snapshot.prospects.followUpsDue).toBe(1)
    expect(snapshot.automation.autonomyStatus).toBe('active')
    expect(snapshot.automation.queuedJobs).toBe(1)
    expect(snapshot.automation.failedJobs).toBe(1)
    expect(snapshot.infrastructure.status).toBe('degraded')
    expect(snapshot.infrastructure.runtimeCommit).toBe('abc1234')
    expect(snapshot.revenue.weeklyReview.bestOffer.title).toBe('Outbound Sprint')
  })
})
