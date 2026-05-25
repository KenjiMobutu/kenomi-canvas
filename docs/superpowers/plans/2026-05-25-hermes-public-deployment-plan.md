# Hermes Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** expose Hermes Agent through the Coolify reverse proxy for browser access while keeping Ollama and model inference private on the Mac Mini M4, and make the Studio, diagnostics, and runbooks reflect that live topology.

**Architecture:** VM-Coolify is the public-facing application layer: reverse proxy, Hermes Agent UI, n8n, and OpenWebUI. The Mac Mini M4 is the private inference layer: Ollama and model weights only. The Next.js Studio remains the operator control plane, consuming sanitized service config, health URLs, and diagnostics from server-side settings; workers stay isolated.

**Tech Stack:** Next.js App Router, Supabase JS, TypeScript, Vitest, Coolify, Ollama, Tailscale, Node smoke scripts.

---

### Task 1: Extend the infra config, health contract, and security allowlists

**Files:**
- Modify: `lib/infra-config.ts`
- Modify: `lib/infra-diagnostics-runner.ts`
- Modify: `app/api/studio/services/health/route.ts`
- Modify: `lib/infra-diagnostics.ts`
- Modify: `lib/security.ts`
- Test: `lib/infra-config.test.ts`
- Test: `lib/infra-diagnostics.test.ts`
- Test: `lib/security.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for the new live topology:

```ts
it('resolves Hermes Agent and Mac Mini inference endpoints from settings and env', () => {
  const urls = resolveHealthServiceUrls(
    {
      hermes_agent_url: 'https://hermes.kenomi.eu',
      ollama_base_url: 'http://192.168.0.14:11434',
      n8n_base_url: '',
      supabase_url: 'https://supabase.local',
      coolify_url: 'https://coolify.local',
    },
    {
      HERMES_AGENT_URL: 'https://hermes.env',
      OLLAMA_BASE_URL: 'http://ollama.env:11434',
    }
  )

  expect(urls).toEqual({
    hermesAgent: 'https://hermes.kenomi.eu/healthz',
    ollama: 'http://192.168.0.14:11434/api/tags',
    n8n: 'https://n8n.kenomi.eu/healthz',
    supabase: 'https://supabase.local/rest/v1/',
    coolify: 'https://coolify.local/api/v1/version',
  })
})
```

Add a diagnostics test that proves Hermes Agent becomes a first-class service line:

```ts
const diagnostics = buildInfraDiagnostics({
  checkedAt: '2026-05-25T10:00:00.000Z',
  runtime: { environment: 'production', sourceCommit: 'abc1234', commitShort: 'abc1234' },
  services: [
    {
      id: 'hermesAgent',
      label: 'Hermes Agent',
      url: 'https://hermes.kenomi.eu/healthz',
      source: 'settings',
      ok: true,
      latencyMs: 21,
    },
    {
      id: 'ollama',
      label: 'Ollama',
      url: 'http://192.168.0.14:11434/api/tags',
      source: 'settings',
      ok: true,
      latencyMs: 18,
    },
  ],
  proxmox: {
    ok: true,
    url: 'https://192.168.0.10:8006/api2/json/nodes/proxmox/status',
    source: 'settings',
    latencyMs: 33,
    vmCount: 4,
    nodeCount: 1,
  },
})

expect(diagnostics.summary).toEqual({ ok: true, status: 'ok', statusCode: 200 })
expect(diagnostics.services).toHaveLength(2)
expect(diagnostics.services[0]).toMatchObject({
  id: 'hermesAgent',
  label: 'Hermes Agent',
  status: 'ok',
})
```

Add allowlist tests that explicitly separate public Hermes traffic from private inference traffic:

```ts
it('allows the public Hermes reverse proxy and the private Ollama host when explicitly trusted', () => {
  process.env.TRUSTED_PRIVATE_HOSTS = '192.168.0.14,hermes.kenomi.eu'

  expect(isAllowedWebhookUrl('https://hermes.kenomi.eu/api/health')).toBe(true)
  expect(isAllowedOllamaUrl('http://192.168.0.14:11434/api/tags')).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail first**

Run:

```bash
npm test -- --run lib/infra-config.test.ts lib/infra-diagnostics.test.ts lib/security.test.ts
```

Expected: failures for missing `hermesAgent` plumbing and/or health URLs.

- [ ] **Step 3: Implement the minimal config and health plumbing**

Add a server-side endpoint contract for Hermes and the Mac Mini:

```ts
export interface UserInfraSettings {
  hermes_agent_url?: string | null
  ollama_base_url?: string | null
  n8n_base_url?: string | null
  supabase_url?: string | null
  coolify_url?: string | null
}

export interface HealthServiceUrls {
  hermesAgent: string
  ollama: string
  n8n: string
  supabase: string
  coolify: string
}
```

In `app/api/studio/services/health/route.ts`, ping both the public Hermes endpoint and the private Ollama endpoint, and include both in the response:

```ts
const [hermesAgent, ollama, n8n, supabaseHealth, coolify] = await Promise.all([
  pingService(urls.hermesAgent),
  pingService(urls.ollama),
  pingService(urls.n8n),
  pingService(urls.supabase),
  pingService(urls.coolify),
])
```

In `lib/infra-diagnostics.ts`, add a specific repair action for Hermes Agent:

```ts
if (id === 'hermesAgent') return 'Verifier le reverse proxy Coolify, l auth et le backend Ollama'
```

Keep `Ollama` private and only reachable through the trusted host allowlist.

- [ ] **Step 4: Run the tests again**

Run:

```bash
npm test -- --run lib/infra-config.test.ts lib/infra-diagnostics.test.ts lib/security.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/infra-config.ts lib/infra-diagnostics-runner.ts app/api/studio/services/health/route.ts lib/infra-diagnostics.ts lib/security.ts lib/infra-config.test.ts lib/infra-diagnostics.test.ts lib/security.test.ts
git commit -m "feat: add Hermes deployment health contract"
```

### Task 2: Update the Studio surfaces to match the live Coolify + Mac Mini layout

**Files:**
- Modify: `app/studio/infrastructure/page.tsx`
- Modify: `app/studio/settings/page.tsx`
- Modify: `app/studio/agents/page.tsx`
- Test: `npm run build`

- [ ] **Step 1: Write the failing UI contract in the shared data sources**

The infrastructure page should render the live topology as distinct nodes:

```ts
const FALLBACK_SERVICES: InfraService[] = [
  {
    id: 'coolify',
    label: 'Coolify',
    role: 'Deployments and public reverse proxy',
    endpointLabel: 'private',
    healthKey: 'coolify',
    kind: 'service',
  },
  {
    id: 'hermesAgent',
    label: 'Hermes Agent',
    role: 'Public browser UI',
    endpointLabel: 'hermes.kenomi.eu',
    healthKey: 'hermesAgent',
    kind: 'service',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    role: 'Private inference on Mac Mini M4',
    endpointLabel: 'private',
    healthKey: 'ollama',
    kind: 'external',
  },
]
```

The settings page should expose the browser-facing Hermes URL and keep the private Ollama URL clearly marked as such.

- [ ] **Step 2: Run the build once to confirm the current UI contract is missing**

Run:

```bash
npm run build
```

Expected: the build should force you to resolve any missing `healthKey`, type, or data-shape mismatch introduced by the new service entries.

- [ ] **Step 3: Implement the UI updates**

Update the infrastructure topology, service cards, and labels so operators can see:

```ts
// Hermes Agent is public-facing via Coolify
// Ollama is private on the Mac Mini M4
// n8n is the orchestration layer
// the reverse proxy is the only public entrypoint
```

Keep the `agents` page model picker aligned with Hermes model families, but do not turn Hermes into a separate business agent. The UI should describe Hermes as a model family used by the runtime, not as a standalone workflow actor.

- [ ] **Step 4: Run the build again**

Run:

```bash
npm run build
```

Expected: production build passes with the updated service graph.

- [ ] **Step 5: Commit**

```bash
git add app/studio/infrastructure/page.tsx app/studio/settings/page.tsx app/studio/agents/page.tsx
git commit -m "feat: surface Hermes public deployment in studio"
```

### Task 3: Update operator docs and deployment runbooks

**Files:**
- Modify: `docs/runbooks/coolify-deploy.md`
- Modify: `docs/security.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Write the docs changes as hard requirements**

Document the live split explicitly:

```md
VM-Coolify
- OpenWebUI
- n8n
- Hermes Agent
- Reverse Proxy

Mac Mini M4
- Ollama
- modèles IA
```

Document the required environment variables and where they live:

```bash
HERMES_AGENT_URL=https://hermes.kenomi.eu
OLLAMA_BASE_URL=http://192.168.0.14:11434
TRUSTED_PRIVATE_HOSTS=192.168.0.14,hermes.kenomi.eu
```

Document the security boundary:

```md
- The browser only reaches the Coolify reverse proxy.
- Hermes Agent talks to Ollama over the private network.
- Ollama is never exposed directly to the public internet.
- All privileged actions stay behind auth and approval gates.
```

- [ ] **Step 2: Review the docs for contradictions**

Make sure the docs do not still imply a standalone `VM-LLM` or a public Ollama endpoint.

- [ ] **Step 3: Update the files**

Update:

- `docs/runbooks/coolify-deploy.md` with the deployment order and smoke checks
- `docs/security.md` with the new network trust boundary
- `CLAUDE.md` with the new operational source of truth for Hermes and Ollama
- `README.md` if it still describes the old topology

- [ ] **Step 4: Run the repo checks**

Run:

```bash
npm test
npm run typecheck
```

Expected: no regressions from the documentation changes.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/coolify-deploy.md docs/security.md CLAUDE.md README.md
git commit -m "docs: align operator guidance with Hermes deployment"
```

### Task 4: Add a smoke script for the public Hermes path

**Files:**
- Create: `scripts/smoke-hermes-public-deploy.mjs`
- Create: `scripts/smoke-hermes-public-deploy.test.ts`

- [ ] **Step 1: Write the failing smoke test**

The smoke test should check that the script exists, references the expected public and private endpoints, and enforces the new deployment contract:

```ts
import { existsSync, readFileSync } from 'node:fs'

it('keeps the public Hermes deployment contract in place', () => {
  expect(existsSync('scripts/smoke-hermes-public-deploy.mjs')).toBe(true)
  const source = readFileSync('scripts/smoke-hermes-public-deploy.mjs', 'utf8')
  expect(source).toContain('HERMES_PUBLIC_URL')
  expect(source).toContain('OLLAMA_BASE_URL')
  expect(source).toContain('hermes.kenomi.eu')
})
```

- [ ] **Step 2: Run the smoke test once before implementation**

Run:

```bash
npm test -- --run scripts/smoke-hermes-public-deploy.test.ts
```

Expected: failure because the script does not exist yet.

- [ ] **Step 3: Implement the minimal smoke script**

The script should:

```js
// 1. GET the public Hermes URL through the reverse proxy
// 2. GET the Hermes health endpoint
// 3. Verify Ollama is reachable only from the private host/configured URL
// 4. Exit non-zero if any step fails
```

Concrete runtime contract:

```bash
HERMES_PUBLIC_URL=https://hermes.kenomi.eu
OLLAMA_BASE_URL=http://192.168.0.14:11434
```

- [ ] **Step 4: Run the smoke test and the script**

Run:

```bash
npm test -- --run scripts/smoke-hermes-public-deploy.test.ts
node scripts/smoke-hermes-public-deploy.mjs
```

Expected: the test passes, and the script returns `ok` only when the public Hermes entrypoint and private Ollama target are both reachable in the expected way.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-hermes-public-deploy.mjs scripts/smoke-hermes-public-deploy.test.ts
git commit -m "test: add Hermes deployment smoke check"
```

## Self-review checklist

- The public browser path is only `VM-Coolify` reverse proxy, never Ollama.
- The inference path is only the Mac Mini M4, never the browser.
- The Studio health UI can surface both Hermes Agent and Ollama as separate services.
- The docs no longer imply a separate `VM-LLM` deployment.
- The smoke test checks the exact operational contract that will matter after deployment.

