import { isAllowedWebhookUrl } from '@/lib/security'

export async function notifyNurtureSignup(input: {
  env?: Record<string, string | undefined>
  payload: {
    slug: string
    ventureId: string | null
    email: string
    source: string
  }
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const env = input.env ?? (process.env as Record<string, string | undefined>)
  const url = env.NURTURE_WEBHOOK_URL

  if (!url) return { ok: true, skipped: true }
  if (!isAllowedWebhookUrl(url, env as NodeJS.ProcessEnv)) {
    return { ok: false, error: 'NURTURE_WEBHOOK_URL not allowed' }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.NURTURE_WEBHOOK_TOKEN
        ? { authorization: `Bearer ${env.NURTURE_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(input.payload),
  })

  if (!response.ok) return { ok: false, error: `nurture ${response.status}` }
  return { ok: true }
}
