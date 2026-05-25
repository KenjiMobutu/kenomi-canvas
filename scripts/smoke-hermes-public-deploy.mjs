#!/usr/bin/env node

const publicUrl = trimSlash(process.env.HERMES_PUBLIC_URL ?? 'https://hermes.kenomi.eu')
const ollamaBaseUrl = trimSlash(process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434')

const PUBLIC_CODES = new Set([200, 201, 204, 301, 302, 401, 403, 405])
const HEALTH_CODES = new Set([200, 201, 204, 301, 302, 401, 403, 404, 405])

function trimSlash(value) {
  return value.replace(/\/+$/, '')
}

function fail(message, detail) {
  process.stderr.write(`not ok ${message}${detail ? `: ${detail}` : ''}\n`)
  process.exitCode = 1
}

async function probe(url, timeoutMs = 10_000, allowedCodes = HEALTH_CODES) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    return {
      ok: allowedCodes.has(res.status),
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

const publicPage = await probe(publicUrl, 10_000, PUBLIC_CODES)
const publicHealth = await probe(`${publicUrl}/healthz`)
const privateOllama = await probe(`${ollamaBaseUrl}/api/tags`)
const publicOllama = await probe(`${publicUrl}/api/tags`)

if (!publicPage.ok) {
  fail('hermes public entrypoint', `status=${publicPage.status} url=${publicPage.url}`)
}

if (!publicHealth.ok) {
  fail('hermes public health', `status=${publicHealth.status} url=${publicHealth.url}`)
}

if (!privateOllama.ok) {
  fail('private ollama endpoint', `status=${privateOllama.status} url=${privateOllama.url}`)
}

if (publicOllama.status === 200) {
  fail('public ollama exposure', `ollama reachable through public hermes url ${publicOllama.url}`)
}

process.stdout.write(
  [
    `ok hermes public entrypoint (${publicPage.status})`,
    `ok hermes health (${publicHealth.status})`,
    `ok private ollama (${privateOllama.status})`,
    `ok ollama not publicly exposed (${publicOllama.status})`,
  ].join('\n') + '\n'
)
