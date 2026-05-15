// lib/security.ts

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    const SSRF_BLOCKED = /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|fc00:|fd[0-9a-f]{2}:)/i
    if (SSRF_BLOCKED.test(hostname)) return false
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
