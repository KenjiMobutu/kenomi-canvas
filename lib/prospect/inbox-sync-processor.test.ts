import { describe, expect, it } from 'vitest'
import { buildInboxSyncMutations } from './inbox-sync-processor'

const prospects = [
  {
    id: 'p-bounce',
    company_name: '360 Branding Studio',
    contact_email: 'info@360brandingstudio.com',
    pipeline_status: 'sent',
    operator_notes: null,
    metadata: {},
    last_outreach_kind: 'initial',
  },
  {
    id: 'p-auto-ack',
    company_name: 'webfactory GmbH',
    contact_email: 'info@webfactory.de',
    pipeline_status: 'sent',
    operator_notes: null,
    metadata: {},
    last_outreach_kind: 'follow_up_1',
  },
  {
    id: 'p-reply',
    company_name: 'Kingsize Branding Studio',
    contact_email: 'arthur@kingsize.co',
    pipeline_status: 'sent',
    operator_notes: null,
    metadata: {},
    last_outreach_kind: 'initial',
  },
] as const

describe('buildInboxSyncMutations', () => {
  it('marks bounced leads as lost', () => {
    const result = buildInboxSyncMutations({
      prospects,
      messages: [
        {
          id: 'm-bounce',
          from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
          subject: 'Delivery Status Notification (Failure)',
          body: [
            '** Address not found **',
            "Your message wasn't delivered to info@360brandingstudio.com because the address couldn't be found.",
            'Final-Recipient: rfc822; info@360brandingstudio.com',
          ].join('\n'),
        },
      ],
      nowIso: '2026-06-09T01:00:00.000Z',
    })

    expect(result.mutations).toEqual([
      expect.objectContaining({
        messageId: 'm-bounce',
        prospectId: 'p-bounce',
        classification: 'bounce',
        nextStatus: 'lost',
      }),
    ])
  })

  it('records ticket auto-acks as notes without marking replied', () => {
    const result = buildInboxSyncMutations({
      prospects,
      messages: [
        {
          id: 'm-ack',
          from: '"webfactory GmbH" <info@webfactory.de>',
          subject: '(Fall 211346) Eingangsbestätigung [AW: webfactory GmbH — 300EUR Diagnostic]',
          body: 'Vielen Dank für Ihre E-Mail. Sie hat die Fallnummer 211346 bekommen.',
        },
      ],
      nowIso: '2026-06-09T01:00:00.000Z',
    })

    expect(result.mutations).toEqual([
      expect.objectContaining({
        messageId: 'm-ack',
        prospectId: 'p-auto-ack',
        classification: 'auto_ack',
        nextStatus: null,
      }),
    ])
  })

  it('marks direct replies as replied', () => {
    const result = buildInboxSyncMutations({
      prospects,
      messages: [
        {
          id: 'm-reply',
          from: 'Arthur <arthur@kingsize.co>',
          subject: 'Re: Kingsize Branding Studio — 300EUR Diagnostic for manual lead qualification',
          body: 'Interesting. Send me the exact scope.',
        },
      ],
      nowIso: '2026-06-09T01:00:00.000Z',
    })

    expect(result.mutations).toEqual([
      expect.objectContaining({
        messageId: 'm-reply',
        prospectId: 'p-reply',
        classification: 'human_reply',
        nextStatus: 'replied',
      }),
    ])
  })
})
