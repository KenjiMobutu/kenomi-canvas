export type TelegramHermesBotConfig = {
  port: number
  botToken: string
  webhookSecret: string
}

export function loadTelegramHermesBotConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramHermesBotConfig {
  return {
    port: Number(env.PORT ?? 4010),
    botToken: env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '',
  }
}
