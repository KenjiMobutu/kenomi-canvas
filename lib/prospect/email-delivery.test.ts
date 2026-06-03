import { describe, expect, it, vi } from 'vitest'
import { resolveEmailDeliveryStatus, sendProspectEmail } from './email-delivery'

describe('resolveEmailDeliveryStatus', () => {
  it('prefers resend when configured', () => {
    expect(
      resolveEmailDeliveryStatus({
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'hello@kenomi.eu',
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      configured: true,
      provider: 'resend',
      fromAddress: 'hello@kenomi.eu',
    })
  })

  it('requires mailgun domain to mark mailgun as configured', () => {
    expect(
      resolveEmailDeliveryStatus({
        MAILGUN_API_KEY: 'mg_test',
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      configured: false,
      provider: null,
      fromAddress: null,
    })
  })
})

describe('sendProspectEmail', () => {
  it('sends through resend', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: 're_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await sendProspectEmail(
      {
        from: 'hello@kenomi.eu',
        to: 'lead@example.com',
        subject: 'Hello',
        text: 'World',
      },
      {
        env: {
          RESEND_API_KEY: 're_test',
          EMAIL_FROM: 'hello@kenomi.eu',
        } as unknown as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result).toEqual({ provider: 'resend', messageId: 're_123' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends through smtp via injected transport', async () => {
    const smtpSendMail = vi.fn(async () => ({ messageId: '<smtp-1@example.com>' }))

    const result = await sendProspectEmail(
      {
        from: 'hello@kenomi.eu',
        to: 'lead@example.com',
        subject: 'Hello',
        text: 'World',
      },
      {
        env: {
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_USER: 'user',
          SMTP_PASS: 'pass',
          SMTP_FROM: 'hello@kenomi.eu',
        } as unknown as NodeJS.ProcessEnv,
        smtpSendMail,
      }
    )

    expect(result).toEqual({ provider: 'smtp', messageId: '<smtp-1@example.com>' })
    expect(smtpSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
      })
    )
  })
})
