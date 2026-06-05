import { createServer } from 'node:http'
import { sendTelegramCommandToApp } from './app-api'
import { loadTelegramHermesBotConfig } from './config'
import { formatTelegramReply } from './format'
import { sendTelegramMessage } from './telegram-api'
import { normalizeTelegramUpdate } from './telegram-types'

interface TelegramNotifyAlert {
  severity?: string
  headline?: string
}

export function createTelegramHermesBotServer(input?: {
  config?: ReturnType<typeof loadTelegramHermesBotConfig>
  sendTelegramCommandToApp?: typeof sendTelegramCommandToApp
  sendTelegramMessage?: typeof sendTelegramMessage
}) {
  const config = input?.config ?? loadTelegramHermesBotConfig()
  const sendAppCommand = input?.sendTelegramCommandToApp ?? sendTelegramCommandToApp
  const sendMessage = input?.sendTelegramMessage ?? sendTelegramMessage

  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, status: 'ready' }))
      return
    }

    if (req.method === 'POST' && req.url === '/telegram/webhook/notify') {
      if (req.headers.authorization !== `Bearer ${config.sharedSecret}`) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
        return
      }

      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const rawBody = Buffer.concat(chunks).toString('utf8')
      const payload = rawBody.length > 0 ? JSON.parse(rawBody) : {}
      const alerts: TelegramNotifyAlert[] = Array.isArray(payload?.alerts) ? payload.alerts : []
      const botLabel = typeof payload?.bot_label === 'string' && payload.bot_label.length > 0
        ? payload.bot_label
        : 'Hermes'

      if (alerts.length > 0 && config.allowedChatId) {
        const text = [
          `${botLabel} alerts`,
          ...alerts.slice(0, 5).map((alert) => {
            const severity = typeof alert?.severity === 'string' ? alert.severity.toUpperCase() : 'INFO'
            const headline = typeof alert?.headline === 'string' ? alert.headline : 'Alert'
            return `- [${severity}] ${headline}`
          }),
        ].join('\n')

        await sendMessage({
          botToken: config.botToken,
          chatId: config.allowedChatId,
          text,
        })
      }

      res.writeHead(202, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, accepted: alerts.length }))
      return
    }

    if (req.method !== 'POST' || req.url !== '/telegram/webhook') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Not found' }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))

    if (
      config.webhookSecret &&
      req.headers['x-telegram-bot-api-secret-token'] !== config.webhookSecret
    ) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
      return
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')
    const payload = rawBody.length > 0 ? JSON.parse(rawBody) : {}
    const normalized = normalizeTelegramUpdate(payload)

    if (!normalized.chatId || !normalized.text) {
      res.writeHead(202, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, accepted: false }))
      return
    }

    if (config.allowedChatId && normalized.chatId !== config.allowedChatId) {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden chat' }))
      return
    }

    const operatorReply = (await sendAppCommand({
      baseUrl: config.appBaseUrl,
      sharedSecret: config.sharedSecret,
      chatId: normalized.chatId,
      text: normalized.text,
    })) as { summary?: string }

    const formattedReply = formatTelegramReply({
      summary: operatorReply.summary ?? 'Hermes did not return a summary.',
    })

    await sendMessage({
      botToken: config.botToken,
      chatId: normalized.chatId,
      text: formattedReply,
    })

    res.writeHead(202, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        accepted: true,
        forwarded: true,
      })
    )
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadTelegramHermesBotConfig()
  const server = createTelegramHermesBotServer({ config })
  server.listen(config.port, () => {
    console.log(`telegram-hermes-bot listening on :${config.port}`)
  })
}
