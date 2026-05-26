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

function latestProspect(prospects) {
  return Array.isArray(prospects) && prospects.length > 0 ? prospects[0] : null
}

const prompt = [
  'Lance un run Prospect concret et retourne un prospect exploitable.',
  'Entreprise prioritaire: Smoke Prospect Co',
  'Source prioritaire: linkedin',
  'Contact connu: Léa Martin',
  'Rôle: CEO',
  'Focus: prospect',
].join('\n')

const run = await request('/api/studio/prospects/run', {
  method: 'POST',
  body: JSON.stringify({ prompt, companyName: 'Smoke Prospect Co', source: 'linkedin', contactName: 'Léa Martin', contactRole: 'CEO', focus: 'prospect' }),
})

assert(run.response.status === 202, `prospect run failed: ${run.response.status} ${run.text}`)
process.stdout.write(`ok queued prospect run (${run.json?.jobId ?? 'no-job-id'})\n`)

const jobs = await request('/api/studio/autonomy/jobs?agent_id=prospect')
assert(jobs.response.status === 200, `jobs fetch failed: ${jobs.response.status} ${jobs.text}`)
process.stdout.write(`ok jobs endpoint (${Array.isArray(jobs.json?.jobs) ? jobs.json.jobs.length : 0} jobs)\n`)

const prospectsBefore = await request('/api/studio/prospects')
assert(
  prospectsBefore.response.status === 200 || prospectsBefore.response.status === 207,
  `prospects fetch failed: ${prospectsBefore.response.status} ${prospectsBefore.text}`
)

const prospect = latestProspect(prospectsBefore.json?.prospects)
assert(prospect, 'no prospect visible in /api/studio/prospects')
process.stdout.write(`ok found prospect ${prospect.id}\n`)

if (prospect.approval_status === 'awaiting_approval' && prospect.outreach_approval_id) {
  const approval = await request('/api/studio/autonomy/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ approvalId: prospect.outreach_approval_id, decision: 'approved' }),
  })
  assert(approval.response.status === 200, `approval failed: ${approval.response.status} ${approval.text}`)
  process.stdout.write(`ok approved outreach ${prospect.outreach_approval_id}\n`)
}

const prospectsAfterApproval = await request('/api/studio/prospects')
assert(
  prospectsAfterApproval.response.status === 200 || prospectsAfterApproval.response.status === 207,
  `prospects after approval failed: ${prospectsAfterApproval.response.status} ${prospectsAfterApproval.text}`
)
const approvedProspect = latestProspect(prospectsAfterApproval.json?.prospects)
assert(approvedProspect, 'prospect missing after approval refresh')
assert(
  approvedProspect.pipeline_status === 'draft_created' || approvedProspect.pipeline_status === 'approved_to_send',
  `unexpected pipeline status after approval: ${approvedProspect.pipeline_status}`
)
process.stdout.write(`ok pipeline after approval = ${approvedProspect.pipeline_status}\n`)

if (approvedProspect.pipeline_status === 'draft_created') {
  const markedSent = await request('/api/studio/prospects', {
    method: 'PATCH',
    body: JSON.stringify({ id: approvedProspect.id, status: 'sent' }),
  })
  assert(markedSent.response.status === 200, `mark sent failed: ${markedSent.response.status} ${markedSent.text}`)
  process.stdout.write(`ok marked sent ${approvedProspect.id}\n`)
}

const prospectsFinal = await request('/api/studio/prospects')
assert(
  prospectsFinal.response.status === 200 || prospectsFinal.response.status === 207,
  `final prospects fetch failed: ${prospectsFinal.response.status} ${prospectsFinal.text}`
)
const finalProspect = latestProspect(prospectsFinal.json?.prospects)
assert(finalProspect, 'prospect missing in final fetch')
assert(
  ['draft_created', 'sent', 'replied', 'won', 'lost'].includes(finalProspect.pipeline_status),
  `unexpected final pipeline status: ${finalProspect.pipeline_status}`
)

process.stdout.write(`smoke prospect outbound ok ${baseUrl} · final=${finalProspect.pipeline_status}\n`)
