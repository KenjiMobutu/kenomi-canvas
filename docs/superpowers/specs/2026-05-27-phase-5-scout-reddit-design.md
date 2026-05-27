# Phase 5 Scout Reddit Design

## Goal

Make `Scout` consume a real Reddit signal pipeline instead of relying on generic multi-source collection, while preserving the existing `Scout -> Validation -> Builder -> Payment -> Marketing -> Decision` architecture.

This phase is intentionally narrow:
- one real source: `Reddit`
- one operational loop: collect -> normalize -> locally score -> feed Scout -> create `venture_pipeline`
- no multi-source expansion yet
- no dedicated Scout memory yet

Success means:
- a Scout run uses real Reddit-derived signals,
- those signals are inspectable,
- the existing venture pipeline remains unchanged,
- and the source layer is strong enough to expand later to Hacker News and others.

---

## Scope

### In scope

- bounded Reddit collection via the public Reddit JSON search endpoint
- normalization of Reddit posts into `ScoutSourceSignal`
- local pre-LLM scoring and ranking of Reddit signals
- handoff of top-ranked Reddit signals into the existing Scout prompt
- persistence of recent Reddit Scout signals for audit and UI use
- lightweight Studio visibility for the Reddit source status and recent signals
- test and smoke coverage for the Reddit-backed Scout path

### Out of scope

- multi-source Scout
- Reddit OAuth and authenticated API flows
- browser scraping
- Qdrant memory for Scout
- full Scout data lake ingestion
- Scout-specific approvals or new venture orchestration mechanics

---

## Architecture

The current architecture remains the anchor:

- `lib/scout/free-sources.ts` remains the source-collection layer
- `runAgentStep(... agentId='scout')` remains the execution path
- `venture_pipeline` remains the output contract
- `buildScoutSourceBrief(...)` remains the LLM-facing source context formatter

This phase strengthens the source side instead of changing the venture pipeline contract.

The new shape is:

1. collect Reddit posts from a bounded set of searches/subreddits
2. normalize each candidate into `ScoutSourceSignal`
3. apply local score heuristics
4. keep top N signals
5. pass those signals into the existing Scout prompt
6. persist the normalized signals for audit and Studio visibility

The LLM is no longer expected to “discover from nothing”. It reasons over curated Reddit evidence.

---

## Reddit Source Model

### Endpoint strategy

Primary source:
- `https://www.reddit.com/search.json`

The first phase should stay on the public JSON endpoint to avoid OAuth complexity.

### Query strategy

The collector should use a bounded set of pain-oriented queries, for example:
- `"pain point" automation`
- `"looking for tool" sales`
- `"manual process" recruiting`
- `"spreadsheet hell" ops`
- `"need software" lead gen`

Additionally, user settings should allow a shortlist of target subreddits such as:
- `r/startups`
- `r/SaaS`
- `r/smallbusiness`
- `r/agency`
- `r/Entrepreneur`
- `r/sales`

The collector should constrain:
- number of requests
- number of results per request
- subreddit allowlist if configured

This keeps Scout cheap, deterministic, and reviewable.

---

## Signal Normalization

Every Reddit candidate becomes a `ScoutSourceSignal` with:

- `sourceId = 'reddit'`
- `sourceLabel = 'Reddit'`
- `signalType = 'pain'` by default in this phase
- `title`
- `url`
- `score`
- `evidence`
- `sellableOffer`

The `sellableOffer` contract already exists in the current codebase and should remain the required output shape for Scout.

Normalization should derive:
- buyer guess from subreddit/query context
- urgent pain from post title and text preview
- acquisition channel = `reddit`
- landing angle from the strongest explicit pain expression

The normalization layer should reject low-information posts instead of passing everything downstream.

---

## Local Scoring

Before the LLM sees any signal, Scout should compute a local `score` for Reddit posts.

Scoring inputs:
- explicit pain language
- operational/business friction language
- comment count
- upvote score
- subreddit relevance
- B2B/SaaS/ops/recruiting/sales relevance
- anti-noise penalties for memes, vague asks, or self-promo

The score remains heuristic, bounded to `0..100`.

The purpose is not to replace the LLM. It is to reduce noise and improve determinism.

Only the top-ranked signals are included in the Scout prompt and persisted as candidate signals.

---

## Persistence

This phase should persist recent Scout source signals in a lightweight append-only table, tentatively:

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

Purpose:
- auditability
- UI rendering
- debugging source quality
- de-duplication in later phases

This is not yet a full event lake. It is an operational source log.

---

## Studio Surface

This phase should expose Reddit Scout signals without creating a heavy new product area.

Recommended surface:
- extend existing Studio venture/agent views with a `Scout Signals` block

Show:
- source status: `live` / `degraded`
- last fetch time
- recent top Reddit signals
- score
- subreddit
- direct source link

The UI should optimize for inspection, not content volume.

---

## Failure Model

Expected degraded cases:
- Reddit timeout
- public API throttling / 429
- malformed JSON
- zero useful results

Required behavior:
- Scout should still complete with a degraded source report rather than crash the entire run
- failures should be recorded in source status output
- no invalid or empty signals should be silently treated as strong evidence

This phase must keep the system calm under partial source failure.

---

## Testing

Required coverage:

1. Reddit response parsing
2. subreddit filtering
3. heuristic scoring
4. normalization into `ScoutSourceSignal`
5. persistence of recent Scout signals
6. degraded-mode handling on fetch failure
7. Scout run using Reddit-backed signal context

Live validation target:
- a Scout smoke or targeted run that proves a real Reddit-derived signal can flow into `venture_pipeline`

---

## Migration and Compatibility

This phase must preserve compatibility with:
- current Scout output schema
- current `venture_pipeline`
- current downstream agents

No downstream agent should need to change just because Scout became Reddit-backed.

This is a source-quality improvement phase, not a pipeline-contract rewrite.

---

## Why This Design

This design is the right next step because:
- it adds one real source instead of pretending to solve all of Scout at once
- it gives traceable signals instead of opaque LLM ideation
- it preserves the existing venture pipeline
- it creates a clean base for later phases:
  - Hacker News
  - multi-source Scout
  - Scout memory via Qdrant
  - stronger opportunity ranking

It is the smallest Scout phase that materially improves architectural conformity.
