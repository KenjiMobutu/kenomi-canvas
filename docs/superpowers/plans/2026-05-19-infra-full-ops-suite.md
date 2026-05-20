# Infra Full Ops Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the infrastructure ops loop so daily operation is calm, verifiable, and easy to repair across diagnostics, history, incidents, settings checks, and deployment parity.

**Architecture:** Reuse the existing `agent_events` table for action history and incident traces. Add a pure timeline/parity view model, expose a protected history endpoint, keep diagnostic actions writing sanitized audit events, and render compact operator panels on Infrastructure and Settings. Avoid unsafe automatic restarts; keep destructive repair as explicit, auditable next-step guidance.

**Tech Stack:** Next.js App Router, Supabase SSR auth guard, existing `agent_events`, Vitest, local Browser verification.

---

### Task 1: Timeline and Parity Model

**Files:**

- Create: `lib/infra-ops-timeline.ts`
- Create: `lib/infra-ops-timeline.test.ts`

- [x] **Step 1: Write failing tests for timeline rows, incident resolution, and runtime parity.**
- [x] **Step 2: Implement the pure view-model helpers.**
- [x] **Step 3: Run targeted tests.**

### Task 2: History API

**Files:**

- Create: `app/api/studio/infra/diagnostics/history/route.ts`

- [x] **Step 1: Require an allowed user.**
- [x] **Step 2: Load recent `agent_events` and current diagnostics.**
- [x] **Step 3: Return timeline, incidents, summary, and parity.**

### Task 3: Action Audit Enrichment

**Files:**

- Modify: `lib/infra-diagnostic-actions.ts`
- Modify: `lib/infra-diagnostic-actions.test.ts`

- [x] **Step 1: Add richer metadata for operator history.**
- [x] **Step 2: Keep sensitive values masked and tests green.**

### Task 4: Infrastructure UI Completion

**Files:**

- Modify: `app/studio/infrastructure/page.tsx`

- [x] **Step 1: Fetch history alongside diagnostics.**
- [x] **Step 2: Render incidents, timeline, and parity below diagnostic actions.**
- [x] **Step 3: Refresh history after each action.**

### Task 5: Settings Endpoint Verification

**Files:**

- Modify: `app/studio/settings/page.tsx`

- [x] **Step 1: Add a saved-endpoints verification action to the Infrastructure settings tab.**
- [x] **Step 2: Display source, runtime, Supabase-on-Coolify reminder, and failed repair hint.**

### Task 6: Deployment Source Traceability

**Files:**

- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/runbooks/coolify-deploy.md`

- [x] **Step 1: Add `SOURCE_COMMIT` build/runtime support.**
- [x] **Step 2: Document Coolify build arg/env expectation.**

### Task 7: Verification

**Commands:**

- [x] `npm test -- lib/infra-ops-timeline.test.ts lib/infra-diagnostic-actions.test.ts`
- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run ops:coherence`
- [x] `npm run build`
- [x] Browser check `/studio/infrastructure`
- [x] Browser check `/studio/settings`
