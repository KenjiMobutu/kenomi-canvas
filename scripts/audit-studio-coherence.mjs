import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function collectFiles(dir, extensions) {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return collectFiles(path, extensions)
    return extensions.some((extension) => path.endsWith(extension)) ? [path] : []
  })
}

const files = [...collectFiles('app/studio', ['.tsx']), ...collectFiles('lib', ['.ts'])]

const forbiddenPatterns = [
  { pattern: /\+\{Math\.round\([^}]+\)\} runs/, label: 'computed fake run badge' },
  { pattern: /M3 avg 38%/, label: 'fake cohort average' },
  { pattern: /ATTRIBUTION MRR · 30J[\s\S]*14%/, label: 'equal fake attribution percent' },
]

const failures = []

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(source)) {
      failures.push(`${file}: ${rule.label}`)
    }
  }
}

const studioUtils = readFileSync('lib/studio-utils.ts', 'utf8')
if (/\blevel:\s*\d+/.test(studioUtils)) {
  failures.push('lib/studio-utils.ts: static agent levels in AGENTS_DATA')
}
if (/\bxp:\s*0?\.\d+/.test(studioUtils)) {
  failures.push('lib/studio-utils.ts: static agent xp in AGENTS_DATA')
}
const agentsPage = readFileSync('app/studio/agents/page.tsx', 'utf8')
if (/agent\.xp\b/.test(agentsPage)) {
  failures.push('app/studio/agents/page.tsx: legacy static xp usage')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('ok studio coherence')
