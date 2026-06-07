# 300EUR Diagnostic Cash Lane Design

## Goal

Turn the app into a focused cash-generation lane for a single offer:

- `300EUR diagnostic`
- sold to `freelancers / small agencies`
- through `outbound email + follow-up`
- with a single CTA: `book a diagnostic call`

The purpose of this lane is not to generalize the revenue system further. It is to produce the shortest path from `contactable prospect` to `paid cash`.

## Product Decision

The app will optimize one commercial flow for the next 30 days:

`Scout -> contactable Prospects -> approved outbound -> follow-up -> replied -> call booked -> paid -> weekly review`

Everything outside this lane becomes secondary. Hermes should enforce this discipline rather than broaden exploration.

## Offer Definition

The active offer is:

- `300EUR diagnostic`
- format: `call + short written deliverable`
- target buyer: founder/freelancer/agency owner
- objective: identify growth, funnel, automation, or revenue bottlenecks and give a short actionable plan

This offer should be represented as a first-class active playbook in the product, even if the underlying data model remains generic.

## Commercial Constraints

The lane must assume:

- one active offer
- one primary segment
- one primary outbound message family
- one primary CTA

The system should bias toward throughput and clarity, not optionality. If the app can do many things but the operator can only sell one simple diagnostic this month, the UI and Hermes outputs should reflect that.

## User Roles

### Operator (Kenji)

Responsible for:

- final judgment on targeting
- attending calls
- delivering the diagnostic
- closing upsells if they emerge

### Hermes

Responsible for:

- keeping the queue honest
- surfacing what blocks cash now
- pushing low-risk actions
- prioritizing follow-ups over idle exploration
- telling the operator what to do next in plain language

The app should treat Hermes as an execution manager, not as the origin of business truth.

## Core Flow

### 1. Lead Intake

Prospects enter from existing scout/outreach flows, but only `contactable` prospects belong to the active sales lane.

Rules:

- `contactable` means a valid deliverable contact method, starting with `contact_email`
- `missing_contact` prospects must be visible, but outside the active send queue
- synthetic/demo/bootstrap prospects must never contaminate operator decisions

### 2. Outbound

Outbound for this lane must be constrained to:

- the single active offer
- a single message family
- a single CTA: book the paid diagnostic call

The operator should be able to approve a bounded visible batch quickly. The system should not encourage editing many variants in parallel during this phase.

### 3. Follow-up

Follow-up is the main execution engine after initial send.

Rules:

- only `contactable` prospects should count as actionable follow-ups
- follow-ups should be prioritized ahead of new prospecting if both queues compete
- Hermes should surface follow-up debt explicitly in Studio and Telegram

### 4. Qualification and Conversion

Once a prospect replies, the lane should move toward:

- `replied`
- `call_booked`
- `paid`
- optionally later: upsell into a larger service

For the first 30 days, the product should optimize for first paid proofs at `300EUR`, not for more complex downstream package logic.

## UI Design

## `/studio`

The home screen should act as the daily operating console for this cash lane.

Priority blocks:

1. `Daily brief`
2. `Cash movement`
3. active blockers
4. links into the exact queue that needs action

The brief should answer:

- what blocks cash now
- what should be sent now
- what should be followed up now
- what should be stopped this week

## `/studio/prospects`

This page becomes the working surface for the lane.

Requirements:

- default emphasis on `contactable`
- clear split between `contactable` and `missing_contact`
- default prioritization:
  - awaiting approval
  - follow_up_due
  - hot replied leads
- fast bounded batch approval for visible sendable drafts
- visible signal that the active offer is the `300EUR diagnostic`

The page should feel like a queue, not a CRM museum.

## `/studio/revenue`

This page becomes the truth surface for the lane.

Requirements:

- show paid cash first
- show `reply -> paid` conversion clearly
- show cash reality honestly:
  - `no_cash_truth`
  - `thin_cash`
  - `real_cash`
- weekly review must not overfit on weak activity without real paid proof

The current direction is right; this lane should keep that discipline.

## `/studio/automations`

This page should explain:

- what Hermes executed
- what Hermes blocked
- whether the active lane is being serviced

It should not be the primary selling surface, but it should make operational drift obvious.

## Telegram UX

Telegram is the operator console outside the app.

V1 commands that matter for this lane:

- `/brief`
- `/revenue`
- `run prospect`
- `scan followups`
- `run devops`

Desired behavior:

- Hermes answers in terms of the single active lane
- it reports the main blocker, next best action, and queue health
- it does not send noisy multi-alert dumps

## Hermes Behavior

Hermes must prioritize queue management in this order:

1. pending approvals on contactable prospects
2. due follow-ups on contactable prospects
3. hot replied leads
4. prospecting refresh
5. infra/devops only when the commercial lane is healthy or blocked by execution issues

Hermes should bias toward:

- clearing approvals
- clearing follow-up debt
- surfacing hot leads

Hermes should not bias toward:

- broad exploration
- multiple simultaneous offer experiments
- interpreting activity as success without paid proof

## Data Semantics

The system should treat these as distinct:

- `synthetic/test/bootstrap`
- `real but not contactable`
- `real and contactable`
- `real paid truth`

Operator views should default to:

- real
- contactable
- paid-aware

Debug or audit views may still expose the rest, but not as default decision inputs.

## Metrics

Primary metric:

- `paid cash attributed`

Secondary metrics:

- `contactable prospects in active queue`
- `messages sent`
- `reply count`
- `call_booked count`
- `paid count`
- `reply -> paid rate`
- `follow-up debt`
- `time from first send to paid`

Metrics that should not dominate decision-making in this lane:

- raw prospect volume without contactability
- generic engagement without reply quality
- offer “winners” without paid proof

## Success Criteria

### 7-Day Success

- the app consistently surfaces only the actionable queue
- the operator can approve/send/follow up rapidly
- Hermes and Telegram point to the same next action
- no synthetic data distorts weekly decisions

### 30-Day Success

- first real paid diagnostics collected at `300EUR`
- weekly review shows real paid truth, not bootstrap inference
- the lane can sustain daily outbound and follow-up without queue chaos

## Non-Goals

This phase does not attempt to:

- support multiple offers equally
- generalize a venture studio marketplace
- optimize for content/SEO monetization
- replace the operator in calls or delivery
- build a full approval-through-Telegram workflow

## Implementation Direction

This should be implemented as a `dedicated sales playbook lane` built on top of the existing generic system.

That means:

- preserve existing generic foundations where already useful
- add explicit defaults, filters, summaries, and Hermes behavior around the single `300EUR diagnostic` lane
- avoid a broad new abstraction layer

The implementation should prefer focused product constraints over additional optionality.
