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

export async function createDashToken(): Promise<string> {
  const secret  = process.env.DASHBOARD_TOKEN_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'dev-fallback'
  const payload = process.env.DASHBOARD_PASSWORD ?? ''
  return hmacHex(secret, payload)
}

export async function verifyDashToken(token: string): Promise<boolean> {
  if (!token || token.length !== 64) return false
  const expected = await createDashToken()
  return token === expected
}
