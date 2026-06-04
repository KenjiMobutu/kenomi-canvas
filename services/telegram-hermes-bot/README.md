# telegram-hermes-bot

Thin Telegram transport for Hermes Operator.

## Required env

- `PORT`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_OPERATOR_SHARED_SECRET`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `TELEGRAM_OPERATOR_APP_BASE_URL`

## Dev

```bash
npm run test -- services/telegram-hermes-bot/src/server.test.ts
node --import tsx services/telegram-hermes-bot/src/server.ts
```

## Webhook contract

- inbound path: `POST /telegram/webhook`
- inbound auth header: `x-telegram-bot-api-secret-token`
- outbound app call: `POST /api/operator/telegram/command`
- outbound Telegram reply: `sendMessage`
