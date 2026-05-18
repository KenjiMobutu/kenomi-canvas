# Alignement Kenomi AI Venture Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Kenomi Canvas from a strong cockpit MVP to an architecture-aligned Kenomi AI Venture Studio: secure by default, tailnet-aware, agent-orchestrated, measurable, RGPD-ready, and closer to the preferred stack.

**Architecture:** Implement in guarded increments. First harden sensitive endpoints and move internal topology out of client code. Then align framework/UI dependencies, add autonomous agent orchestration primitives, add audit/RGPD surfaces, and finish with docs plus verification. Keep human approval gates for destructive or money-moving actions.

**Tech Stack:** Next.js App Router, TypeScript strict, Supabase/Postgres/RLS, Prisma, Ollama with Claude fallback, n8n webhooks, Docker/Coolify, Vitest.

---

## File Structure

**Security and internal access**

- Modify: `app/api/studio/services/health/route.ts` - require studio auth before returning service status.
- Modify: `app/api/studio/settings/secrets/route.ts` - use shared `requireAllowedUser` instead of raw Supabase auth.
- Modify: `lib/security.ts` - make private network access explicit allowlist driven.
- Modify: `lib/security.test.ts` - update SSRF expectations for private hosts.

**Infrastructure metadata**

- Create: `lib/infra-config.ts` - server-side source of truth for service metadata and sanitized client payloads.
- Create: `lib/infra-config.test.ts` - test internal URL redaction and env parsing.
- Create: `app/api/studio/infra/services/route.ts` - authenticated route returning sanitized service topology.
- Modify: `app/studio/infrastructure/page.tsx` - fetch sanitized topology instead of hardcoding IPs/domains client-side.

**Framework/UI alignment**

- Modify: `package.json` and `package-lock.json` - upgrade Next/React alignment and add required UI libs.
- Create or modify: `components/ui/*` - shadcn/ui primitives only when directly used.
- Modify: `eslint.config.mjs` and scripts if required by Next latest.

**Agent orchestration**

- Create: `supabase/migrations/20260518_agent_orchestration.sql` - schedules, tasks, events, approval gates.
- Create: `lib/agent-orchestration.ts` - pure orchestration decision logic.
- Create: `lib/agent-orchestration.test.ts` - tests for next run selection and human approval gates.
- Create: `app/api/studio/agents/orchestrate/route.ts` - authenticated/manual and cron-secret route that advances eligible agents.
- Modify: `app/api/studio/agents/run/route.ts` - accept optional orchestration context and log measurable run metadata.
- Modify: `app/studio/agents/page.tsx` - show schedules, blocked gates, and last autonomous run.

**Audit and RGPD**

- Create: `lib/audit-log.ts` - append-only structured audit event helper.
- Create: `lib/audit-log.test.ts` - verify event shape and redaction.
- Modify: `app/api/studio/agents/run/route.ts` and `app/api/studio/automations/trigger/route.ts` - record audit events.
- Create: `lib/privacy-export.ts` - collect user-owned data into a portable export object.
- Create: `lib/privacy-export.test.ts` - verify export shape and sensitive-field redaction.
- Create: `app/api/studio/privacy/export/route.ts` - authenticated export endpoint.
- Create: `app/api/studio/privacy/delete/route.ts` - authenticated deletion request endpoint with confirmation token.
- Modify: `app/studio/settings/page.tsx` - add Privacy/Data controls.

**Docs and verification**

- Modify: `README.md` - update architecture status, env vars, and deployment requirements.
- Create: `docs/security.md` - tailnet, public/private endpoints, secret handling, approval gates.
- Create: `docs/agents.md` - agent chain, schedules, metrics, escalation model.

---

## Phase 1: Security Hardening

### Task 1: Require Studio Auth for Service Health

**Files:**

- Modify: `app/api/studio/services/health/route.ts`

- [ ] **Step 1: Add authentication at the top of the GET handler**

Change the route to import `cookies` and `requireAllowedUser`, then gate the handler:

```ts
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'

export async function GET() {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  // existing health checks continue here
}
```

- [ ] **Step 2: Verify unauthenticated route shape manually**

Run the dev server:

```bash
npm run dev
```

Then request:

```bash
curl -i http://127.0.0.1:3000/api/studio/services/health
```

Expected: `401` JSON response when no valid Supabase session is present.

- [ ] **Step 3: Run verification**

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 4: Commit**

```bash
git add app/api/studio/services/health/route.ts
git commit -m "fix: protect studio service health endpoint"
```

### Task 2: Reuse Allowed-User Auth for Secret Status

**Files:**

- Modify: `app/api/studio/settings/secrets/route.ts`

- [ ] **Step 1: Replace raw auth with `requireAllowedUser`**

Replace the route body with this structure:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { requireAllowedUser } from '@/lib/auth-server'

export async function GET() {
  const cookieStore = await cookies()
  const { user, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('claude_api_key, openai_api_key, stripe_secret_key, stripe_webhook_secret')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    has_claude_key: !!data?.claude_api_key,
    has_openai_key: !!data?.openai_api_key,
    has_stripe_secret: !!data?.stripe_secret_key,
    has_stripe_webhook: !!data?.stripe_webhook_secret,
  })
}
```

- [ ] **Step 2: Run targeted validation**

```bash
npm run typecheck
npm test
```

Expected: both exit `0`.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/settings/secrets/route.ts
git commit -m "fix: enforce allowed user on secret status route"
```

### Task 3: Make Private Network Egress Explicit

**Files:**

- Modify: `lib/security.ts`
- Modify: `lib/security.test.ts`

- [ ] **Step 1: Write failing tests for explicit private host allowlist**

Replace the private-IP acceptance tests in `lib/security.test.ts` with:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { isAllowedWebhookUrl, isAllowedOllamaUrl, isValidEmail } from './security'

afterEach(() => {
  delete process.env.TRUSTED_PRIVATE_HOSTS
})

describe('isAllowedWebhookUrl', () => {
  it('rejette 192.168.x.x par défaut', () => {
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(false)
  })

  it('accepte un host privé explicitement autorisé', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.14,n8n.tailnet.ts.net'
    expect(isAllowedWebhookUrl('http://192.168.0.14:5678/webhook/test')).toBe(true)
    expect(isAllowedWebhookUrl('https://n8n.tailnet.ts.net/webhook/abc')).toBe(true)
  })

  it('accepte un domaine public https', () => {
    expect(isAllowedWebhookUrl('https://n8n.kenomi.eu/webhook/abc')).toBe(true)
  })

  it('rejette les métadonnées cloud 169.254.169.254', () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('rejette localhost et loopback', () => {
    expect(isAllowedWebhookUrl('http://localhost/admin')).toBe(false)
    expect(isAllowedWebhookUrl('http://127.0.0.1:8080/secret')).toBe(false)
    expect(isAllowedWebhookUrl('http://[::1]:3000/')).toBe(false)
  })

  it('rejette les plages privées non autorisées', () => {
    expect(isAllowedWebhookUrl('http://10.0.0.1/internal')).toBe(false)
    expect(isAllowedWebhookUrl('http://172.16.0.1/secret')).toBe(false)
    expect(isAllowedWebhookUrl('http://192.168.0.19:8000/api')).toBe(false)
  })
})

describe('isAllowedOllamaUrl', () => {
  it('rejette Ollama privé sans allowlist', () => {
    expect(isAllowedOllamaUrl('http://192.168.0.14:11434')).toBe(false)
  })

  it('accepte Ollama privé avec allowlist', () => {
    process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.14'
    expect(isAllowedOllamaUrl('http://192.168.0.14:11434')).toBe(true)
  })
})

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('kenji@kenomi.eu')).toBe(true)
  })

  it('rejette les emails invalides', () => {
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/security.test.ts
```

Expected: failures for `192.168.x.x` default behavior.

- [ ] **Step 3: Implement private range block with explicit allowlist**

Update the regex in both URL helpers:

```ts
const SSRF_BLOCKED =
  /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[::1\]|\[::ffff:|fc00:|fd[0-9a-f]{2}:|0x)/i
```

Keep the existing `getTrustedHosts().has(hostname.toLowerCase())` check before the blocklist.

- [ ] **Step 4: Run tests**

```bash
npm test -- lib/security.test.ts
npm test
```

Expected: security tests and full suite pass.

- [ ] **Step 5: Commit**

```bash
git add lib/security.ts lib/security.test.ts
git commit -m "fix: require explicit allowlist for private service egress"
```

---

## Phase 2: Internal Topology Redaction

### Task 4: Add Server-Side Infra Config

**Files:**

- Create: `lib/infra-config.ts`
- Create: `lib/infra-config.test.ts`

- [ ] **Step 1: Write tests**

Create `lib/infra-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getSanitizedInfraServices, parseInfraServices } from './infra-config'

describe('infra config', () => {
  it('redacts internal URLs from sanitized service metadata', () => {
    const services = parseInfraServices([
      {
        id: 'ollama',
        label: 'Ollama',
        endpoint: 'http://192.168.0.14:11434',
        role: 'LLM',
        healthKey: 'ollama',
      },
    ])

    expect(getSanitizedInfraServices(services)).toEqual([
      { id: 'ollama', label: 'Ollama', role: 'LLM', healthKey: 'ollama', endpointLabel: 'private' },
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
      },
    ])

    expect(getSanitizedInfraServices(services)[0].endpointLabel).toBe('n8n.kenomi.eu')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/infra-config.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `lib/infra-config.ts`**

```ts
export interface InfraServiceConfig {
  id: string
  label: string
  endpoint: string
  role: string
  healthKey: string | null
}

export interface SanitizedInfraService {
  id: string
  label: string
  role: string
  healthKey: string | null
  endpointLabel: string
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc00:|fd[0-9a-f]{2}:)/i

export function parseInfraServices(services: InfraServiceConfig[]): InfraServiceConfig[] {
  return services.map((service) => ({
    id: service.id,
    label: service.label,
    endpoint: service.endpoint,
    role: service.role,
    healthKey: service.healthKey,
  }))
}

function endpointLabel(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname
    return PRIVATE_HOST.test(host) ? 'private' : host
  } catch {
    return endpoint.includes('.local') ? 'private' : 'private'
  }
}

export function getSanitizedInfraServices(
  services = DEFAULT_INFRA_SERVICES
): SanitizedInfraService[] {
  return services.map((service) => ({
    id: service.id,
    label: service.label,
    role: service.role,
    healthKey: service.healthKey,
    endpointLabel: endpointLabel(service.endpoint),
  }))
}

export const DEFAULT_INFRA_SERVICES: InfraServiceConfig[] = parseInfraServices([
  {
    id: 'proxmox',
    label: 'Proxmox VE',
    endpoint: process.env.PROXMOX_BASE_URL ?? 'https://proxmox.tailnet.local:8006',
    role: 'Compute cluster',
    healthKey: null,
  },
  {
    id: 'coolify',
    label: 'Coolify',
    endpoint: process.env.COOLIFY_URL ?? 'https://coolify.tailnet.local',
    role: 'Deployments',
    healthKey: 'coolify',
  },
  {
    id: 'n8n',
    label: 'n8n',
    endpoint: process.env.N8N_BASE_URL ?? 'https://n8n.tailnet.local',
    role: 'Automation',
    healthKey: 'n8n',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.tailnet.local',
    role: 'Auth and database',
    healthKey: 'supabase',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    endpoint: process.env.OLLAMA_BASE_URL ?? 'http://ollama.tailnet.local:11434',
    role: 'Local inference',
    healthKey: 'ollama',
  },
])
```

- [ ] **Step 4: Run test**

```bash
npm test -- lib/infra-config.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/infra-config.ts lib/infra-config.test.ts
git commit -m "feat: add sanitized infrastructure config"
```

### Task 5: Expose Sanitized Infra Services via Authenticated API

**Files:**

- Create: `app/api/studio/infra/services/route.ts`
- Modify: `app/studio/infrastructure/page.tsx`

- [ ] **Step 1: Create route**

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { getSanitizedInfraServices } from '@/lib/infra-config'

export async function GET() {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  return NextResponse.json({ services: getSanitizedInfraServices() })
}
```

- [ ] **Step 2: Update infrastructure page types and load flow**

Add:

```ts
type SanitizedService = {
  id: string
  label: string
  role: string
  healthKey: keyof HealthServices | null
  endpointLabel: string
}
```

Replace hardcoded user-visible `endpoint` usage with `endpointLabel`. Keep graph coordinates client-side for layout only.

- [ ] **Step 3: Run verification**

```bash
npm run typecheck
npm run build
```

Expected: both exit `0`.

- [ ] **Step 4: Commit**

```bash
git add app/api/studio/infra/services/route.ts app/studio/infrastructure/page.tsx
git commit -m "feat: serve sanitized infrastructure topology"
```

---

## Phase 3: Preferred Stack Alignment

### Task 6: Upgrade Next and Align React Tooling

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `eslint.config.mjs` if required by the upgrade

- [ ] **Step 1: Create a dedicated branch or worktree**

```bash
git checkout -b codex/next-stack-alignment
```

- [ ] **Step 2: Upgrade packages**

Use the official path for latest Next:

```bash
npm install next@latest react@latest react-dom@latest eslint-config-next@latest
```

- [ ] **Step 3: Add preferred UI dependencies**

```bash
npm install framer-motion
npm install @radix-ui/react-slot
```

Only add shadcn component files when used; do not scaffold unused components.

- [ ] **Step 4: Run codemod if required**

If Next prints a required migration warning, run:

```bash
npx @next/codemod@canary upgrade latest
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

Expected: typecheck/tests/build exit `0`; lint has no new warnings beyond existing ones.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs
git commit -m "chore: align Next and React stack"
```

---

## Phase 4: Autonomous Agent Orchestration

### Task 7: Add Orchestration Schema

**Files:**

- Create: `supabase/migrations/20260518_agent_orchestration.sql`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE IF NOT EXISTS public.agent_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 1440 CHECK (interval_minutes >= 15),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  requires_human_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

ALTER TABLE public.agent_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_schedules_all_own" ON public.agent_schedules;
CREATE POLICY "agent_schedules_all_own" ON public.agent_schedules
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_events_select_own" ON public.agent_events;
CREATE POLICY "agent_events_select_own" ON public.agent_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent_events_insert_own" ON public.agent_events;
CREATE POLICY "agent_events_insert_own" ON public.agent_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_schedules_due_idx
  ON public.agent_schedules(user_id, enabled, next_run_at);

CREATE INDEX IF NOT EXISTS agent_events_user_created_idx
  ON public.agent_events(user_id, created_at DESC);
```

- [ ] **Step 2: Apply migration in Supabase**

Apply through the Supabase SQL editor or CLI, following the repo’s existing migration process.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260518_agent_orchestration.sql
git commit -m "feat: add agent orchestration tables"
```

### Task 8: Implement Pure Orchestration Logic

**Files:**

- Create: `lib/agent-orchestration.ts`
- Create: `lib/agent-orchestration.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { selectDueAgentRuns } from './agent-orchestration'

describe('selectDueAgentRuns', () => {
  it('returns enabled schedules due now', () => {
    const now = new Date('2026-05-18T10:00:00.000Z')
    const runs = selectDueAgentRuns(
      [
        {
          id: '1',
          agent_id: 'scout',
          enabled: true,
          next_run_at: '2026-05-18T09:59:00.000Z',
          requires_human_approval: false,
        },
        {
          id: '2',
          agent_id: 'builder',
          enabled: true,
          next_run_at: '2026-05-18T10:10:00.000Z',
          requires_human_approval: false,
        },
      ],
      now
    )

    expect(runs).toEqual([{ scheduleId: '1', agentId: 'scout', blockedByApproval: false }])
  })

  it('marks risky schedules as blocked by approval', () => {
    const now = new Date('2026-05-18T10:00:00.000Z')
    const runs = selectDueAgentRuns(
      [
        {
          id: '1',
          agent_id: 'payment',
          enabled: true,
          next_run_at: '2026-05-18T09:59:00.000Z',
          requires_human_approval: true,
        },
      ],
      now
    )

    expect(runs).toEqual([{ scheduleId: '1', agentId: 'payment', blockedByApproval: true }])
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npm test -- lib/agent-orchestration.test.ts
```

- [ ] **Step 3: Implement module**

```ts
export interface AgentScheduleLike {
  id: string
  agent_id: string
  enabled: boolean
  next_run_at: string
  requires_human_approval: boolean
}

export interface DueAgentRun {
  scheduleId: string
  agentId: string
  blockedByApproval: boolean
}

export function selectDueAgentRuns(
  schedules: AgentScheduleLike[],
  now = new Date()
): DueAgentRun[] {
  return schedules
    .filter((schedule) => schedule.enabled)
    .filter((schedule) => new Date(schedule.next_run_at).getTime() <= now.getTime())
    .map((schedule) => ({
      scheduleId: schedule.id,
      agentId: schedule.agent_id,
      blockedByApproval: schedule.requires_human_approval,
    }))
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- lib/agent-orchestration.test.ts
npm test
```

- [ ] **Step 5: Commit**

```bash
git add lib/agent-orchestration.ts lib/agent-orchestration.test.ts
git commit -m "feat: add agent orchestration planner"
```

### Task 9: Add Orchestration Route

**Files:**

- Create: `app/api/studio/agents/orchestrate/route.ts`
- Modify: `app/api/studio/agents/run/route.ts`

- [ ] **Step 1: Create route with dual auth**

Authenticated user requests use `requireAllowedUser`. Cron/n8n calls must send `Authorization: Bearer ${AGENT_ORCHESTRATOR_SECRET}`.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { selectDueAgentRuns } from '@/lib/agent-orchestration'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_ORCHESTRATOR_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  const cronAuthorized = isCronAuthorized(req)
  const cookieStore = await cookies()
  const { user, supabase, response } = cronAuthorized
    ? { user: null, supabase: null, response: null }
    : await requireAllowedUser(cookieStore)

  if (response) return response

  if (cronAuthorized) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Cron orchestration requires service-role implementation before enabling multi-user execution',
      },
      { status: 501 }
    )
  }

  const { data, error } = await supabase!
    .from('agent_schedules')
    .select('id, agent_id, enabled, next_run_at, requires_human_approval')
    .eq('user_id', user!.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = selectDueAgentRuns(data ?? [])
  return NextResponse.json({ ok: true, due })
}
```

This deliberately returns `501` for cron until service-role user scoping is explicitly designed. That preserves human-supervised autonomy.

- [ ] **Step 2: Verify route compiles**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/agents/orchestrate/route.ts
git commit -m "feat: add guarded agent orchestration route"
```

---

## Phase 5: Audit Logging and RGPD

### Task 10: Add Audit Event Helper

**Files:**

- Create: `lib/audit-log.ts`
- Create: `lib/audit-log.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import { sanitizeAuditMetadata } from './audit-log'

describe('sanitizeAuditMetadata', () => {
  it('redacts known sensitive fields', () => {
    expect(
      sanitizeAuditMetadata({
        api_key: 'sk-test',
        password: 'secret',
        safe: 'ok',
      })
    ).toEqual({
      api_key: '[redacted]',
      password: '[redacted]',
      safe: 'ok',
    })
  })
})
```

- [ ] **Step 2: Implement helper**

```ts
const SENSITIVE_KEY = /(secret|password|token|api[_-]?key|authorization)/i

export function sanitizeAuditMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : value,
    ])
  )
}

export async function insertAuditEvent(
  supabase: {
    from: (table: string) => {
      insert: (row: unknown) => Promise<{ error: { message: string } | null }>
    }
  },
  event: {
    user_id: string
    agent_id?: string | null
    event_type: string
    severity?: 'debug' | 'info' | 'warn' | 'error'
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('agent_events').insert({
    user_id: event.user_id,
    agent_id: event.agent_id ?? null,
    event_type: event.event_type,
    severity: event.severity ?? 'info',
    metadata: sanitizeAuditMetadata(event.metadata ?? {}),
  })

  if (error) console.error('[audit-log]', error.message)
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- lib/audit-log.test.ts
npm test
```

- [ ] **Step 4: Commit**

```bash
git add lib/audit-log.ts lib/audit-log.test.ts
git commit -m "feat: add structured audit logging helper"
```

### Task 11: Log Agent and Automation Actions

**Files:**

- Modify: `app/api/studio/agents/run/route.ts`
- Modify: `app/api/studio/automations/trigger/route.ts`

- [ ] **Step 1: Add audit import**

```ts
import { insertAuditEvent } from '@/lib/audit-log'
```

- [ ] **Step 2: Log successful agent runs**

After `agent_runs` insert:

```ts
await insertAuditEvent(supabase, {
  user_id: user!.id,
  agent_id: agentId,
  event_type: 'agent.run.completed',
  metadata: {
    model: usedModel,
    duration_ms: durationMs,
    fallback_triggered: llmResult.fallback_triggered,
  },
})
```

- [ ] **Step 3: Log automation trigger result**

After run insert/update in automation trigger:

```ts
await insertAuditEvent(supabase, {
  user_id: user!.id,
  event_type: 'automation.trigger.completed',
  severity: status === 'success' ? 'info' : 'warn',
  metadata: {
    workflow_id: id,
    status,
    http_status: httpStatus,
    duration_ms: durationMs,
  },
})
```

- [ ] **Step 4: Run verification**

```bash
npm run typecheck
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/agents/run/route.ts app/api/studio/automations/trigger/route.ts
git commit -m "feat: log agent and automation audit events"
```

### Task 12: Add Privacy Export Foundation

**Files:**

- Create: `lib/privacy-export.ts`
- Create: `lib/privacy-export.test.ts`
- Create: `app/api/studio/privacy/export/route.ts`

- [ ] **Step 1: Write export-shape test**

```ts
import { describe, expect, it } from 'vitest'
import { redactPrivacyExport } from './privacy-export'

describe('redactPrivacyExport', () => {
  it('removes stored secret values while preserving presence flags', () => {
    const result = redactPrivacyExport({
      settings: {
        openai_api_key: 'sk-test',
        claude_api_key: null,
      },
    })

    expect(result).toEqual({
      settings: {
        has_openai_api_key: true,
        has_claude_api_key: false,
      },
    })
  })
})
```

- [ ] **Step 2: Implement redaction helper**

```ts
export function redactPrivacyExport(input: {
  settings?: {
    openai_api_key?: string | null
    claude_api_key?: string | null
    stripe_secret_key?: string | null
    stripe_webhook_secret?: string | null
  } | null
}): Record<string, unknown> {
  return {
    ...input,
    settings: {
      has_openai_api_key: !!input.settings?.openai_api_key,
      has_claude_api_key: !!input.settings?.claude_api_key,
      has_stripe_secret_key: !!input.settings?.stripe_secret_key,
      has_stripe_webhook_secret: !!input.settings?.stripe_webhook_secret,
    },
  }
}
```

- [ ] **Step 3: Create export route**

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { redactPrivacyExport } from '@/lib/privacy-export'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [settings, ventures, conversations, documents, agentRuns] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', user!.id).maybeSingle(),
    supabase.from('ventures').select('*').eq('user_id', user!.id),
    supabase.from('conversations').select('*').eq('user_id', user!.id),
    supabase.from('documents').select('*').eq('user_id', user!.id),
    supabase.from('agent_runs').select('*').eq('user_id', user!.id),
  ])

  return NextResponse.json(
    redactPrivacyExport({
      exported_at: new Date().toISOString(),
      user: { id: user!.id, email: user!.email },
      settings: settings.data,
      ventures: ventures.data ?? [],
      conversations: conversations.data ?? [],
      documents: documents.data ?? [],
      agent_runs: agentRuns.data ?? [],
    } as Parameters<typeof redactPrivacyExport>[0] & Record<string, unknown>)
  )
}
```

- [ ] **Step 4: Run verification**

```bash
npm run typecheck
npm test -- lib/privacy-export.test.ts
npm test
```

- [ ] **Step 5: Commit**

```bash
git add lib/privacy-export.ts lib/privacy-export.test.ts app/api/studio/privacy/export/route.ts
git commit -m "feat: add privacy export endpoint"
```

---

## Phase 6: Documentation and Production Readiness

### Task 13: Update Project Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/security.md`
- Create: `docs/agents.md`

- [ ] **Step 1: Update README status**

Add an “Architecture Status” section:

```md
## Architecture Status

Kenomi Canvas is the cockpit application for the Kenomi AI Venture Studio. It currently provides authenticated venture management, agent execution, n8n triggers, waitlist capture, infrastructure health, and local-first LLM routing.

Autonomous operation is intentionally human-supervised: risky actions such as payment changes, destructive infrastructure actions, and public launches require explicit approval.
```

- [ ] **Step 2: Add security doc**

Create `docs/security.md`:

```md
# Security Model

Kenomi Canvas assumes all admin and studio surfaces are private by default.

- `/studio/*` requires Supabase Auth and `ALLOWED_EMAIL`.
- `/dashboard/*` requires the dashboard HMAC cookie.
- Internal service egress to private hosts requires `TRUSTED_PRIVATE_HOSTS`.
- Public waitlist endpoints are rate-limited and input-validated.
- Secrets are never returned directly to the browser; only presence flags are exposed.
- Agent and automation actions are logged to `agent_events`.
```

- [ ] **Step 3: Add agents doc**

Create `docs/agents.md`:

```md
# Agent Architecture

The venture pipeline runs through:

1. Scout
2. Validation
3. Builder
4. Payment
5. Marketing
6. Decision

Agents may run manually from the studio. Autonomous schedules are represented by `agent_schedules`, but human approval gates remain mandatory for risky actions.

Each run records:

- agent id
- model/provider
- duration
- fallback status
- output
- audit event
```

- [ ] **Step 4: Run documentation-adjacent checks**

```bash
npm run typecheck
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/security.md docs/agents.md
git commit -m "docs: document security and agent architecture"
```

### Task 14: Final Verification

**Files:**

- No code changes expected.

- [ ] **Step 1: Run full verification**

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

Expected:

- `typecheck`: exit `0`
- `test`: all tests pass
- `build`: exit `0`
- `lint`: exit `0`; remaining warnings triaged or fixed

- [ ] **Step 2: Manual smoke tests**

Start:

```bash
npm run dev
```

Verify:

- `/login` loads.
- `/studio` redirects to login when logged out.
- `/api/studio/services/health` returns `401` when logged out.
- `/api/waitlist` still accepts valid waitlist posts.
- `/studio/infrastructure` does not render raw internal IPs.
- `/studio/agents` can still trigger Scout manually.

- [ ] **Step 3: Final commit if needed**

```bash
git status --short
git add <changed-files>
git commit -m "chore: finalize venture studio alignment"
```

---

## Self-Review

**Spec coverage**

- Discover SaaS opportunities: covered by existing Scout and Phase 4 orchestration.
- Generate MVPs automatically: partially covered by Builder output; full code generation remains a future subsystem.
- Deploy products: existing Coolify awareness; deployment automation remains future work.
- Test monetization: Payment agent and Stripe fields exist; real Stripe execution remains future work and must require human approval.
- Marketing content: existing Marketing page and Marketing agent; orchestration improves it.
- Autonomous agents: Phase 4 adds schedules and guarded orchestration.
- Profitability analysis: existing analytics/ventures; deeper profitability models remain future work.
- Zero Trust / local-first / privacy-first: Phase 1 and Phase 2 improve private access and leakage controls.
- RGPD: Phase 5 adds export foundation; deletion workflow still needs careful staged implementation after export.

**Known deferred work**

- Full autonomous MVP code generation.
- Coolify deployment creation API.
- Stripe product/price creation and checkout publishing.
- Long-term vector memory/RAG.
- Real multi-machine Tailscale ACL verification.

**No-placeholder scan**

- This plan avoids “TBD” implementation steps.
- Deferred items are explicitly listed as out-of-scope future subsystems.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-alignement-kenomi-ai-venture-studio.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
