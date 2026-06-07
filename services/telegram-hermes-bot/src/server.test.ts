import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTelegramHermesBotServer } from './server'
import { normalizeTelegramUpdate } from './telegram-types'

describe('telegram bot service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts chat id and text from a message update', () => {
    expect(
      normalizeTelegramUpdate({
        message: { chat: { id: 42 }, text: '/brief' },
      })
    ).toMatchObject({ chatId: '42', text: '/brief' })
  })

  it('forwards normalized message to app control plane', async () => {
    const sendTelegramCommandToApp = vi.fn().mockResolvedValue({ summary: 'Brief ready.' })
    const sendTelegramMessage = vi.fn().mockResolvedValue({ ok: true })
    const server = createTelegramHermesBotServer({
      config: {
        port: 0,
        botToken: 'telegram-bot-token',
        webhookSecret: 'telegram-webhook-secret',
        sharedSecret: 'operator-shared-secret',
        appBaseUrl: 'https://lab.kenomi.eu',
        allowedChatId: '42',
      },
      sendTelegramCommandToApp,
      sendTelegramMessage,
    })

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind')

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': 'telegram-webhook-secret',
        },
        body: JSON.stringify({
          message: { chat: { id: 42 }, text: '/brief' },
        }),
      })

      expect(res.status).toBe(202)
      expect(sendTelegramCommandToApp).toHaveBeenCalledWith({
        baseUrl: 'https://lab.kenomi.eu',
        sharedSecret: 'operator-shared-secret',
        chatId: '42',
        text: '/brief',
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it('sends formatted reply back to Telegram', async () => {
    const sendTelegramCommandToApp = vi.fn().mockResolvedValue({ summary: 'Prospect run launched.' })
    const sendTelegramMessage = vi.fn().mockResolvedValue({ ok: true })
    const server = createTelegramHermesBotServer({
      config: {
        port: 0,
        botToken: 'telegram-bot-token',
        webhookSecret: '',
        sharedSecret: 'operator-shared-secret',
        appBaseUrl: 'https://lab.kenomi.eu',
        allowedChatId: '42',
      },
      sendTelegramCommandToApp,
      sendTelegramMessage,
    })

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind')

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: { chat: { id: 42 }, text: 'run prospect' },
        }),
      })

      expect(res.status).toBe(202)
      expect(sendTelegramMessage).toHaveBeenCalledWith({
        botToken: 'telegram-bot-token',
        chatId: '42',
        text: 'Prospect run launched.',
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it('accepts app-side notify webhook and forwards alerts to the allowed chat', async () => {
    const sendTelegramCommandToApp = vi.fn()
    const sendTelegramMessage = vi.fn().mockResolvedValue({ ok: true })
    const server = createTelegramHermesBotServer({
      config: {
        port: 0,
        botToken: 'telegram-bot-token',
        webhookSecret: '',
        sharedSecret: 'operator-shared-secret',
        appBaseUrl: 'https://lab.kenomi.eu',
        allowedChatId: '42',
      },
      sendTelegramCommandToApp,
      sendTelegramMessage,
    })

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind')

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/telegram/webhook/notify`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer operator-shared-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          bot_label: 'Hermes',
          brief: {
            summary: 'LinkedIn is the strongest source.',
            next_best_action: 'Run prospect on warm leads',
          },
          execution: {
            enqueued_jobs_count: 2,
            blocked_by_policy_count: 1,
            top_blocked_reason: 'action_cap_reached',
          },
          alerts: [
            {
              severity: 'warn',
              headline: 'Cash blocked by approvals',
            },
          ],
        }),
      })

      expect(res.status).toBe(202)
      expect(sendTelegramCommandToApp).not.toHaveBeenCalled()
      expect(sendTelegramMessage).toHaveBeenCalledWith({
        botToken: 'telegram-bot-token',
        chatId: '42',
        text: [
          'Hermes update',
          'LinkedIn is the strongest source.',
          'Next: Run prospect on warm leads',
          'Executed: 2 job(s)',
          'Blocked: 1 action(s) (action_cap_reached)',
          '- [WARN] Cash blocked by approvals',
        ].join('\n'),
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
