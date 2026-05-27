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

const runTag = Date.now().toString(36)
const prompt = [
  'Lance une mission Scout focalisée sur Reddit.',
  `Trace tag: ${runTag}`,
  'Niche prioritaire: recruiting operations for small businesses',
  'Cherche une opportunité vendable issue d’une douleur explicite sur Reddit.',
].join('\n')

const run = await request('/api/studio/agents/run', {
  method: 'POST',
  body: JSON.stringify({
    agentId: 'scout',
    prompt,
  }),
})

assert(run.response.status === 200, `scout run failed: ${run.response.status} ${run.text}`)
assert(run.json?.ok === true, `scout run did not return ok=true: ${run.text}`)
assert(typeof run.json?.parsedOutput?.title === 'string', `missing scout parsedOutput title: ${run.text}`)
process.stdout.write(`ok scout run ${run.json?.parsedOutput?.title}\n`)

const pipelineRes = await request('/api/studio/agents/pipeline')
assert(pipelineRes.response.status === 200, `pipeline fetch failed: ${pipelineRes.response.status} ${pipelineRes.text}`)
assert(pipelineRes.json?.pipeline?.idea_title, `missing pipeline in pipeline route: ${pipelineRes.text}`)
assert(pipelineRes.json?.scoutSignals?.status === 'live', `unexpected scout signal status: ${pipelineRes.text}`)
assert(Array.isArray(pipelineRes.json?.scoutSignals?.signals), `missing scout signals array: ${pipelineRes.text}`)
assert(pipelineRes.json.scoutSignals.signals.length > 0, `empty scout signals: ${pipelineRes.text}`)

const topSignal = pipelineRes.json.scoutSignals.signals[0]
assert(topSignal.sourceId === 'reddit', `expected reddit top signal, got ${topSignal.sourceId}`)
assert(typeof topSignal.url === 'string' && topSignal.url.includes('reddit.com'), `invalid reddit signal url: ${pipelineRes.text}`)
process.stdout.write(`ok scout signals ${pipelineRes.json.scoutSignals.signals.length} reddit=${topSignal.subreddit ?? 'n/a'}\n`)

process.stdout.write(`smoke scout reddit ok ${baseUrl}\n`)
