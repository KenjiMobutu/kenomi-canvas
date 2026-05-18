import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      }
    : undefined,
  base: { service: 'kenomi-canvas' },
})

export function logError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error)
  logger.error({ scope, ...context, error: message }, `[${scope}] ${message}`)
}

export function logWarn(scope: string, message: string, context?: Record<string, unknown>): void {
  logger.warn({ scope, ...context }, `[${scope}] ${message}`)
}

export function logInfo(scope: string, message: string, context?: Record<string, unknown>): void {
  logger.info({ scope, ...context }, `[${scope}] ${message}`)
}
