export type TelegramHermesBotConfig = {
  port: number
  botToken: string
  webhookSecret: string
  sharedSecret: string
  appBaseUrl: string
  allowedChatId: string
}

export function loadTelegramHermesBotConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramHermesBotConfig {
  return {
    port: Number(env.PORT ?? 4010),
    botToken: env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '',
    sharedSecret: env.TELEGRAM_OPERATOR_SHARED_SECRET ?? '',
    appBaseUrl: env.TELEGRAM_OPERATOR_APP_BASE_URL ?? 'http://localhost:3000',
    allowedChatId: env.TELEGRAM_ALLOWED_CHAT_ID ?? '',
  }
}
