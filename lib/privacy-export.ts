export interface PrivacyExportInput {
  settings?: {
    openai_api_key?: string | null
    claude_api_key?: string | null
    stripe_secret_key?: string | null
    stripe_webhook_secret?: string | null
  } | null
  [key: string]: unknown
}

export function redactPrivacyExport(input: PrivacyExportInput): Record<string, unknown> {
  const { settings, ...rest } = input
  return {
    ...rest,
    settings: {
      has_openai_api_key: !!settings?.openai_api_key,
      has_claude_api_key: !!settings?.claude_api_key,
      has_stripe_secret_key: !!settings?.stripe_secret_key,
      has_stripe_webhook_secret: !!settings?.stripe_webhook_secret,
    },
  }
}
