// lib/dashboard-token.ts
// Web Crypto API — compatible Edge Runtime ET Node.js

async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getDayWindow(): number {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24))
}

export async function createDashToken(): Promise<string> {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) throw new Error('DASHBOARD_PASSWORD is not set')
  const secret  = process.env.DASHBOARD_TOKEN_SECRET ?? password
  const payload = `${password}:${getDayWindow()}`
  return hmacHex(secret, payload)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

export async function verifyDashToken(token: string): Promise<boolean> {
  if (!token || token.length !== 64) return false
  try {
    const expected = await createDashToken()
    return constantTimeEqual(token, expected)
  } catch {
    return false
  }
}
