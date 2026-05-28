const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const studioCookie = process.env.SMOKE_STUDIO_COOKIE
const workerSecret = process.env.AUTONOMY_WORKER_SECRET

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

async function refreshProspects() {
  const result = await request('/api/studio/prospects/refresh', {
    method: 'POST',
  })
  assert(
    result.response.status === 200,
    `prospect refresh failed: ${result.response.status} ${result.text}`
  )
  return result.json
}

async function triggerWorker(limit = 1) {
  if (!workerSecret) return null

  const response = await fetch(new URL('/api/internal/autonomy/worker/drain', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-autonomy-worker-token': workerSecret,
    },
    body: JSON.stringify({
      worker_id: 'smoke:prospect',
      limit,
      allowed_job_kinds: ['run_agent'],
    }),
  })

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!response.ok) {
    throw new Error(`worker trigger failed: ${response.status} ${text}`)
  }

  return json
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findProspectByCompany(prospects, companyName) {
  if (!Array.isArray(prospects)) return null
  return prospects.find((prospect) => prospect?.company_name === companyName) ?? null
}

function findJobById(jobs, jobId) {
  if (!Array.isArray(jobs)) return null
  return jobs.find((job) => job?.id === jobId) ?? null
}

async function waitForJob(jobId, label, timeoutMs = 45000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (workerSecret) {
      await triggerWorker(10)
    }

    const result = await request('/api/studio/autonomy/jobs?agent_id=prospect')
    assert(
      result.response.status === 200 || result.response.status === 207,
      `${label}: jobs fetch failed ${result.response.status} ${result.text}`
    )

    const job = findJobById(result.json?.jobs, jobId)
    if (job && job.status !== 'queued' && job.status !== 'running') {
      return job
    }

    await sleep(1500)
  }

  throw new Error(`${label}: timed out waiting for job ${jobId}`)
}

async function waitForProspect(companyName, predicate, label, timeoutMs = 45000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (workerSecret) {
      await triggerWorker(10)
    }

    await refreshProspects()

    const result = await request('/api/studio/prospects')
    assert(
      result.response.status === 200 || result.response.status === 207,
      `${label}: prospects fetch failed ${result.response.status} ${result.text}`
    )

    const prospect = findProspectByCompany(result.json?.prospects, companyName)
    if (prospect && predicate(prospect)) {
      return prospect
    }

    await sleep(1500)
  }

  throw new Error(`${label}: timed out waiting for prospect ${companyName}`)
}

async function fetchConversions() {
  const result = await request('/api/studio/revenue/conversions')
  assert(
    result.response.status === 200,
    `revenue conversions failed: ${result.response.status} ${result.text}`
  )
  return result.json?.conversions
}

async function fetchInsights() {
  const result = await request('/api/studio/revenue/insights')
  assert(
    result.response.status === 200,
    `revenue insights failed: ${result.response.status} ${result.text}`
  )
  return result.json
}

const runTag = Date.now().toString(36)
const companyName = `Smoke Prospect Co ${runTag}`
const prompt = [
  'Lance un run Prospect concret et retourne un prospect exploitable.',
  `Entreprise prioritaire: ${companyName}`,
  'Source prioritaire: linkedin',
  'Contact connu: Léa Martin',
  'Rôle: CEO',
  'Focus: prospect',
].join('\n')

const run = await request('/api/studio/prospects/run', {
  method: 'POST',
  body: JSON.stringify({
    prompt,
    companyName,
    source: 'linkedin',
    contactName: 'Léa Martin',
    contactRole: 'CEO',
    focus: 'prospect',
  }),
})

assert(run.response.status === 202, `prospect run failed: ${run.response.status} ${run.text}`)
const jobId = run.json?.jobId
assert(typeof jobId === 'string' && jobId.length > 0, `missing job id in run response: ${run.text}`)
process.stdout.write(`ok queued prospect run (${jobId})\n`)

const jobs = await request('/api/studio/autonomy/jobs?agent_id=prospect')
assert(jobs.response.status === 200, `jobs fetch failed: ${jobs.response.status} ${jobs.text}`)
process.stdout.write(
  `ok jobs endpoint (${Array.isArray(jobs.json?.jobs) ? jobs.json.jobs.length : 0} jobs)\n`
)

if (workerSecret) {
  const worker = await triggerWorker(10)
  process.stdout.write(
    `ok worker trigger (${Array.isArray(worker?.processed) ? worker.processed.length : 0} jobs processed)\n`
  )
}

const completedJob = await waitForJob(jobId, 'prospect job')
assert(
  completedJob.status === 'completed',
  `prospect job did not complete successfully: ${completedJob.status} ${completedJob.last_error ?? ''}`
)
process.stdout.write(`ok job completed ${jobId}\n`)

const prospect = await waitForProspect(
  companyName,
  (candidate) => Boolean(candidate.id),
  'initial prospect'
)
assert(prospect, 'no prospect visible in /api/studio/prospects')
process.stdout.write(`ok found prospect ${prospect.id}\n`)

if (prospect.approval_status === 'awaiting_approval' && prospect.outreach_approval_id) {
  const approval = await request('/api/studio/autonomy/jobs', {
    method: 'PATCH',
    body: JSON.stringify({ approvalId: prospect.outreach_approval_id, decision: 'approved' }),
  })
  assert(
    approval.response.status === 200,
    `approval failed: ${approval.response.status} ${approval.text}`
  )
  process.stdout.write(`ok approved outreach ${prospect.outreach_approval_id}\n`)
}

const approvedProspect = await waitForProspect(
  companyName,
  (candidate) =>
    candidate.pipeline_status === 'draft_created' ||
    candidate.pipeline_status === 'approved_to_send' ||
    candidate.approval_status === 'awaiting_approval',
  'prospect after approval'
)
assert(approvedProspect, 'prospect missing after approval refresh')
assert(
  approvedProspect.pipeline_status === 'draft_created' ||
    approvedProspect.pipeline_status === 'approved_to_send',
  `unexpected pipeline status after approval: ${approvedProspect.pipeline_status}`
)
process.stdout.write(`ok pipeline after approval = ${approvedProspect.pipeline_status}\n`)

if (approvedProspect.pipeline_status === 'draft_created') {
  const markedSent = await request('/api/studio/prospects', {
    method: 'PATCH',
    body: JSON.stringify({ id: approvedProspect.id, status: 'sent' }),
  })
  assert(
    markedSent.response.status === 200,
    `mark sent failed: ${markedSent.response.status} ${markedSent.text}`
  )
  process.stdout.write(`ok marked sent ${approvedProspect.id}\n`)
}

const finalProspect = await waitForProspect(
  companyName,
  (candidate) =>
    ['draft_created', 'sent', 'replied', 'won', 'lost'].includes(candidate.pipeline_status),
  'final prospect'
)
assert(finalProspect, 'prospect missing in final fetch')
assert(
  ['draft_created', 'sent', 'replied', 'won', 'lost'].includes(finalProspect.pipeline_status),
  `unexpected final pipeline status: ${finalProspect.pipeline_status}`
)
assert(
  Boolean(finalProspect.offer_id) ||
    (typeof finalProspect.offer_variant === 'string' && finalProspect.offer_variant.length > 0),
  'prospect missing offer truth'
)
process.stdout.write(`ok offer truth ${finalProspect.offer_id ?? finalProspect.offer_variant}\n`)

const crmPatch = await request('/api/studio/prospects', {
  method: 'PATCH',
  body: JSON.stringify({
    id: finalProspect.id,
    operator_notes: `Smoke note ${runTag}`,
    next_action: 'Review reply inbox',
    tags: ['smoke', 'phase2'],
  }),
})
assert(
  crmPatch.response.status === 200,
  `crm patch failed: ${crmPatch.response.status} ${crmPatch.text}`
)
process.stdout.write(`ok crm patch ${finalProspect.id}\n`)

const crmUpdatedProspect = await waitForProspect(
  companyName,
  (candidate) =>
    typeof candidate.operator_notes === 'string' &&
    candidate.operator_notes.includes(runTag) &&
    candidate.next_action === 'Review reply inbox' &&
    Array.isArray(candidate.tags) &&
    candidate.tags.includes('smoke') &&
    candidate.tags.includes('phase2'),
  'crm updated prospect'
)
assert(crmUpdatedProspect, 'prospect missing after crm patch')

const forceFollowUpDue = await request('/api/studio/prospects', {
  method: 'PATCH',
  body: JSON.stringify({
    id: crmUpdatedProspect.id,
    next_followup_at: '2026-05-01T00:00:00.000Z',
  }),
})
assert(
  forceFollowUpDue.response.status === 200,
  `force follow-up due failed: ${forceFollowUpDue.response.status} ${forceFollowUpDue.text}`
)
process.stdout.write(`ok forced follow-up due ${crmUpdatedProspect.id}\n`)

const firstFollowUp = await waitForProspect(
  companyName,
  (candidate) =>
    candidate.approval_status === 'awaiting_approval' &&
    candidate.last_outreach_kind === 'follow_up_1',
  'first follow-up'
)
assert(firstFollowUp?.outreach_approval_id, 'missing first follow-up approval id')
process.stdout.write(`ok generated first follow-up ${firstFollowUp.outreach_approval_id}\n`)

const followUpApproval = await request('/api/studio/autonomy/jobs', {
  method: 'PATCH',
  body: JSON.stringify({ approvalId: firstFollowUp.outreach_approval_id, decision: 'approved' }),
})
assert(
  followUpApproval.response.status === 200,
  `follow-up approval failed: ${followUpApproval.response.status} ${followUpApproval.text}`
)
process.stdout.write(`ok approved first follow-up ${firstFollowUp.outreach_approval_id}\n`)

const followUpDraft = await waitForProspect(
  companyName,
  (candidate) =>
    candidate.pipeline_status === 'draft_created' && candidate.last_outreach_kind === 'follow_up_1',
  'follow-up draft'
)
assert(followUpDraft, 'follow-up draft missing after approval')

const markFollowUpSent = await request('/api/studio/prospects', {
  method: 'PATCH',
  body: JSON.stringify({ id: followUpDraft.id, status: 'sent' }),
})
assert(
  markFollowUpSent.response.status === 200,
  `mark first follow-up sent failed: ${markFollowUpSent.response.status} ${markFollowUpSent.text}`
)
process.stdout.write(`ok marked first follow-up sent ${followUpDraft.id}\n`)

const sequencedProspect = await waitForProspect(
  companyName,
  (candidate) => candidate.follow_up_count === 1 && candidate.pipeline_status === 'sent',
  'sequenced prospect'
)
assert(sequencedProspect.next_followup_at, 'missing next follow-up date after first follow-up send')

const repliedTruth = await request('/api/studio/prospects', {
  method: 'PATCH',
  body: JSON.stringify({
    id: sequencedProspect.id,
    status: 'replied',
    conversationEventType: 'soft_interest',
    conversationNotes: `Smoke reply ${runTag}`,
  }),
})
assert(
  repliedTruth.response.status === 200,
  `mark replied failed: ${repliedTruth.response.status} ${repliedTruth.text}`
)
process.stdout.write(`ok marked replied ${sequencedProspect.id}\n`)

const wonTruth = await request('/api/studio/prospects', {
  method: 'PATCH',
  body: JSON.stringify({
    id: sequencedProspect.id,
    status: 'won',
    conversationEventType: 'closed_won',
    conversationNotes: `Smoke win ${runTag}`,
  }),
})
assert(
  wonTruth.response.status === 200,
  `mark won failed: ${wonTruth.response.status} ${wonTruth.text}`
)
process.stdout.write(`ok marked won ${sequencedProspect.id}\n`)

const truthProspect = await waitForProspect(
  companyName,
  (candidate) =>
    candidate.pipeline_status === 'won' &&
    candidate.latest_conversation_event_type === 'closed_won' &&
    typeof candidate.latest_conversation_notes === 'string' &&
    candidate.latest_conversation_notes.includes(runTag),
  'conversation truth prospect'
)
assert(
  truthProspect.latest_conversation_event_type === 'closed_won',
  'missing latest conversation truth on prospect'
)
process.stdout.write(`ok conversation truth latest=${truthProspect.latest_conversation_event_type}\n`)

const conversions = await fetchConversions()
assert(
  conversions?.bestOffer || (Array.isArray(conversions?.offerBreakdown) && conversions.offerBreakdown.length > 0),
  'missing offer metrics in conversions'
)
assert(
  Array.isArray(conversions?.segmentOfferBreakdown) && conversions.segmentOfferBreakdown.length > 0,
  'missing segment metrics in conversions'
)
process.stdout.write(
  `ok revenue conversions offers=${Array.isArray(conversions?.offerBreakdown) ? conversions.offerBreakdown.length : 0} segments=${Array.isArray(conversions?.segmentOfferBreakdown) ? conversions.segmentOfferBreakdown.length : 0}\n`
)

const insights = await fetchInsights()
assert(insights?.insights?.bestOffer?.title, 'missing weekly best offer insight')
assert(insights?.insights?.nextExperiment?.title, 'missing weekly next experiment insight')
process.stdout.write(`ok weekly insights ${insights.insights.window?.label ?? 'present'}\n`)

process.stdout.write(
  `smoke prospect outbound ok ${baseUrl} · final=${truthProspect.pipeline_status} · fu=${truthProspect.follow_up_count}\n`
)
