# Infra Prod Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/studio/infrastructure` explain production health, deployed commit, checked URLs, config source, last error, and repair action.

**Architecture:** Add a pure diagnostics model in `lib/infra-diagnostics.ts`, a protected route at `/api/studio/infra/diagnostics`, and a compact operations panel in `app/studio/infrastructure/page.tsx`. The route performs network checks; the UI only renders the stable payload.

**Tech Stack:** Next.js App Router, Supabase SSR auth helpers, existing infrastructure config helpers, Vitest.

---

### Task 1: Diagnostics Contract

**Files:**
- Create: `lib/infra-diagnostics.ts`
- Create: `lib/infra-diagnostics.test.ts`

- [x] **Step 1: Write failing tests for URL labels, config source, runtime summary, and repair actions.**
- [x] **Step 2: Implement the pure diagnostics helpers.**
- [x] **Step 3: Run targeted tests.**

### Task 2: Protected Diagnostics API

**Files:**
- Create: `app/api/studio/infra/diagnostics/route.ts`

- [x] **Step 1: Require an allowed user with the existing auth guard.**
- [x] **Step 2: Load non-secret user infrastructure settings.**
- [x] **Step 3: Ping health URLs, read Proxmox metrics, and build a stable diagnostic payload.**

### Task 3: Infrastructure UI Panel

**Files:**
- Modify: `app/studio/infrastructure/page.tsx`

- [x] **Step 1: Add diagnostics state and polling.**
- [x] **Step 2: Render a dense "Diagnostic prod" panel after the KPI strip.**
- [x] **Step 3: Show commit, runtime, smoke summary, service source, URL, latency, error, and repair action.**

### Task 4: Verification

**Commands:**
- [x] `npm test -- lib/infra-diagnostics.test.ts`
- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run ops:coherence`
- [x] `npm run build`
- [x] Browser check `/studio/infrastructure`
