import { describe, expect, it } from 'vitest'
import { buildGmailDraftPayload } from './gmail-draft'

describe('buildGmailDraftPayload', () => {
  it('builds a Gmail-ready draft payload from send_outreach input', () => {
    const payload = buildGmailDraftPayload({
      prospectId: 'prospect-1',
      companyName: 'Acme Studio',
      contactName: 'Marie',
      to: 'marie@acme.test',
      subject: 'Acme Studio — qualifier plus vite',
      body: 'Bonjour Marie, je vous propose une méthode plus rapide.',
    })

    expect(payload).toMatchObject({
      channel: 'email',
      provider: 'gmail',
      status: 'draft',
    })
    expect(String(payload.content)).toContain('Bonjour Marie')
    expect(payload.metadata).toMatchObject({
      title: 'Acme Studio — qualifier plus vite',
      to: 'marie@acme.test',
      prospect_id: 'prospect-1',
      company_name: 'Acme Studio',
      asset_kind: 'outreach_email',
    })
  })
})
