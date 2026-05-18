# Finalisation Alignement Kenomi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the functional gaps found after comparing the app to the Kenomi AI Venture Studio alignment plan: make privacy export reliable, wire sanitized infra topology into the UI, make orchestration materially useful, finish Next 16 migration, and reduce production-readiness warnings.

**Architecture:** Keep the existing security hardening and newly added modules. Add small pure helpers where route behavior needs tests, then wire those helpers into authenticated routes and UI pages. Avoid broad refactors; each task must preserve the currently passing `typecheck`, `test`, and `build` state.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase/Postgres/RLS, Prisma-generated client where already used, Vitest, React 19, Tailwind CSS v4.

---

## Current Baseline

The audit found:

- `typecheck`, `test`, and `build` pass.
- `lint` exits `0` but reports 55 warnings.
- Phase 1 security work is mostly complete.
- Phase 2 infra redaction exists server-side but `app/studio/infrastructure/page.tsx` still uses static `SERVICES_IN`.
- Phase 4 orchestration exists as a due-run preview, but does not update schedules or execute eligible non-blocked work.
- Phase 5 privacy export exists but selects `conversations.topic`, while the schema uses `conversations.title`.
- Next 16 build warns that `middleware.ts` should migrate to `proxy.ts`.

---

## File Structure

**Privacy and RGPD**

- Modify: `lib/privacy-export.ts` - add typed export rows and normalize Supabase query results.
- Modify: `lib/privacy-export.test.ts` - cover conversation `title`, message inclusion, and query error reporting.
- Modify: `app/api/studio/privacy/export/route.ts` - select real columns, include more user-owned tables, and return query errors safely.
- Modify: `app/api/studio/privacy/delete/route.ts` - add final audit attempt before deletion and return per-table deletion failures.

**Infrastructure topology**

- Modify: `lib/infra-config.ts` - add stable client metadata fields needed by the UI: `short`, `color`, `vmid`, `kind`.
- Modify: `lib/infra-config.test.ts` - verify private endpoint redaction while preserving UI metadata.
- Modify: `app/api/studio/infra/services/route.ts` - return enriched sanitized services.
- Modify: `app/studio/infrastructure/page.tsx` - fetch `/api/studio/infra/services` and stop hardcoding user-visible service metadata.

**Agent orchestration**

- Modify: `lib/agent-orchestration.ts` - add `computeNextRunAt()` and `partitionDueRuns()`.
- Modify: `lib/agent-orchestration.test.ts` - cover schedule advancement and approval gating.
- Modify: `app/api/studio/agents/orchestrate/route.ts` - update due schedules, record audit events, and return actionable execution plan.
- Modify: `app/studio/agents/page.tsx` - display schedules, blocked approvals, and last autonomous candidate run.

**Next 16 migration**

- Create: `proxy.ts` - replacement for `middleware.ts`.
- Delete: `middleware.ts` only after `proxy.ts` proves equivalent.
- Test: manual auth redirect smoke tests.

**Production warning cleanup**

- Modify: `app/api/studio/agents/pipeline/route.ts` - remove unused import.
- Modify: `app/studio/analytics/page.tsx` - remove render-time mutation.
- Modify: `app/studio/infrastructure/page.tsx` - remove unused imports introduced by older UI.
- Modify: `lib/supabase.ts` - replace `any[]` landing page cast with typed shape.

---

## Phase 1: Fix Privacy Export Correctness

### Task 1: Normalize Privacy Export Data

**Files:**

- Modify: `lib/privacy-export.ts`
- Modify: `lib/privacy-export.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `lib/privacy-export.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { redactPrivacyExport, collectPrivacyQueryErrors } from './privacy-export'

describe('redactPrivacyExport', () => {
  it('remplace les valeurs de secrets par des flags de présence', () => {
    const result = redactPrivacyExport({
      settings: {
        openai_api_key: 'sk-test',
        claude_api_key: null,
        stripe_secret_key: 'sk_live_xxx',
        stripe_webhook_secret: null,
      },
      conversations: [
        { id: 'c1', title: 'Nouvelle conversation', created_at: '2026-05-18T00:00:00.000Z' },
      ],
      messages: [
        {
          id: 'm1',
          conversation_id: 'c1',
          role: 'user',
          content: 'hello',
          created_at: '2026-05-18T00:00:01.000Z',
        },
      ],
    })

    expect(result.settings).toEqual({
      has_openai_api_key: true,
      has_claude_api_key: false,
      has_stripe_secret_key: true,
      has_stripe_webhook_secret: false,
    })
    expect(result.conversations).toEqual([
      { id: 'c1', title: 'Nouvelle conversation', created_at: '2026-05-18T00:00:00.000Z' },
    ])
    expect(result.messages).toEqual([
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'hello',
        created_at: '2026-05-18T00:00:01.000Z',
      },
    ])
  })

  it('préserve les champs non-settings', () => {
    const result = redactPrivacyExport({
      settings: null,
      user: { id: 'abc', email: 'test@test.com' },
    })

    expect(result.user).toEqual({ id: 'abc', email: 'test@test.com' })
    expect(result.settings).toEqual({
      has_openai_api_key: false,
      has_claude_api_key: false,
      has_stripe_secret_key: false,
      has_stripe_webhook_secret: false,
    })
  })
})

describe('collectPrivacyQueryErrors', () => {
  it('retourne les erreurs Supabase par section sans exposer de secrets', () => {
    const errors = collectPrivacyQueryErrors({
      ventures: { error: null },
      conversations: { error: { message: 'column topic does not exist' } },
      messages: { error: { message: 'permission denied for table messages' } },
    })

    expect(errors).toEqual([
      { section: 'conversations', message: 'column topic does not exist' },
      { section: 'messages', message: 'permission denied for table messages' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails if helper is missing**

Run:

```bash
npm test -- lib/privacy-export.test.ts
```

Expected before implementation: failure mentioning `collectPrivacyQueryErrors` is not exported.

- [ ] **Step 3: Implement helper**

Update `lib/privacy-export.ts`:

```ts
export interface PrivacyExportInput {
  settings?: {
    openai_api_key?: string | null
    claude_api_key?: string | null
    stripe_secret_key?: string | null
    stripe_webhook_secret?: string | null
  } | null
  [key: string]: unknown
}

export interface PrivacyQueryResultLike {
  error: { message: string } | null
}

export interface PrivacyQueryError {
  section: string
  message: string
}

export function redactPrivacyExport(input: PrivacyExportInput): Record<string, unknown> {
  const { settings, ...rest } = input
  return {
    ...rest,
    settings: {
      has_openai_api_key: !!settings?.openai_api_key,
      has_claude_api_key: !!settings?.claude_api_key,
      has_stripe_secret_key: !!settings?.stripe_secret_key,
      has_stripe_webhook_secret: !!settings?.stripe_webhook_secret,
    },
  }
}

export function collectPrivacyQueryErrors(
  results: Record<string, PrivacyQueryResultLike>
): PrivacyQueryError[] {
  return Object.entries(results)
    .filter((entry): entry is [string, { error: { message: string } }] => entry[1].error !== null)
    .map(([section, result]) => ({
      section,
      message: result.error.message,
    }))
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- lib/privacy-export.test.ts
```

Expected: all privacy export tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/privacy-export.ts lib/privacy-export.test.ts
git commit -m "fix: validate privacy export redaction and errors"
```

### Task 2: Fix Privacy Export Route

**Files:**

- Modify: `app/api/studio/privacy/export/route.ts`

- [ ] **Step 1: Replace incorrect `topic` select with real schema fields**

Change the route to:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { collectPrivacyQueryErrors, redactPrivacyExport } from '@/lib/privacy-export'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const results = {
    settings: await supabase
      .from('user_settings')
      .select(
        'openai_api_key, claude_api_key, stripe_secret_key, stripe_webhook_secret, ollama_base_url, ollama_model, n8n_base_url, created_at, updated_at'
      )
      .eq('user_id', user!.id)
      .maybeSingle(),
    ventures: await supabase
      .from('ventures')
      .select(
        'id, name, niche, stage, score, mrr, cac, conversion, next_action, insight, created_at'
      )
      .eq('user_id', user!.id),
    conversations: await supabase
      .from('conversations')
      .select('id, title, agent_id, created_at, updated_at')
      .eq('user_id', user!.id),
    messages: await supabase
      .from('messages')
      .select('id, conversation_id, role, content, created_at')
      .eq('user_id', user!.id),
    documents: await supabase
      .from('documents')
      .select('id, name, mime_type, size_bytes, created_at')
      .eq('user_id', user!.id),
    automations: await supabase
      .from('automation_workflows')
      .select('id, name, type, enabled, run_count, last_run_at, created_at')
      .eq('user_id', user!.id),
    automation_runs: await supabase
      .from('automation_runs')
      .select('id, workflow_id, status, http_status, duration_ms, triggered_at')
      .eq('user_id', user!.id),
    agent_runs: await supabase
      .from('agent_runs')
      .select('id, agent_id, model, duration_ms, created_at')
      .eq('user_id', user!.id),
    agent_events: await supabase
      .from('agent_events')
      .select('id, agent_id, event_type, severity, metadata, created_at')
      .eq('user_id', user!.id),
  }

  const errors = collectPrivacyQueryErrors(results)

  return NextResponse.json(
    redactPrivacyExport({
      exported_at: new Date().toISOString(),
      user: { id: user!.id, email: user!.email },
      export_errors: errors,
      settings: results.settings.data,
      ventures: results.ventures.data ?? [],
      conversations: results.conversations.data ?? [],
      messages: results.messages.data ?? [],
      documents: results.documents.data ?? [],
      automations: results.automations.data ?? [],
      automation_runs: results.automation_runs.data ?? [],
      agent_runs: results.agent_runs.data ?? [],
      agent_events: results.agent_events.data ?? [],
    })
  )
}
```

- [ ] **Step 2: Run verification**

Run:

```bash
npm run typecheck
npm test -- lib/privacy-export.test.ts
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/privacy/export/route.ts
git commit -m "fix: export real privacy data fields"
```

### Task 3: Make Privacy Delete Auditable

**Files:**

- Modify: `app/api/studio/privacy/delete/route.ts`

- [ ] **Step 1: Add audit logging before deletion starts**

Import:

```ts
import { insertAuditEvent } from '@/lib/audit-log'
```

Before creating the admin client in `DELETE`, add:

```ts
await insertAuditEvent(supabase, {
  user_id: user!.id,
  event_type: 'privacy.delete.confirmed',
  severity: 'warn',
  metadata: {
    requested_at: settings.deletion_requested_at,
  },
})
```

- [ ] **Step 2: Track per-table failures**

Replace the deletion loop:

```ts
const deleteFailures: { table: string; message: string }[] = []

for (const table of USER_TABLES) {
  const { error } = await adminClient.from(table).delete().eq('user_id', user!.id)
  if (error) deleteFailures.push({ table, message: error.message })
}

if (deleteFailures.length > 0) {
  return apiError(`Suppression incomplète: ${deleteFailures.map((f) => f.table).join(', ')}`, 500)
}
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit**

```bash
git add app/api/studio/privacy/delete/route.ts
git commit -m "fix: audit and validate privacy deletion"
```

---

## Phase 2: Wire Sanitized Infrastructure Topology

### Task 4: Enrich Sanitized Infra Config

**Files:**

- Modify: `lib/infra-config.ts`
- Modify: `lib/infra-config.test.ts`

- [ ] **Step 1: Extend tests**

Update `lib/infra-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getSanitizedInfraServices, parseInfraServices } from './infra-config'

describe('infra config', () => {
  it('redacts internal URLs while preserving UI metadata', () => {
    const services = parseInfraServices([
      {
        id: 'ollama',
        label: 'Ollama',
        endpoint: 'http://192.168.0.14:11434',
        role: 'LLM',
        healthKey: 'ollama',
        short: 'OLL',
        color: '#fb923c',
        vmid: null,
        kind: 'external',
      },
    ])

    expect(getSanitizedInfraServices(services)).toEqual([
      {
        id: 'ollama',
        label: 'Ollama',
        role: 'LLM',
        healthKey: 'ollama',
        endpointLabel: 'private',
        short: 'OLL',
        color: '#fb923c',
        vmid: null,
        kind: 'external',
      },
    ])
  })

  it('keeps public host labels without protocol or path', () => {
    const services = parseInfraServices([
      {
        id: 'n8n',
        label: 'n8n',
        endpoint: 'https://n8n.kenomi.eu/healthz',
        role: 'Automation',
        healthKey: 'n8n',
        short: 'N8N',
        color: '#e879f9',
        vmid: null,
        kind: 'service',
      },
    ])

    expect(getSanitizedInfraServices(services)[0].endpointLabel).toBe('n8n.kenomi.eu')
  })
})
```

- [ ] **Step 2: Implement metadata fields**

Update interfaces in `lib/infra-config.ts`:

```ts
export interface InfraServiceConfig {
  id: string
  label: string
  endpoint: string
  role: string
  healthKey: string | null
  short: string
  color: string
  vmid: number | null
  kind: 'host' | 'service' | 'edge' | 'external'
}

export interface SanitizedInfraService {
  id: string
  label: string
  role: string
  healthKey: string | null
  endpointLabel: string
  short: string
  color: string
  vmid: number | null
  kind: 'host' | 'service' | 'edge' | 'external'
}
```

Update `parseInfraServices()` and `getSanitizedInfraServices()` to copy the new fields.

- [ ] **Step 3: Update defaults**

Use this default list:

```ts
export const DEFAULT_INFRA_SERVICES: InfraServiceConfig[] = parseInfraServices([
  {
    id: 'proxmox',
    label: 'Proxmox VE',
    endpoint: process.env.PROXMOX_BASE_URL ?? 'https://192.168.0.1:8006',
    role: 'Compute cluster',
    healthKey: null,
    short: 'PROX',
    color: '#34d399',
    vmid: null,
    kind: 'host',
  },
  {
    id: 'coolify',
    label: 'Coolify',
    endpoint: process.env.COOLIFY_URL ?? 'http://192.168.0.19:8000',
    role: 'Deployments',
    healthKey: 'coolify',
    short: 'COOL',
    color: '#34d399',
    vmid: 102,
    kind: 'service',
  },
  {
    id: 'nginx',
    label: 'Nginx PM',
    endpoint: process.env.NGINX_PM_URL ?? 'https://npm.tailnet.local',
    role: 'Proxy and SSL',
    healthKey: null,
    short: 'NPM',
    color: '#22d3ee',
    vmid: 101,
    kind: 'edge',
  },
  {
    id: 'uptime',
    label: 'Uptime Kuma',
    endpoint: process.env.UPTIME_KUMA_URL ?? 'https://uptime.tailnet.local',
    role: 'Monitoring',
    healthKey: null,
    short: 'UPT',
    color: '#a78bfa',
    vmid: null,
    kind: 'service',
  },
  {
    id: 'vault',
    label: 'Vaultwarden',
    endpoint: process.env.VAULTWARDEN_URL ?? 'https://vault.tailnet.local',
    role: 'Secrets and credentials',
    healthKey: null,
    short: 'VLT',
    color: '#fbbf24',
    vmid: 100,
    kind: 'service',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.kenomi.eu',
    role: 'Auth and database',
    healthKey: 'supabase',
    short: 'SUP',
    color: '#34d399',
    vmid: null,
    kind: 'external',
  },
  {
    id: 'n8n',
    label: 'n8n',
    endpoint: process.env.N8N_BASE_URL ?? 'https://n8n.kenomi.eu',
    role: 'Automation',
    healthKey: 'n8n',
    short: 'N8N',
    color: '#e879f9',
    vmid: null,
    kind: 'service',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    endpoint: process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434',
    role: 'Local inference',
    healthKey: 'ollama',
    short: 'OLL',
    color: '#fb923c',
    vmid: null,
    kind: 'external',
  },
])
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- lib/infra-config.test.ts
```

Expected: all infra config tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/infra-config.ts lib/infra-config.test.ts
git commit -m "feat: enrich sanitized infra metadata"
```

### Task 5: Replace Static Infra UI Services with API Data

**Files:**

- Modify: `app/studio/infrastructure/page.tsx`

- [ ] **Step 1: Add client service type**

At the top of the file, replace the static `SERVICES_IN` constant with:

```ts
type InfraService = {
  id: string
  label: string
  role: string
  healthKey: keyof HealthServices | null
  endpointLabel: string
  short: string
  color: string
  vmid: number | null
  kind: 'host' | 'service' | 'edge' | 'external'
}

const FALLBACK_SERVICES: InfraService[] = [
  {
    id: 'proxmox',
    label: 'Proxmox VE',
    short: 'PROX',
    color: '#34d399',
    role: 'Compute cluster',
    endpointLabel: 'private',
    healthKey: null,
    vmid: null,
    kind: 'host',
  },
  {
    id: 'coolify',
    label: 'Coolify',
    short: 'COOL',
    color: '#34d399',
    role: 'Deployments',
    endpointLabel: 'private',
    healthKey: 'coolify',
    vmid: 102,
    kind: 'service',
  },
  {
    id: 'n8n',
    label: 'n8n',
    short: 'N8N',
    color: '#e879f9',
    role: 'Automation',
    endpointLabel: 'private',
    healthKey: 'n8n',
    vmid: null,
    kind: 'service',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    short: 'SUP',
    color: '#34d399',
    role: 'Auth and database',
    endpointLabel: 'supabase',
    healthKey: 'supabase',
    vmid: null,
    kind: 'external',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    short: 'OLL',
    color: '#fb923c',
    role: 'Local inference',
    endpointLabel: 'private',
    healthKey: 'ollama',
    vmid: null,
    kind: 'external',
  },
]
```

- [ ] **Step 2: Add services state and loader**

Inside `InfrastructurePage()`:

```ts
const [services, setServices] = useState<InfraService[]>(FALLBACK_SERVICES)
```

Inside the existing `useEffect`, add:

```ts
async function loadServices() {
  try {
    const res = await fetch('/api/studio/infra/services')
    if (!res.ok) return
    const data = (await res.json()) as { services?: InfraService[] }
    if (!cancelled && data.services?.length) setServices(data.services)
  } catch {
    if (!cancelled) setServices(FALLBACK_SERVICES)
  }
}

loadServices()
```

- [ ] **Step 3: Replace all `SERVICES_IN` references**

Replace:

```ts
SERVICES_IN
```

with:

```ts
services
```

inside `InfrastructurePage()` and child props. For top-level helper components that currently close over `SERVICES_IN`, pass `services` as a prop:

```ts
function TopologyGraph({
  selectedId,
  onSelect,
  health,
  services,
}: {
  selectedId: string
  onSelect: (id: string) => void
  health: HealthData | null
  services: InfraService[]
}) {
  // use services.find(...) and services.filter(...)
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands exit `0`, and no raw `192.168` string remains in `app/studio/infrastructure/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/studio/infrastructure/page.tsx
git commit -m "feat: load sanitized infra topology in UI"
```

---

## Phase 3: Make Orchestration Operationally Useful

### Task 6: Add Schedule Advancement Logic

**Files:**

- Modify: `lib/agent-orchestration.ts`
- Modify: `lib/agent-orchestration.test.ts`

- [ ] **Step 1: Add tests**

Append to `lib/agent-orchestration.test.ts`:

```ts
import { computeNextRunAt, partitionDueRuns } from './agent-orchestration'

describe('computeNextRunAt', () => {
  it('ajoute interval_minutes à partir de now', () => {
    expect(computeNextRunAt(new Date('2026-05-18T10:00:00.000Z'), 30)).toBe(
      '2026-05-18T10:30:00.000Z'
    )
  })
})

describe('partitionDueRuns', () => {
  it('sépare les runs exécutables des runs bloqués par approbation', () => {
    const partition = partitionDueRuns([
      { scheduleId: '1', agentId: 'scout', blockedByApproval: false },
      { scheduleId: '2', agentId: 'payment', blockedByApproval: true },
    ])

    expect(partition.executable).toEqual([
      { scheduleId: '1', agentId: 'scout', blockedByApproval: false },
    ])
    expect(partition.blocked).toEqual([
      { scheduleId: '2', agentId: 'payment', blockedByApproval: true },
    ])
  })
})
```

- [ ] **Step 2: Implement helpers**

Add to `lib/agent-orchestration.ts`:

```ts
export function computeNextRunAt(now: Date, intervalMinutes: number): string {
  return new Date(now.getTime() + intervalMinutes * 60_000).toISOString()
}

export function partitionDueRuns(runs: DueAgentRun[]): {
  executable: DueAgentRun[]
  blocked: DueAgentRun[]
} {
  return {
    executable: runs.filter((run) => !run.blockedByApproval),
    blocked: runs.filter((run) => run.blockedByApproval),
  }
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- lib/agent-orchestration.test.ts
```

Expected: all orchestration tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/agent-orchestration.ts lib/agent-orchestration.test.ts
git commit -m "feat: add agent schedule advancement logic"
```

### Task 7: Advance Due Schedules and Log Orchestration

**Files:**

- Modify: `app/api/studio/agents/orchestrate/route.ts`

- [ ] **Step 1: Update route imports**

```ts
import { computeNextRunAt, partitionDueRuns, selectDueAgentRuns } from '@/lib/agent-orchestration'
import { insertAuditEvent } from '@/lib/audit-log'
```

- [ ] **Step 2: Select interval metadata**

Change the Supabase select:

```ts
.select('id, agent_id, enabled, next_run_at, interval_minutes, requires_human_approval')
```

- [ ] **Step 3: Advance executable schedules**

After `const due = selectDueAgentRuns(data ?? [])`, add:

```ts
const now = new Date()
const partition = partitionDueRuns(due)
const updates = await Promise.all(
  partition.executable.map((run) => {
    const schedule = (data ?? []).find((item) => item.id === run.scheduleId)
    const intervalMinutes = schedule?.interval_minutes ?? 1440
    return supabase
      .from('agent_schedules')
      .update({
        last_run_at: now.toISOString(),
        next_run_at: computeNextRunAt(now, intervalMinutes),
        updated_at: now.toISOString(),
      })
      .eq('id', run.scheduleId)
      .eq('user_id', user!.id)
  })
)

const updateErrors = updates
  .map((result, index) => ({ result, run: partition.executable[index] }))
  .filter((item) => item.result.error)
  .map((item) => ({
    scheduleId: item.run.scheduleId,
    agentId: item.run.agentId,
    message: item.result.error!.message,
  }))

await insertAuditEvent(supabase, {
  user_id: user!.id,
  event_type: 'agent.orchestration.evaluated',
  metadata: {
    due_count: due.length,
    executable_count: partition.executable.length,
    blocked_count: partition.blocked.length,
    update_error_count: updateErrors.length,
  },
})
```

- [ ] **Step 4: Return actionable payload**

Return:

```ts
return NextResponse.json({
  ok: updateErrors.length === 0,
  due,
  executable: partition.executable,
  blocked: partition.blocked,
  update_errors: updateErrors,
})
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add app/api/studio/agents/orchestrate/route.ts
git commit -m "feat: advance due agent schedules"
```

### Task 8: Show Orchestration Status in Agents UI

**Files:**

- Modify: `app/studio/agents/page.tsx`

- [ ] **Step 1: Add orchestration response type**

Near existing types:

```ts
interface OrchestrationStatus {
  due: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  executable: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  blocked: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  update_errors: { scheduleId: string; agentId: string; message: string }[]
}
```

- [ ] **Step 2: Fetch orchestration preview**

In `AgentsPage()`:

```ts
const [orchestration, setOrchestration] = useState<OrchestrationStatus | null>(null)

async function loadOrchestration() {
  const res = await fetch('/api/studio/agents/orchestrate', { method: 'POST' })
  if (!res.ok) return
  const data = (await res.json()) as OrchestrationStatus
  setOrchestration(data)
}
```

Call `loadOrchestration()` once when `user` is available, and after manual agent runs.

- [ ] **Step 3: Render compact status strip**

In the page header/actions area, render:

```tsx
{
  orchestration && (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <span className="ck-chip">DUE {orchestration.due.length}</span>
      <span className="ck-chip">READY {orchestration.executable.length}</span>
      <span className="ck-chip">GATED {orchestration.blocked.length}</span>
    </div>
  )
}
```

If `ck-chip` does not exist in this file, use the existing inline chip style already used in nearby header actions.

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add app/studio/agents/page.tsx
git commit -m "feat: show agent orchestration status"
```

---

## Phase 4: Finish Next 16 Proxy Migration

### Task 9: Rename Middleware to Proxy

**Files:**

- Create: `proxy.ts`
- Delete: `middleware.ts`

- [ ] **Step 1: Copy middleware logic to `proxy.ts`**

Create `proxy.ts` with the same imports and handler body as `middleware.ts`, but export `proxy`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // copy the existing middleware body here unchanged
}

export const config = {
  matcher: ['/', '/login', '/signup', '/dashboard/:path*', '/studio/:path*'],
}
```

- [ ] **Step 2: Remove `middleware.ts` after successful build**

Run:

```bash
npm run build
```

Expected: build exits `0` and the deprecation warning is gone.

Then delete `middleware.ts`.

- [ ] **Step 3: Smoke test redirects**

Run:

```bash
npm run dev
```

Manual checks:

- `/studio` redirects to `/login` when logged out.
- `/signup` redirects to `/login`.
- `/dashboard` redirects to `/dashboard/login` when dashboard cookie is absent.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts
git rm middleware.ts
git commit -m "chore: migrate middleware to Next proxy"
```

---

## Phase 5: Reduce High-Signal Warnings

### Task 10: Fix Cheap Lint Warnings

**Files:**

- Modify: `app/api/studio/agents/pipeline/route.ts`
- Modify: `app/studio/infrastructure/page.tsx`
- Modify: `lib/supabase.ts`

- [ ] **Step 1: Remove unused imports**

In `app/api/studio/agents/pipeline/route.ts`, remove `NextResponse` from:

```ts
import { NextRequest } from 'next/server'
```

In `app/studio/infrastructure/page.tsx`, remove unused imports reported by lint after Phase 2 wiring.

- [ ] **Step 2: Replace `any[]` cast in `lib/supabase.ts`**

Add:

```ts
interface VentureWithLandingPages {
  id: string
  nom: string
  slug: string
  type_produit: string
  landing_pages: { headline: string; copywriting: Copywriting }[] | null
}
```

Change:

```ts
const lp = (data.landing_pages as any[])?.[0]
```

to:

```ts
const typedData = data as VentureWithLandingPages
const lp = typedData.landing_pages?.[0]
```

Use `typedData` for returned venture fields.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: warning count decreases and no errors are introduced.

- [ ] **Step 4: Commit**

```bash
git add app/api/studio/agents/pipeline/route.ts app/studio/infrastructure/page.tsx lib/supabase.ts
git commit -m "chore: reduce lint warnings"
```

### Task 11: Fix Analytics Render Mutation

**Files:**

- Modify: `app/studio/analytics/page.tsx`

- [ ] **Step 1: Replace mutating accumulator**

Find the block around the lint warning where `acc += it.pct` happens during render. Replace the `map` logic with precomputed segments:

```ts
const segments = items.map((item, index) => {
  const start = items.slice(0, index).reduce((sum, previous) => sum + previous.pct, 0)
  return {
    item,
    offset: (start / total) * c,
    length: (item.pct / total) * c,
  }
})
```

Render with:

```tsx
{
  segments.map(({ item: it, offset: off, length: len }) => (
    <circle
      key={it.agent.id}
      cx="80"
      cy="80"
      r={r}
      fill="none"
      stroke={it.agent.color}
      strokeWidth="18"
      strokeDasharray={`${len} ${c - len}`}
      strokeDashoffset={-off}
      transform="rotate(-90 80 80)"
    />
  ))
}
```

- [ ] **Step 2: Run targeted checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: the `react-hooks/immutability` warning for `analytics/page.tsx` is gone.

- [ ] **Step 3: Commit**

```bash
git add app/studio/analytics/page.tsx
git commit -m "fix: avoid render mutation in analytics chart"
```

---

## Phase 6: Docs and Final Verification

### Task 12: Update Docs to Match Actual State

**Files:**

- Modify: `README.md`
- Modify: `docs/security.md`
- Modify: `docs/agents.md`

- [ ] **Step 1: Add architecture status to README**

Add:

```md
## Architecture Status

Kenomi Canvas is the cockpit application for the Kenomi AI Venture Studio. It provides authenticated venture management, agent execution, n8n triggers, waitlist capture, infrastructure health, privacy export/delete endpoints, and local-first LLM routing.

Autonomous operation is human-supervised. Schedules can be evaluated and advanced, while risky actions such as payment, public launch, destructive infrastructure operations, and account deletion require explicit approval.
```

- [ ] **Step 2: Update `docs/agents.md`**

Add:

```md
## Orchestration Status

`POST /api/studio/agents/orchestrate` evaluates enabled schedules in `agent_schedules`.

- Due schedules with `requires_human_approval=false` are advanced to their next run time.
- Due schedules with `requires_human_approval=true` are returned as gated.
- The route records an `agent.orchestration.evaluated` audit event.
- Direct autonomous execution of payment or deployment actions remains blocked by design.
```

- [ ] **Step 3: Update `docs/security.md`**

Add:

```md
## Privacy Controls

- `GET /api/studio/privacy/export` returns a redacted export of user-owned studio data.
- `POST /api/studio/privacy/delete` creates a short-lived deletion token.
- `DELETE /api/studio/privacy/delete` requires the token and deletes user-owned rows before deleting the Supabase auth user.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/security.md docs/agents.md
git commit -m "docs: align architecture docs with implementation"
```

### Task 13: Full Verification Gate

**Files:**

- No planned source edits.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

Expected:

- `typecheck` exits `0`.
- `test` exits `0`.
- `build` exits `0` with no `middleware` deprecation warning.
- `lint` exits `0`; warning count is lower than the current 55.

- [ ] **Step 2: Manual smoke tests**

Run:

```bash
npm run dev
```

Check:

- `/studio` redirects to `/login` logged out.
- `/api/studio/services/health` returns `401` logged out.
- `/studio/infrastructure` displays services without raw internal IPs.
- `/api/studio/privacy/export` returns `401` logged out.
- `/api/studio/agents/orchestrate` returns `401` logged out.

- [ ] **Step 3: Final status**

Run:

```bash
git status --short
```

Expected: only intentional plan or implementation files are modified.

---

## Self-Review

**Spec coverage**

- Privacy export mismatch: Task 1 and Task 2.
- Privacy delete safety: Task 3.
- Infra API not wired into UI: Task 4 and Task 5.
- Orchestration not operationally useful: Task 6, Task 7, Task 8.
- Next 16 middleware warning: Task 9.
- Production warning cleanup: Task 10 and Task 11.
- Documentation drift: Task 12.
- Verification: Task 13.

**Deferred on purpose**

- Fully autonomous execution of agents from cron remains out of scope until service-role multi-user scoping and approval policy are designed.
- Stripe product creation, Coolify deployments, and public launch automation remain explicitly gated future work.
- Complete cleanup of every React Compiler warning is not required for this pass; this plan removes high-signal and cheap warnings first.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-finalisation-alignement-kenomi.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
