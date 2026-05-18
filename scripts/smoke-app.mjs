const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

const checks = [
  {
    name: 'login page',
    path: '/login',
    method: 'GET',
    expect: (response) => response.status === 200,
  },
  {
    name: 'dashboard login page',
    path: '/dashboard/login',
    method: 'GET',
    expect: (response) => response.status === 200,
  },
  {
    name: 'studio agents protected page',
    path: '/studio/agents',
    method: 'GET',
    redirect: 'manual',
    expect: (response) => response.status === 307 || response.status === 308,
  },
  {
    name: 'autonomy jobs protected API',
    path: '/api/studio/autonomy/jobs',
    method: 'GET',
    expect: (response) => response.status === 401,
  },
  {
    name: 'events invalid payload',
    path: '/api/events',
    method: 'POST',
    body: {},
    expect: (response) => response.status === 400,
  },
  {
    name: 'waitlist invalid payload',
    path: '/api/waitlist',
    method: 'POST',
    body: {},
    expect: (response) => response.status === 400,
  },
  {
    name: 'health endpoint',
    path: '/api/health',
    method: 'GET',
    expect: async (response) => {
      if (response.status === 200) return true
      if (response.status !== 503) return false

      const payload = await response.json().catch(() => null)
      return payload?.status === 'degraded' && typeof payload?.checks === 'object'
    },
  },
]

async function runCheck(check) {
  const response = await fetch(new URL(check.path, baseUrl), {
    method: check.method,
    redirect: check.redirect ?? 'follow',
    headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
    body: check.body ? JSON.stringify(check.body) : undefined,
  })

  const ok = await check.expect(response)
  if (!ok) {
    throw new Error(`${check.name}: unexpected status ${response.status}`)
  }

  process.stdout.write(`ok ${check.name} (${response.status})\n`)
}

for (const check of checks) {
  await runCheck(check)
}

process.stdout.write(`smoke ok ${baseUrl}\n`)
