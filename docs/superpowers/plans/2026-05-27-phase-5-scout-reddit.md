# Phase 5 Scout Reddit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Scout` consume a real Reddit signal pipeline, with bounded collection, local scoring, persistence, and handoff into the existing Scout venture pipeline.

**Architecture:** Keep the current `Scout -> Validation -> Builder -> Payment -> Marketing -> Decision` flow intact. Improve only the source layer by collecting Reddit signals, normalizing them into `ScoutSourceSignal`, scoring them locally before LLM use, persisting recent signals for audit/UI, and injecting only top-ranked evidence into the existing Scout prompt path.

**Tech Stack:** Next.js App Router, TypeScript, existing Scout runtime in `lib/autonomy/run-agent-step.ts`, source collection in `lib/scout/free-sources.ts`, Supabase PostgREST, Studio UI, existing venture pipeline schema.

---

### Task 1: Add Reddit-specific signal parsing and scoring primitives

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/free-sources.ts`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/reddit.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/reddit.test.ts`

- [ ] **Step 1: Write failing tests for Reddit normalization and local scoring**

Cover:
- parsing `search.json` payloads into internal candidates
- subreddit allowlist filtering
- rejection of low-signal posts
- heuristic scoring into `0..100`
- normalization into `ScoutSourceSignal`

Example cases:
- operational pain post in `r/smallbusiness` gets accepted with a strong score
- self-promo or meme-like post gets rejected or strongly penalized
- empty title/selftext does not become a usable signal

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/scout/reddit.test.ts
```

Expected: FAIL with missing-module or missing-export errors.

- [ ] **Step 3: Implement Reddit collector helpers**

Add a focused module in `lib/scout/reddit.ts` that:
- fetches Reddit public search JSON
- extracts post candidates
- applies subreddit/query constraints
- computes local score heuristics
- returns normalized `ScoutSourceSignal[]`

Keep the layer deterministic and narrow:
- bounded number of queries
- bounded number of results
- explicit reject rules for noisy posts

- [ ] **Step 4: Wire the collector into `lib/scout/free-sources.ts`**

Replace the current loose Reddit path with the new helper so that Scout sees normalized, pre-scored signals instead of raw search output.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/scout/reddit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/scout/free-sources.ts lib/scout/reddit.ts lib/scout/reddit.test.ts
git commit -m "feat(scout): add reddit signal normalization"
```

### Task 2: Persist recent Scout signals for audit and Studio visibility

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/supabase/migrations/20260525_prospect_crm.sql`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/signal-log.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/signal-log.test.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`

- [ ] **Step 1: Write failing tests for Scout signal persistence**

Cover:
- shape of persisted signal rows
- append-only writes
- preservation of source metadata such as subreddit, url, score, and normalized payload

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/scout/signal-log.test.ts
```

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Add storage for recent Reddit Scout signals**

Extend the cumulative migration with a lightweight table:
- `public.scout_signals`

Recommended fields:
- `id`
- `user_id`
- `source_id`
- `source_label`
- `signal_type`
- `subreddit`
- `title`
- `url`
- `score`
- `evidence`
- `normalized_payload`
- `created_at`

Add indexes and grants consistent with the rest of the Studio data model.

- [ ] **Step 4: Implement persistence helper**

Add `lib/scout/signal-log.ts` to append the top normalized signals for each Scout run.

Use best-effort error handling only if existing Scout behavior requires non-blocking source logging. If source persistence is treated as part of Scout correctness, fail the run coherently instead of silently degrading.

- [ ] **Step 5: Write Scout signals during `runAgentStep('scout')`**

After Reddit signals are collected and ranked, persist the top batch before prompting the model.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
npm test -- lib/scout/signal-log.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260525_prospect_crm.sql lib/scout/signal-log.ts lib/scout/signal-log.test.ts lib/autonomy/run-agent-step.ts
git commit -m "feat(scout): persist reddit scout signals"
```

### Task 3: Inject ranked Reddit evidence into the Scout prompt path

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/free-sources.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/autonomy/run-agent-step.test.ts`

- [ ] **Step 1: Write failing tests for Scout prompt evidence injection**

Cover:
- Scout prompt receives only top-ranked Reddit signals
- degraded source state is surfaced when Reddit fetch fails
- existing `venture_pipeline` contract remains unchanged

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts
```

Expected: FAIL for the new Scout evidence expectations.

- [ ] **Step 3: Tighten the Scout source brief**

Ensure `buildScoutSourceBrief(...)` or equivalent formatting path:
- references Reddit explicitly
- includes subreddit, score, and direct evidence
- excludes low-ranked noise
- keeps output compact enough for deterministic model use

- [ ] **Step 4: Preserve Scout downstream compatibility**

Verify that no downstream agent contract changes are introduced:
- `venture_pipeline` stays intact
- downstream stages still receive the same normalized venture object shape

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- lib/autonomy/run-agent-step.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/scout/free-sources.ts lib/autonomy/run-agent-step.ts lib/autonomy/run-agent-step.test.ts
git commit -m "feat(scout): inject ranked reddit evidence"
```

### Task 4: Expose Scout signals in Studio

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/api/studio/ventures/route.ts`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/app/studio/ventures/page.tsx`
- Create: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/api-view.ts`
- Test: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/lib/scout/api-view.test.ts`

- [ ] **Step 1: Write failing tests for Scout signal API projection**

Cover:
- recent signals load in descending recency
- source status is exposed as `live` or `degraded`
- returned shape includes subreddit, score, title, and source URL

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- lib/scout/api-view.test.ts
```

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Add an API projection helper**

Create `lib/scout/api-view.ts` to shape `scout_signals` rows for Studio use.

- [ ] **Step 4: Extend the ventures Studio API and UI**

Add a compact `Scout Signals` block that shows:
- source status
- last fetch time
- recent top Reddit signals
- subreddit
- score
- direct link to the Reddit source

Keep the UI narrow and inspection-oriented. Do not create a large new page in this phase.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- lib/scout/api-view.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run a full build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/studio/ventures/route.ts app/studio/ventures/page.tsx lib/scout/api-view.ts lib/scout/api-view.test.ts
git commit -m "feat(studio): show scout reddit signals"
```

### Task 5: Validate degraded behavior and live Scout flow

**Files:**
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/README.md`
- Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/docs/runbooks/coolify-deploy.md`
- Create or Modify: `/Users/kenjimobutu/Desktop/DEV/Projects/kenomi-canvas/scripts/smoke-scout-reddit.mjs`

- [ ] **Step 1: Add a Scout smoke path**

Create or extend a smoke script that validates:
- Scout run queues and completes
- Reddit-derived signals are collected or degraded coherently
- persisted `scout_signals` rows exist after the run
- venture output still lands in `venture_pipeline`

- [ ] **Step 2: Add degraded-mode checks**

Test at least one failure mode locally:
- mocked Reddit timeout or malformed JSON

Expected behavior:
- Scout completes with source degradation surfaced
- no invalid signal rows are persisted as high-confidence evidence

- [ ] **Step 3: Update docs**

Document:
- any Reddit-related configuration
- operational limits of the public JSON endpoint
- how to run the Scout smoke locally and against prod

- [ ] **Step 4: Run verification**

Run:

```bash
npm test -- lib/scout/reddit.test.ts lib/scout/signal-log.test.ts lib/scout/api-view.test.ts lib/autonomy/run-agent-step.test.ts
npm run typecheck
npm run build
node --check scripts/smoke-scout-reddit.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/runbooks/coolify-deploy.md scripts/smoke-scout-reddit.mjs
git commit -m "test(scout): add reddit scout smoke coverage"
```

---

## Final verification and rollout

- [ ] Apply the `scout_signals` migration in production
- [ ] Redeploy `kenomi-canvas`
- [ ] Run the Scout smoke against production with a valid Studio session
- [ ] Verify recent Reddit-backed signals appear in Studio
- [ ] Verify `venture_pipeline` entries are still generated by Scout
- [ ] Confirm degraded behavior remains non-catastrophic if Reddit returns no usable signals

## Notes

- Keep Phase 5 strictly Reddit-only. Do not expand to Hacker News or multi-source in this implementation pass.
- Do not add Scout Qdrant memory in this phase.
- Prefer deterministic local filtering over “let the model decide” source selection.
