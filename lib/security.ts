// lib/security.ts

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    if (/^169\.254\./.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedOllamaUrl(url: string): boolean {
  return isAllowedWebhookUrl(url)
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}
