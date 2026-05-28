# Revenue Truth Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recentrer Kenomi Canvas pour qu'il fonctionne d'abord comme une machine personnelle de génération de revenu, en réduisant l'UX méta et en augmentant la vérité business exploitable.

**Architecture:** On garde le cockpit existant, mais on change la source de décision. Aujourd'hui, les priorités proviennent surtout du pipeline Prospect et de règles de priorisation UI. La cible est une boucle pilotée par la vérité business: offre, angle, segment, réponse, objection, conversion, paiement. Le cockpit devient une surface d'exécution d'une intelligence commerciale mesurable, pas seulement une surface de pilotage outbound.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase PostgreSQL + RLS, route handlers Studio, Vitest, Coolify, Qdrant mémoire prospect, Stripe.

---

## Product Rule

Le produit doit répondre rapidement à ces questions:

1. Quelle offre me rapporte vraiment de l'argent ?
2. Quel segment répond, mais n'achète pas ?
3. Quel angle convertit jusqu'au paiement ?
4. Où se casse la séquence entre signal, outreach, reply, close et cash ?
5. Quelle action aujourd'hui augmente le cash attendu, pas juste l'activité ?

Tout ce qui ne sert pas directement ces cinq questions passe derrière.

## Target Operating Model

### North-star metrics

- `cash_collected_7d`
- `cash_collected_30d`
- `reply_rate_by_source`
- `win_rate_by_offer`
- `win_rate_by_segment`
- `lead_to_reply_hours`
- `reply_to_close_days`
- `blocked_revenue_eur`

### Required truth entities

- `offer`
- `offer_variant`
- `prospect_segment`
- `outreach_angle`
- `conversation_signal`
- `close_signal`
- `revenue_event`

### UI principle

- `/studio` = "what creates money next"
- `/studio/prospects` = execution queue
- `/studio/revenue` = proof, blockers, conversion truth
- everything else = support surface, secondary navigation

## File Map

### Existing files to extend

- `app/studio/page.tsx`
- `app/studio/prospects/page.tsx`
- `app/studio/revenue/page.tsx`
- `app/api/studio/prospects/route.ts`
- `app/api/studio/revenue/outcomes/route.ts`
- `app/api/studio/revenue/loop/route.ts`
- `lib/studio/cash-queue.ts`
- `lib/studio/cash-outcomes.ts`
- `lib/studio/revenue-focus.ts`
- `scripts/smoke-prospect-outbound.mjs`

### New backend units

- `lib/revenue/offers.ts`
- `lib/revenue/segments.ts`
- `lib/revenue/conversion-truth.ts`
- `lib/revenue/action-engine.ts`
- `lib/revenue/objections.ts`
- `lib/revenue/funnel-metrics.ts`

### New API routes

- `app/api/studio/revenue/offers/route.ts`
- `app/api/studio/revenue/conversions/route.ts`
- `app/api/studio/revenue/insights/route.ts`
- `app/api/studio/prospects/objections/route.ts`

### New tests

- `lib/revenue/offers.test.ts`
- `lib/revenue/conversion-truth.test.ts`
- `lib/revenue/action-engine.test.ts`
- `lib/revenue/funnel-metrics.test.ts`
- `lib/api-routes/revenue-conversions-route.test.ts`

### New migrations

- `supabase/migrations/<timestamp>_revenue_truth_core.sql`
- `supabase/migrations/<timestamp>_prospect_outreach_truth.sql`

## Phase 1: Make Offers Explicit

**Outcome:** every prospect and every revenue loop can be attached to a concrete offer and angle.

### Scope

- Add canonical `offers` table
- Add `offer_id`, `offer_variant`, `outreach_angle` on prospects and/or related events
- Expose offer assignment in Prospect and Revenue flows
- Make `/studio/revenue` pivot on offers, not only loops

### Implementation tasks

- [ ] Create migration for `offers`
  - fields: `id`, `user_id`, `name`, `category`, `status`, `target_icp`, `default_price_eur`, `created_at`, `updated_at`
- [ ] Create migration for `offer_variants`
  - fields: `id`, `offer_id`, `name`, `positioning`, `price_eur`, `channel_fit`, `created_at`
- [ ] Extend `prospects` with nullable `offer_id`, `offer_variant`, `outreach_angle`
- [ ] Extend revenue loop read models so every loop exposes `offer_id`
- [ ] Add `lib/revenue/offers.ts` for server-side CRUD/read helpers
- [ ] Add `/api/studio/revenue/offers`
- [ ] Add tests for offer reads and mapping
- [ ] Add UI affordance in Prospects for assigning or confirming an offer
- [ ] Add UI grouping in Revenue by offer

### Verification

- `npm test -- lib/revenue/offers.test.ts lib/api-routes/revenue-conversions-route.test.ts`
- `npm run build`
- smoke path: create prospect -> assign offer -> see offer reflected in revenue views

## Phase 2: Capture Conversation Truth

**Outcome:** replies are no longer just a status. They carry business meaning.

### Scope

- Record objection, intent, reply sentiment, next-step quality
- Distinguish positive reply, soft interest, hard objection, referral, closed-lost reason
- Keep this lightweight and operator-first

### Implementation tasks

- [ ] Create migration for `prospect_conversation_events`
  - fields: `id`, `prospect_id`, `user_id`, `event_type`, `event_value`, `notes`, `created_at`
- [ ] Create enum-like constraints for:
  - `positive_reply`
  - `soft_interest`
  - `hard_no`
  - `budget_block`
  - `timing_block`
  - `wrong_person`
  - `referral`
  - `meeting_booked`
  - `closed_won`
  - `closed_lost`
- [ ] Add `lib/revenue/objections.ts`
- [ ] Add API route to append conversation events
- [ ] Add Prospect-side controls for reply classification and loss reason
- [ ] Make `marked_replied`, `marked_won`, `marked_lost` enrich conversation truth instead of only mutating pipeline

### Verification

- tests for conversation event aggregation
- smoke path: sent -> replied -> classify objection -> reflected in insights

## Phase 3: Build Real Conversion Truth

**Outcome:** `/studio/revenue` answers what converts by offer, source, segment, and angle.

### Scope

- Create unified conversion snapshots
- Expose funnel cuts:
  - source
  - source + band
  - offer
  - offer + angle
  - segment + offer

### Implementation tasks

- [ ] Add `lib/revenue/conversion-truth.ts`
- [ ] Define canonical funnel stages:
  - contacted
  - replied
  - qualified_reply
  - meeting_booked
  - checkout_created
  - paid
- [ ] Add `lib/revenue/funnel-metrics.ts`
- [ ] Add `/api/studio/revenue/conversions`
- [ ] Extend `/api/studio/revenue/outcomes` to include offer and angle cuts
- [ ] Add cards in `/studio/revenue`:
  - best offer
  - best angle
  - segment that replies but does not pay
  - source that pays fastest

### Verification

- unit tests for funnel aggregation
- route tests for payload shape
- manual verification with seeded or real production data

## Phase 4: Replace Meta Prioritization With Business Action Engine

**Outcome:** the queue is driven by business truth, not only by generic pipeline urgency.

### Scope

- Move from "which card is urgent?" to "which action increases expected cash?"
- Combine:
  - blocked revenue
  - offer conversion rate
  - segment quality
  - objection profile
  - response speed

### Implementation tasks

- [ ] Add `lib/revenue/action-engine.ts`
- [ ] Model an `expected_cash_score`
- [ ] Inputs:
  - pipeline urgency
  - offer win rate
  - source reply rate
  - segment quality score
  - playbook hint
  - objection pattern
  - time decay
- [ ] Make `lib/studio/cash-queue.ts` consume `action-engine` output instead of local heuristics only
- [ ] Add a second label on queue items:
  - `expected cash +420 €`
  - `stuck after reply`
  - `good replies, weak close`
- [ ] Make queue CTA selection adapt:
  - `volume push` => open qualified new leads
  - `reply push` => send / approve
  - `win push` => follow-up / checkout / close action

### Verification

- tests for action ordering under conflicting signals
- tests for CTA selection
- smoke path where hint changes queue recommendation

## Phase 5: Make Revenue Page a Truth Surface, Not a Dashboard Surface

**Outcome:** `/studio/revenue` becomes the main learning surface for money, not a KPI gallery.

### Scope

- De-emphasize ornamental summaries
- Emphasize:
  - what made money
  - what looked promising but did not close
  - what to repeat
  - what to stop

### Implementation tasks

- [ ] Add `Top offers`
- [ ] Add `Angles that close`
- [ ] Add `Replies with no close`
- [ ] Add `Common objections`
- [ ] Add `Lost reasons`
- [ ] Add `Fastest path to cash`
- [ ] Add `Repeat this next` panel
- [ ] Add drilldowns from each insight to filtered Prospects/Revenue

### Verification

- route responses include insight payloads
- browser/manual review with authenticated session
- smoke-lite on drilldown URLs

## Phase 6: Reduce Meta UX

**Outcome:** the app stops looking like a broad personal OS and looks like a personal revenue console.

### Scope

- Move non-revenue modules to secondary navigation or collapsible utility groups
- Reduce cognitive competition on `/studio`

### Implementation tasks

- [ ] Reorder primary nav to:
  - Studio
  - Prospects
  - Revenue
  - Automations
  - Infrastructure
- [ ] Move `Gamification`, `Documents`, and lower-priority utilities behind a secondary group
- [ ] Remove or demote panels on `/studio` that do not change revenue decisions this week
- [ ] Keep only:
  - cash outcomes
  - cash queue
  - top blockers
  - best source
  - best segment
  - revenue proof

### Verification

- browser review desktop + mobile
- ensure no lost access to secondary modules

## Phase 7: Add Weekly Commercial Review

**Outcome:** the app teaches you what to do next week, not just today.

### Scope

- weekly summary generated from truth tables
- operator review workflow

### Implementation tasks

- [ ] Add `weekly_revenue_reviews` persistence
- [ ] Create `/api/studio/revenue/insights`
- [ ] Generate weekly summary:
  - best source
  - best segment
  - best offer
  - best angle
  - top objection
  - main leak in funnel
  - next commercial experiment
- [ ] Surface it on `/studio/revenue`
- [ ] Add automation hook in schedules if useful later

### Verification

- tests for weekly summary aggregation
- manual validation on real data snapshots

## Phase 8: Strengthen Smoke Tests Around Truth, Not Only State Changes

**Outcome:** smokes prove business instrumentation, not just pipeline transitions.

### Scope

- extend outbound smoke
- add truth assertions

### Implementation tasks

- [ ] Extend `scripts/smoke-prospect-outbound.mjs`
- [ ] Assert:
  - prospect has `offer_id` or `offer_variant`
  - conversation truth row exists after reply/loss/win events
  - revenue outcomes expose source, segment, offer metrics
  - queue reacts to hint changes
- [ ] Add a revenue insights smoke if needed

### Verification

- `npm run smoke:prospect`
- optional `npm run smoke:devops` unchanged

## Rollout Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8

This order matters. If you try to optimize the queue before capturing offer and conversation truth, you will optimize noise.

## What To Explicitly Avoid

- No new generic dashboard widgets without a cash decision behind them
- No new gamification or motivational framing in primary flows
- No broad refactor of every page at once
- No premature CRM complexity such as teams, owners, or territories
- No AI-generated “insights” that are not backed by structured metrics

## Definition of Done

The app matches the target vision when, from `/studio` and `/studio/revenue`, you can answer in under two minutes:

- what offer to push,
- on which source,
- for which segment,
- with which angle,
- where the current funnel leaks,
- and what action today has the highest expected cash impact.

At that point, Kenomi Canvas stops being mainly a supervised autonomy cockpit and becomes a personal commercial operating system.
