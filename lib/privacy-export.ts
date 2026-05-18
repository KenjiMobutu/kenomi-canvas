export interface PrivacyExportInput {
  settings?: {
    openai_api_key?: string | null
    claude_api_key?: string | null
    stripe_secret_key?: string | null
    stripe_webhook_secret?: string | null
  } | null
  [key: string]: unknown
}

export interface PrivacyQueryResultLike {
  error: { message: string } | null
}

export interface PrivacyQueryError {
  section: string
  message: string
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

export function collectPrivacyQueryErrors(
  results: Record<string, PrivacyQueryResultLike>
): PrivacyQueryError[] {
  return Object.entries(results)
    .filter((entry): entry is [string, { error: { message: string } }] => entry[1].error !== null)
    .map(([section, result]) => ({
      section,
      message: result.error.message,
    }))
}
