import { existsSync, readFileSync } from 'node:fs'

const requiredFiles = [
  'lib/autonomy/run-agent-step.ts',
  'lib/autonomy/approval-executor.ts',
  'lib/venture-materializer.ts',
  'lib/public-landing-health.ts',
  'lib/public-landing-cta.ts',
  'lib/metrics/venture-metrics.ts',
  'lib/metrics/source-contract.ts',
  'lib/stripe/checkout-action.ts',
  'lib/stripe/webhook-handler.ts',
  'lib/marketing/publish-action.ts',
  'lib/deployments/deploy-action.ts',
  'app/api/studio/agents/orchestrate/route.ts',
  'app/api/studio/stripe/checkout/route.ts',
  'app/api/studio/deployments/route.ts',
  'app/api/studio/marketing/drafts/route.ts',
  'app/api/events/route.ts',
  'app/api/waitlist/route.ts',
  'supabase/migrations/20260519_vision_alignment_core.sql',
]

const requiredSignals = [
  ['lib/autonomy/run-agent-step.ts', 'materializeBuilderOutput'],
  ['lib/autonomy/run-agent-step.ts', 'campaign_drafts'],
  ['lib/autonomy/run-agent-step.ts', 'metrics_snapshot'],
  ['lib/autonomy/approval-executor.ts', 'stop_venture'],
  ['lib/autonomy/approval-executor.ts', 'publish_campaign'],
  ['lib/autonomy/approval-executor.ts', 'deploy'],
  ['lib/stripe/webhook-handler.ts', 'payment_succeeded'],
  ['lib/marketing/publish-action.ts', 'campaign_published'],
  ['lib/marketing/publish-action.ts', 'campaign_spend'],
  ['app/[slug]/page.tsx', 'selectPublicLandingCta'],
  ['app/studio/analytics/page.tsx', 'source venture_events'],
  ['app/studio/agents/page.tsx', 'source agent_runs'],
]

const failures = []

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`missing ${file}`)
}

for (const [file, signal] of requiredSignals) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`)
    continue
  }
  const source = readFileSync(file, 'utf8')
  if (!source.includes(signal)) failures.push(`${file}: missing signal "${signal}"`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('ok vision loop smoke')
