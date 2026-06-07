# Telegram Hermes Operator

## Required env

### App
- `TELEGRAM_OPERATOR_SHARED_SECRET`
- `TELEGRAM_OPERATOR_NOTIFY_URL`

### Bot
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_OPERATOR_SHARED_SECRET`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `TELEGRAM_OPERATOR_APP_BASE_URL`

## Command flow

1. Telegram sends a webhook to `POST /telegram/webhook` on the bot service.
2. The bot verifies `x-telegram-bot-api-secret-token`.
3. The bot allowlists `TELEGRAM_ALLOWED_CHAT_ID`.
4. The bot calls `POST /api/operator/telegram/command`.
5. The app writes an `operator_remote_commands` audit row.
6. The bot sends the returned summary back to Telegram with `sendMessage`.

## Verify webhook

1. Start the bot service.
2. Send `/brief` from the allowlisted Telegram chat.
3. Confirm the bot replies with a Hermes summary.
4. Confirm the app recorded one audit row in `operator_remote_commands`.

## Verify notifications

1. Set `notification_mode=webhook` in Hermes operator settings.
2. Enable `telegram_enabled` and `telegram_notifications_enabled`.
3. Trigger one Hermes run with at least one alert.
4. Confirm the bot receives the notify payload.

## Diagnostic cash lane

Active commercial lane:

- offer: `300EUR diagnostic`
- target: `freelancers / small agencies`
- CTA: `book diagnostic call`

Daily operator order:

1. clear visible approvals
2. clear due follow-ups
3. act on hot replies
4. refresh prospecting only after queue debt is handled

## Failure modes

- unauthorized chat id
- invalid Telegram webhook secret
- invalid app shared secret
- `/api/operator/telegram/command` returns `4xx` or `5xx`
- Telegram `sendMessage` failure
- notify webhook failure
