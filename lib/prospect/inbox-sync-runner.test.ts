import { describe, expect, it } from 'vitest'
import { runInboxSync } from './inbox-sync-runner'

function createFakeSupabase() {
  const tables = {
    prospects: [
      {
        id: 'p-bounce',
        user_id: 'user-1',
        company_name: '360 Branding Studio',
        contact_email: 'info@360brandingstudio.com',
        pipeline_status: 'sent',
        status: 'sent',
        operator_notes: null,
        metadata: {},
        last_outreach_kind: 'initial',
      },
      {
        id: 'p-ack',
        user_id: 'user-1',
        company_name: 'webfactory GmbH',
        contact_email: 'info@webfactory.de',
        pipeline_status: 'sent',
        status: 'sent',
        operator_notes: null,
        metadata: {},
        last_outreach_kind: 'follow_up_1',
      },
      {
        id: 'p-reply',
        user_id: 'user-1',
        company_name: 'Kingsize Branding Studio',
        contact_email: 'arthur@kingsize.co',
        pipeline_status: 'sent',
        status: 'sent',
        operator_notes: null,
        metadata: {},
        last_outreach_kind: 'initial',
      },
    ],
    prospect_activities: [] as Array<Record<string, unknown>>,
  }

  function makeBuilder(tableName: keyof typeof tables) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown }>,
      patch: null as Record<string, unknown> | null,
      insertRows: null as Array<Record<string, unknown>> | null,
    }

    const rows = tables[tableName] as Array<Record<string, unknown>>
    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => {
        state.filters.push({ field, value })
        return builder
      },
      in: (field: string, values: unknown[]) => {
        state.filters.push({ field, value: values })
        return builder
      },
      order: () => builder,
      limit: () => builder,
      update: (patch: Record<string, unknown>) => {
        state.patch = patch
        return builder
      },
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        state.insertRows = Array.isArray(payload) ? payload : [payload]
        return builder
      },
      maybeSingle: async () => {
        const filtered = rows.filter((row) =>
          state.filters.every((filter) =>
            Array.isArray(filter.value)
              ? filter.value.includes(row[filter.field])
              : row[filter.field] === filter.value
          )
        )
        const row = filtered[0] ?? null
        if (row && state.patch) Object.assign(row, state.patch)
        if (state.insertRows) rows.push(...state.insertRows)
        return { data: row ? { ...row } : null, error: null }
      },
      then: async (resolve: (value: { data: unknown; error: null }) => unknown) => {
        const filtered = rows.filter((row) =>
          state.filters.every((filter) =>
            Array.isArray(filter.value)
              ? filter.value.includes(row[filter.field])
              : row[filter.field] === filter.value
          )
        )
        if (state.patch) {
          for (const row of filtered) Object.assign(row, state.patch)
        }
        if (state.insertRows) rows.push(...state.insertRows)
        return resolve({ data: filtered.map((row) => ({ ...row })), error: null })
      },
    }

    return builder
  }

  return {
    tables,
    from(tableName: string) {
      if (tableName !== 'prospects' && tableName !== 'prospect_activities') {
        throw new Error(`Unexpected table ${tableName}`)
      }
      return makeBuilder(tableName)
    },
  }
}

describe('runInboxSync', () => {
  it('syncs bounce, auto-ack, and human reply signals into CRM state', async () => {
    const supabase = createFakeSupabase()
    const seen: string[] = []

    const result = await runInboxSync({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-06-09T01:00:00.000Z'),
      transport: {
        listUnreadMessages: async () => [
          {
            id: 'm-bounce',
            from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
            subject: 'Delivery Status Notification (Failure)',
            body: "Your message wasn't delivered to info@360brandingstudio.com\nFinal-Recipient: rfc822; info@360brandingstudio.com",
          },
          {
            id: 'm-ack',
            from: '"webfactory GmbH" <info@webfactory.de>',
            subject: '(Fall 211346) Eingangsbestätigung [AW: webfactory GmbH — 300EUR Diagnostic]',
            body: 'Vielen Dank für Ihre E-Mail. Sie hat die Fallnummer 211346 bekommen.',
          },
          {
            id: 'm-reply',
            from: 'Arthur <arthur@kingsize.co>',
            subject: 'Re: Kingsize Branding Studio — 300EUR Diagnostic for manual lead qualification',
            body: 'Interesting. Send me the exact scope.',
          },
        ],
        markSeen: async (messageId: string) => {
          seen.push(messageId)
        },
      },
    })

    expect(result).toMatchObject({
      processed: 3,
      bounced: 1,
      autoAcknowledged: 1,
      replied: 1,
    })
    expect(seen).toEqual(['m-bounce', 'm-ack', 'm-reply'])
    expect(supabase.tables.prospects.find((row) => row.id === 'p-bounce')).toMatchObject({
      pipeline_status: 'lost',
      status: 'lost',
    })
    expect(supabase.tables.prospects.find((row) => row.id === 'p-reply')).toMatchObject({
      pipeline_status: 'replied',
      status: 'replied',
    })
    expect(supabase.tables.prospects.find((row) => row.id === 'p-ack')?.operator_notes).toContain(
      'Automatic acknowledgement detected via inbox sync.'
    )
    expect(supabase.tables.prospect_activities).toHaveLength(3)
  })

  it('can build its transport from env when none is injected', async () => {
    const supabase = createFakeSupabase()
    const seen: string[] = []

    const result = await runInboxSync({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-06-09T01:00:00.000Z'),
      env: {
        SMTP_HOST: 'smtp.hostinger.com',
        SMTP_USER: 'kenji@kenomi.eu',
        SMTP_PASS: 'secret',
      } as unknown as NodeJS.ProcessEnv,
      transportFactory: () => ({
        listUnreadMessages: async () => [
          {
            id: 'm-reply',
            from: 'Arthur <arthur@kingsize.co>',
            subject: 'Re: Kingsize Branding Studio — 300EUR Diagnostic',
            body: 'Interesting. Send me the exact scope.',
          },
        ],
        markSeen: async (messageId: string) => {
          seen.push(messageId)
        },
      }),
    })

    expect(result.replied).toBe(1)
    expect(seen).toEqual(['m-reply'])
  })
})
