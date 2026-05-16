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

function getSecret(): string {
  const secret = process.env.DASHBOARD_TOKEN_SECRET
  if (!secret) throw new Error('DASHBOARD_TOKEN_SECRET est requis')
  return secret
}

async function generateToken(dateKey: string, secret: string): Promise<string> {
  const payload = `${dateKey}`
  return hmacHex(secret, payload)
}

export async function createDashToken(): Promise<string> {
  const secret = getSecret()
  const dateKey = new Date().toISOString().slice(0, 10)
  return generateToken(dateKey, secret)
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
    const secret = getSecret()
    const dateKey = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const validToday = await generateToken(dateKey, secret)
    const validYesterday = await generateToken(yesterday, secret)
    return constantTimeEqual(token, validToday) || constantTimeEqual(token, validYesterday)
  } catch {
    return false
  }
}
