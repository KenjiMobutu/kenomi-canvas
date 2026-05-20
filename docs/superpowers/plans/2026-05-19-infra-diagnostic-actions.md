# Infra Diagnostic Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the infrastructure diagnostic panel into an operator surface that can recheck services and record repair/incident actions with an auditable result.

**Architecture:** Keep the network diagnostics in a server helper reused by the GET and POST routes. Add a pure action model for available actions and response copy, then expose a protected action route that writes audit events and returns a fresh diagnostic snapshot. The UI renders compact action buttons without performing privileged work in the browser.

**Tech Stack:** Next.js App Router, Supabase SSR auth guard, Vitest, existing `agent_events` audit table.

---

### Task 1: Pure Action Model

**Files:**

- Create: `lib/infra-diagnostic-actions.ts`
- Create: `lib/infra-diagnostic-actions.test.ts`

- [x] **Step 1: Write failing tests for action availability and response payloads.**
- [x] **Step 2: Implement action helpers for `recheck` and `record_incident`.**
- [x] **Step 3: Run targeted tests.**

### Task 2: Shared Diagnostics Collector

**Files:**

- Create: `lib/infra-diagnostics-runner.ts`
- Modify: `app/api/studio/infra/diagnostics/route.ts`

- [x] **Step 1: Extract current diagnostic collection behind a reusable server function.**
- [x] **Step 2: Keep GET `/api/studio/infra/diagnostics` behavior unchanged.**

### Task 3: Protected Action API

**Files:**

- Create: `app/api/studio/infra/diagnostics/actions/route.ts`

- [x] **Step 1: Require an allowed user and rate limit action calls.**
- [x] **Step 2: Validate action payloads.**
- [x] **Step 3: Return a fresh diagnostic snapshot and insert an audit event.**

### Task 4: UI Controls

**Files:**

- Modify: `app/studio/infrastructure/page.tsx`

- [x] **Step 1: Add action state and a shared diagnostics loader.**
- [x] **Step 2: Render `Recheck` and `Tracer` buttons per diagnostic row.**
- [x] **Step 3: Show the last action result and refresh the panel after each action.**

### Task 5: Verification

**Commands:**

- [x] `npm test -- lib/infra-diagnostic-actions.test.ts`
- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run ops:coherence`
- [x] `npm run build`
- [x] Browser check `/studio/infrastructure`
