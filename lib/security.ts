function getTrustedHosts(): Set<string> {
  const raw = process.env.TRUSTED_PRIVATE_HOSTS ?? ''
  return new Set(
    raw.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  )
}

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false

    if (getTrustedHosts().has(hostname.toLowerCase())) return true

    const SSRF_BLOCKED = /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[::ffff:|fc00:|fd[0-9a-f]{2}:|0x)/i
    if (SSRF_BLOCKED.test(hostname)) return false
    if (/^\d+$/.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedOllamaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false

    if (getTrustedHosts().has(hostname.toLowerCase())) return true

    const SSRF_BLOCKED = /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[::ffff:|fc00:|fd[0-9a-f]{2}:|0x)/i
    if (SSRF_BLOCKED.test(hostname)) return false
    if (/^\d+$/.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

export { isValidEmail } from './validation'
