import { describe, expect, it } from 'vitest'
import {
  classifyInboxMessage,
  parseImapSearchIds,
  parseMessageHeaders,
  resolveInboxSyncConfig,
} from './inbox-sync'

describe('resolveInboxSyncConfig', () => {
  it('falls back from smtp.hostinger.com to imap.hostinger.com', () => {
    expect(
      resolveInboxSyncConfig({
        SMTP_HOST: 'smtp.hostinger.com',
        SMTP_USER: 'kenji@kenomi.eu',
        SMTP_PASS: 'secret',
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      enabled: true,
      host: 'imap.hostinger.com',
      port: 993,
      secure: true,
      username: 'kenji@kenomi.eu',
      password: 'secret',
      mailbox: 'INBOX',
    })
  })

  it('returns disabled when no credentials are available', () => {
    expect(resolveInboxSyncConfig({} as unknown as NodeJS.ProcessEnv)).toEqual({
      enabled: false,
      host: null,
      port: null,
      secure: true,
      username: null,
      password: null,
      mailbox: 'INBOX',
    })
  })
})

describe('parseImapSearchIds', () => {
  it('extracts unread message ids from a SEARCH response', () => {
    expect(parseImapSearchIds('* SEARCH 138 139 140\r\n')).toEqual(['138', '139', '140'])
  })
})

describe('parseMessageHeaders', () => {
  it('normalizes folded IMAP headers', () => {
    const headers = parseMessageHeaders(
      [
        'Date: Tue, 09 Jun 2026 00:45:56 +0000',
        'From: "webfactory GmbH" <info@webfactory.de>',
        'To: "kenji@kenomi.eu" <kenji@kenomi.eu>',
        'Subject: =?utf-8?B?KEZhbGwgMjExMzQ2KSBFaW5nYW5nc2Jlc3TDpHRpZ3VuZw==?=',
        ' =?utf-8?B?IFtBVzogd2ViZmFjdG9yeSBHbWJIIOKAlCAzMDBFVVJd?=',
      ].join('\r\n')
    )

    expect(headers.from).toContain('info@webfactory.de')
    expect(headers.to).toContain('kenji@kenomi.eu')
    expect(headers.subject).toContain('=?utf-8?B?')
  })
})

describe('classifyInboxMessage', () => {
  it('classifies mailbox-not-found emails as bounces and extracts the failed recipient', () => {
    const result = classifyInboxMessage({
      from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      subject: 'Delivery Status Notification (Failure)',
      body: [
        '** Address not found **',
        "Your message wasn't delivered to info@360brandingstudio.com because the address couldn't be found.",
        'Final-Recipient: rfc822; info@360brandingstudio.com',
      ].join('\n'),
    })

    expect(result.kind).toBe('bounce')
    expect(result.prospectEmail).toBe('info@360brandingstudio.com')
  })

  it('classifies ticket acknowledgements as auto-acks', () => {
    const result = classifyInboxMessage({
      from: '"webfactory GmbH" <info@webfactory.de>',
      subject: '(Fall 211346) Eingangsbestätigung [AW: webfactory GmbH — 300EUR Diagnostic]',
      body: [
        'Guten Tag,',
        '',
        'vielen Dank für Ihre E-Mail. Sie ist bei uns angekommen und hat die Fallnummer 211346 bekommen.',
      ].join('\n'),
    })

    expect(result.kind).toBe('auto_ack')
    expect(result.prospectEmail).toBe('info@webfactory.de')
  })

  it('classifies direct prospect answers as human replies', () => {
    const result = classifyInboxMessage({
      from: 'Arthur <arthur@kingsize.co>',
      subject: 'Re: Kingsize Branding Studio — 300EUR Diagnostic for manual lead qualification',
      body: 'Interesting. Send me the exact scope and a couple of slots.',
    })

    expect(result.kind).toBe('human_reply')
    expect(result.prospectEmail).toBe('arthur@kingsize.co')
  })
})
