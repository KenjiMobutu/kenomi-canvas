import { readFileSync } from 'node:fs'

const checks = [
  {
    id: 'agents-runs-source',
    file: 'app/studio/agents/page.tsx',
    patterns: [/\.from\('agent_runs'\)/, /source agent_runs/],
  },
  {
    id: 'agents-autonomy-source',
    file: 'app/api/studio/autonomy/jobs/route.ts',
    patterns: [/\.from\('autonomy_jobs'\)/, /\.from\('autonomy_actions'\)/, /\.from\('human_approvals'\)/],
  },
  {
    id: 'analytics-venture-events-source',
    file: 'app/studio/analytics/page.tsx',
    patterns: [/\/api\/studio\/analytics\/ventures/, /source venture_events/],
  },
  {
    id: 'analytics-llm-cost-source',
    file: 'app/studio/analytics/page.tsx',
    patterns: [/\/api\/studio\/analytics\/llm-cost/, /Coût LLM/],
  },
  {
    id: 'analytics-manual-kpi-source',
    file: 'app/studio/analytics/page.tsx',
    patterns: [/source kpi_snapshots/, /valeurs manuelles legacy/],
  },
  {
    id: 'automations-runs-source',
    file: 'app/studio/automations/page.tsx',
    patterns: [/\.from\('automation_runs'\)/, /source automation_runs/],
  },
  {
    id: 'marketing-drafts-source',
    file: 'app/studio/marketing/page.tsx',
    patterns: [/\/api\/studio\/marketing\/drafts/, /source campaign_drafts/, /human_approvals/],
  },
  {
    id: 'ventures-landing-source',
    file: 'app/studio/ventures/page.tsx',
    patterns: [/\.from\('landing_pages'\)/, /repairAction/],
  },
]

const forbiddenPatterns = [
  {
    id: 'ambiguous-agents-runs',
    file: 'app/studio/agents/page.tsx',
    pattern: /runs reels · dernier run · latence/,
    message: 'agents run summary must use the explicit "runs réels" copy',
  },
  {
    id: 'marketing-legacy-source-copy',
    file: 'app/studio/marketing/page.tsx',
    pattern: /Drafts & Approvals depuis venture_pipeline/,
    message: 'marketing drafts must not claim venture_pipeline as the source',
  },
]

const failures = []

for (const check of checks) {
  const source = readFileSync(check.file, 'utf8')
  for (const pattern of check.patterns) {
    if (!pattern.test(source)) {
      failures.push(`${check.file}: ${check.id} missing ${pattern}`)
    }
  }
}

for (const rule of forbiddenPatterns) {
  const source = readFileSync(rule.file, 'utf8')
  if (rule.pattern.test(source)) {
    failures.push(`${rule.file}: ${rule.message}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('ok business data coherence')
