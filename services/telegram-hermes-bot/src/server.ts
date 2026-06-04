import { createServer } from 'node:http'
import { loadTelegramHermesBotConfig } from './config'
import { normalizeTelegramUpdate } from './telegram-types'

export function createTelegramHermesBotServer() {
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/telegram/webhook') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Not found' }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))

    const rawBody = Buffer.concat(chunks).toString('utf8')
    const payload = rawBody.length > 0 ? JSON.parse(rawBody) : {}
    const normalized = normalizeTelegramUpdate(payload)

    res.writeHead(202, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        accepted: true,
        chatId: normalized.chatId,
        text: normalized.text,
      })
    )
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadTelegramHermesBotConfig()
  const server = createTelegramHermesBotServer()
  server.listen(config.port, () => {
    console.log(`telegram-hermes-bot listening on :${config.port}`)
  })
}
