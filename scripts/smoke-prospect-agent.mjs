#!/usr/bin/env node

const studioUrl = trimSlash(process.env.PROSPECT_STUDIO_URL ?? 'http://127.0.0.1:3000')
const publicCodes = new Set([200, 201, 204, 301, 302, 401, 403, 405])

function trimSlash(value) {
  return value.replace(/\/+$/, '')
}

function fail(message, detail) {
  process.stderr.write(`not ok ${message}${detail ? `: ${detail}` : ''}\n`)
  process.exitCode = 1
}

async function probe(url, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      ...init,
    })
    return {
      ok: publicCodes.has(res.status),
      status: res.status,
      latencyMs: Date.now() - start,
      url,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      url,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

const page = await probe(`${studioUrl}/studio/prospects`)
const listApi = await probe(`${studioUrl}/api/studio/prospects`)
const runApi = await probe(`${studioUrl}/api/studio/prospects/run`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'smoke test prospect run' }),
})

if (!page.ok) fail('prospect studio surface', `status=${page.status} url=${page.url}`)
if (!listApi.ok) fail('prospect api surface', `status=${listApi.status} url=${listApi.url}`)
if (!runApi.ok) fail('prospect run surface', `status=${runApi.status} url=${runApi.url}`)

process.stdout.write(
  [
    `ok prospect studio surface (${page.status})`,
    `ok prospect api surface (${listApi.status})`,
    `ok prospect run surface (${runApi.status})`,
  ].join('\n') + '\n'
)
