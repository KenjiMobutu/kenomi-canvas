const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const studioCookie = process.env.SMOKE_STUDIO_COOKIE

if (!studioCookie) {
  console.error('SMOKE_STUDIO_COOKIE is required')
  console.error('Example: export SMOKE_STUDIO_COOKIE="sb-supabase-auth-token=base64-..."')
  process.exit(1)
}

const headers = {
  Cookie: studioCookie,
  'Content-Type': 'application/json',
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...headers,
    },
  })

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { response, json, text }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const run = await request('/api/studio/agents/run', {
  method: 'POST',
  body: JSON.stringify({
    agentId: 'devops',
    prompt: 'Synthétise les diagnostics infra réels et les incidents récents sans proposer d action automatique.',
  }),
})

assert(run.response.status === 200, `devops run failed: ${run.response.status} ${run.text}`)
assert(run.json?.ok === true, `devops run did not return ok=true: ${run.text}`)
assert(run.json?.parsedOutput?.global_status, `missing devops parsedOutput: ${run.text}`)
process.stdout.write(`ok devops run ${run.json.parsedOutput.global_status}\n`)

const diagnosticsRes = await request('/api/studio/infra/diagnostics')
assert(
  diagnosticsRes.response.status === 200 || diagnosticsRes.response.status === 207,
  `infra diagnostics failed: ${diagnosticsRes.response.status} ${diagnosticsRes.text}`
)
assert(diagnosticsRes.json?.devopsSummary, `missing devopsSummary in diagnostics route: ${diagnosticsRes.text}`)
assert(
  typeof diagnosticsRes.json.devopsSummary.headline === 'string' &&
    diagnosticsRes.json.devopsSummary.headline.length > 0,
  `missing devopsSummary headline: ${diagnosticsRes.text}`
)
assert(Array.isArray(diagnosticsRes.json?.recentIncidents), `missing recentIncidents: ${diagnosticsRes.text}`)
assert(diagnosticsRes.json?.deploymentParity, `missing deploymentParity: ${diagnosticsRes.text}`)
process.stdout.write(
  `ok diagnostics summary ${diagnosticsRes.json.devopsSummary.status} incidents=${diagnosticsRes.json.recentIncidents.length}\n`
)

const historyRes = await request('/api/studio/infra/diagnostics/history')
assert(
  historyRes.response.status === 200,
  `infra diagnostics history failed: ${historyRes.response.status} ${historyRes.text}`
)
assert(Array.isArray(historyRes.json?.incidents), `missing incidents in history route: ${historyRes.text}`)
process.stdout.write(`ok history incidents ${historyRes.json.incidents.length}\n`)

process.stdout.write(`smoke devops diagnostics ok ${baseUrl}\n`)
