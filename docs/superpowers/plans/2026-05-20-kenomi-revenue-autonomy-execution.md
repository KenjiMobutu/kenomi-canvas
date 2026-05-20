# Kenomi Revenue Autonomy Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer Kenomi Canvas en une machine autonome supervisee qui trouve des idees via Scout, valide les meilleures, cree une venture + landing vendable, puis encaisse uniquement quand un client paie depuis cette landing publique.

**Architecture:** La boucle canonique est Scout -> Validation -> Venture -> Landing -> Offer config -> Checkout public -> Revenue -> Decision. Le Studio ne doit jamais etre une surface de paiement client: il configure l'offre, expose l'etat et propose des reparations, mais le paiement est declenche exclusivement par le formulaire checkout de `app/[slug]/page.tsx`. Supabase reste la source de verite, les gates `autonomy_actions` + `human_approvals` protegent les actions risquees, et n8n n'intervient qu'apres la creation de la page vendable pour distribuer ou livrer l'offre.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase/Postgres/RLS, Stripe Checkout/Webhooks, n8n webhooks, Vitest, Pino, Prometheus, Coolify cron.

---

## Current Baseline

- `npm test`: 419/419 tests passent.
- `npm run typecheck`: OK.
- `npm run build`: OK.
- `npm run lint`: 0 erreur, 12 warnings.
- `npm run ops:readiness`: OK.
- `npm run ops:coherence`: OK.
- `npm run smoke:vision`: OK.
- `npm run supabase:validate`: OK avec reseau.
- `SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke`: OK avec reseau.
- `npm run smoke:revenue-proof`: OK avec reseau.
- `npm run format:check`: KO, 41 fichiers a reformater.
- Preuve prod actuelle: checkouts, paiements completes, events Stripe, campagne publiee, spend, page views, waitlist et decisions existent.

## Scope Decision

Ce plan couvre sept sous-systemes lies par un objectif unique: transformer des idees Scout en ventures vendues sur leurs pages publiques.

1. Baseline release propre.
2. Boucle canonique Scout -> venture -> landing -> checkout public client.
3. Marketing live mesurable.
4. Fulfillment post-paiement.
5. Relance leads et conversion.
6. Portfolio d'experiences revenue.
7. Attribution, cadence cron et alerting.

Les refactors UI lourds sont limites aux zones touchees. Le decoupage complet des pages Studio > 2 000 lignes doit rester un plan separe sauf quand il bloque la boucle Scout -> page vendable -> revenu.

## Implementation Status 2026-05-20

- Phase 1 core implemented: Scout now produces sellable offers with buyer, urgent pain, concrete promise, price hypothesis, acquisition channel and landing angle.
- Validated Scout output can materialize a draft venture with the commercial offer embedded in the venture insight.
- Builder prompts and parsing now preserve sales copy fields so generated landings sell an offer instead of only explaining a product.
- Public landing health now requires a sellable offer, sales overlap and an action CTA.
- Studio checkout creation is disabled; client checkout is canonical only on the public landing route.
- Revenue loop now advances from payment configuration to marketing/distribution and exposes the public landing URL instead of creating Studio checkout sessions.
- The vision smoke now guards the canonical Scout -> venture -> public landing -> revenue contract.
- Verified targeted Phase 1 tests: 74 passing across Scout, pipeline, materialization, landing health, Stripe contract, revenue loop, autopilot and autonomy full-loop.
- Remaining open items in this phase are the explicit commit steps, the `app/studio/ventures/page.tsx` repair ordering, the extra smoke output label, and the runbook documentation updates.
- Phase 0 implemented on 2026-05-20 except explicit commit steps: global Prettier was run, format/typecheck/test/lint/build gates passed, and revenue baseline docs were updated.
- Phase 3 implemented and verified live on 2026-05-20: `fulfillment_deliveries` exists in prod, the Stripe post-payment path triggers fulfillment, a live n8n webhook `/webhook/fulfill` is active, and at least one delivery is completed in production.
- Phase 4 implemented and verified live on 2026-05-20: the waitlist route notifies n8n, a live nurture webhook `/webhook/nurture` is active, and a real waitlist signup from `lab.kenomi.eu` produced a successful n8n execution.
- Phase 5 implemented and verified on 2026-05-20: autonomy config now exposes portfolio experiment caps, revenue autopilot can plan multiple low-risk steps, and the global smoke suite remained green after the change.
- Phase 6 implemented and verified on 2026-05-20: public landings now capture UTM attribution into `page_view` and propagate it through public checkout metadata.
- Phase 7 implemented and verified on 2026-05-20: cron cadence smoke exists, Prometheus business gauges are exposed from `/api/metrics`, and production cadence now returns `mode=calm` with no blocked stage.
- Phase 8 final gate updated on 2026-05-20: revenue-proof now requires completed fulfillment, supports strict live-marketing mode, and the runbooks document both standard and full live checks.

## File Ownership Map

- `scripts/smoke-revenue-proof.mjs` — gate prod qui distingue preuve mock controlee et preuve live.
- `scripts/smoke-app.mjs` — smoke HTTP prod/local.
- `scripts/revenue-autopilot-cron.mjs` — appel cron daily revenue.
- `scripts/revenue-autopilot-daily.sh` — wrapper VM Coolify.
- `docs/runbooks/daily-operations.md` — routine prod et preuves business.
- `docs/runbooks/smoke-tests.md` — gates release.
- `lib/scout/free-sources.ts` — sources gratuites pour trouver des idees.
- `lib/agent-output-schemas.ts` — contrats Scout, Validation, Builder, Payment, Marketing, Decision.
- `lib/autonomy/run-agent-step.ts` — execution agent et materialisation de sorties.
- `lib/venture-materializer.ts` — creation venture + landing depuis les outputs agents.
- `lib/public-landing-health.ts` — verification page publique vendable.
- `lib/public-landing-cta.ts` — choix waitlist ou checkout sur landing.
- `app/[slug]/page.tsx` — page publique qui vend la venture.
- `app/studio/ventures/page.tsx` — validation, readiness et reparations venture.
- `app/studio/revenue/page.tsx` — cockpit revenu, preuve, autopilot, cadence; ne doit pas lancer de paiement client.
- `app/api/studio/revenue/audit/route.ts` — audit revenue complet.
- `app/api/studio/revenue/proof/route.ts` — actions de preuve controlees.
- `app/api/studio/revenue/autopilot/route.ts` — plan et execution quotidienne.
- `app/api/studio/stripe/checkout/route.ts` — route historique a desactiver ou reserver aux tests internes; le paiement canonique passe par `app/api/public/stripe/checkout/route.ts`.
- `app/api/stripe/webhook/route.ts` — entree webhook Stripe.
- `lib/stripe/webhook-handler.ts` — handler payment succeeded.
- `lib/revenue-proof.ts` — audit de preuve revenue.
- `lib/revenue-autopilot.ts` — planification next best action.
- `lib/revenue-cadence.ts` — statut cadence daily cycle.
- `lib/metrics/acquisition-roi.ts` — attribution ROI.
- `lib/marketing/adapters/status.ts` — statut live/mock marketing.
- `lib/marketing/publish-action.ts` — publication campagne et events.
- `lib/security.ts` — validation SSRF des webhooks.
- `supabase/migrations/*` — tables nouvelles si fulfillment/nurture.

---

## Phase 0 — Release Baseline Propre

**Goal:** rendre les gates de release coherents avant d'ajouter des flux qui touchent au revenu.

### Task 0.1: Stabiliser le format check

**Files:**

- Modify: fichiers listes par `npm run format:check`

- [x] **Step 1: Verifier l'etat git**

```bash
git status --short
```

Expected: seuls les changements connus du worker sont presents. Ne pas revert `tsconfig.tsbuildinfo` sans decision explicite.

- [x] **Step 2: Lancer Prettier**

```bash
npm run format
```

Expected: Prettier modifie uniquement le style.

- [x] **Step 3: Verifier le format**

```bash
npm run format:check
```

Expected: `All matched files use Prettier code style!`

- [x] **Step 4: Verifier les gates**

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Expected: typecheck/test/build OK, lint 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "style: normalize project formatting"
```

### Task 0.2: Mettre a jour la baseline revenue live

**Files:**

- Modify: `docs/runbooks/daily-operations.md`
- Modify: `docs/runbooks/smoke-tests.md`
- Modify: `docs/audits/2026-05-20-audit-vision-agence-ia.md`

- [x] **Step 1: Remplacer les compteurs obsoletes**

Dans `docs/runbooks/daily-operations.md`, remplacer la baseline `0 payments` par la baseline observee:

```md
Baseline relevee le 2026-05-20 apres preuve live:

| Metric                    | Value |
| ------------------------- | ----: |
| payments_with_checkout    |     3 |
| completed_payments        |     2 |
| payment_succeeded_events  |     2 |
| campaign_published_events |     2 |
| campaign_spend_events     |     2 |
| page_view_events          |     4 |
| waitlist_signup_events    |     1 |
| decisions                 |     3 |
```

- [x] **Step 2: Documenter la distinction test/live**

Ajouter dans `docs/runbooks/smoke-tests.md`:

```md
Le smoke revenue-proof prouve la boucle applicative. Il ne prouve pas que Stripe est en mode live ni qu'une campagne est sortie sur un canal public. Pour declarer "revenu reel", verifier aussi:

- au moins un paiement Stripe live demarre depuis une landing publique;
- `MARKETING_ADAPTER=n8n`;
- un `provider_run_id` externe non mock pour au moins une campagne;
- une livraison post-paiement en statut `completed`.
```

- [x] **Step 3: Verifier docs**

```bash
npm run format:check
```

Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/daily-operations.md docs/runbooks/smoke-tests.md docs/audits/2026-05-20-audit-vision-agence-ia.md
git commit -m "docs: update revenue proof baseline"
```

---

## Phase 1 — Boucle Canonique Scout Vers Page Vendable

**Goal:** garantir que l'app cree son revenu de la maniere voulue: Scout trouve une offre vendable, la validation cree une venture, Builder cree une landing orientee vente, Payment configure l'offre, et la page publique encaisse.

### Task 1.1: Durcir le contrat Scout pour produire des offres vendables

**Files:**

- Modify: `lib/agent-output-schemas.ts`
- Modify: `lib/agent-output-schemas.test.ts`
- Modify: `lib/scout/free-sources.ts`
- Modify: `lib/scout/free-sources.test.ts`

- [x] **Step 1: Ajouter le test de sortie Scout vendable**

In `lib/agent-output-schemas.test.ts`, add:

```ts
it('requires Scout ideas to be sellable offers, not just interesting ideas', () => {
  const parsed = scoutOutputSchema.parse({
    title: 'AI proposal cleanup for freelancers',
    niche: 'freelance consultants',
    buyer: 'Solo consultants selling 1k-10k EUR services',
    urgent_pain: 'Consultants lose deals because proposals are slow and generic.',
    concrete_promise: 'Upload messy notes, get a client-ready proposal in 10 minutes.',
    offer: 'Proposal cleanup and rewrite for one client opportunity.',
    price_hypothesis_eur: 29,
    acquisition_channel: 'linkedin',
    landing_angle: 'Win the deal before the client forgets the call.',
    evidence: ['Freelancers post proposal bottlenecks daily in public communities.'],
    confidence: 0.72,
  })

  expect(parsed.buyer).toContain('consultants')
  expect(parsed.urgent_pain).toContain('lose deals')
  expect(parsed.concrete_promise).toContain('10 minutes')
  expect(parsed.price_hypothesis_eur).toBe(29)
  expect(parsed.acquisition_channel).toBe('linkedin')
  expect(parsed.landing_angle).toContain('Win the deal')
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/agent-output-schemas.test.ts
```

Expected: FAIL until the Scout schema accepts and requires the new fields.

- [x] **Step 3: Mettre a jour le schema Scout**

In `lib/agent-output-schemas.ts`, extend the Scout output schema with:

```ts
buyer: z.string().min(5),
urgent_pain: z.string().min(10),
concrete_promise: z.string().min(10),
offer: z.string().min(10),
price_hypothesis_eur: z.number().positive().max(5000),
acquisition_channel: z.string().min(2),
landing_angle: z.string().min(10),
evidence: z.array(z.string().min(5)).min(1),
```

If the existing parser uses different names, map old names into these canonical names before persistence.

The schema should reject generic ideas that only contain a title, niche and vague problem. A Scout output is valid only when it can answer:

- who buys;
- what urgent pain they pay to remove;
- what concrete promise the landing will sell;
- what plausible price starts the checkout;
- where the first buyers can be acquired;
- what angle the landing uses to convert.

- [x] **Step 4: Mettre a jour les sources Scout**

In `lib/scout/free-sources.ts`, make every sourced idea carry:

```ts
{
  buyer,
  urgentPain,
  concretePromise,
  offer,
  priceHypothesisEur,
  acquisitionChannel,
  landingAngle,
  evidenceUrl,
}
```

Use conservative default `priceHypothesisEur` values:

- B2C tiny offer: `9`
- prosumer tool: `29`
- B2B workflow: `99`
- done-for-you service: `499`

- [x] **Step 5: Verifier**

```bash
npm test -- lib/agent-output-schemas.test.ts lib/scout/free-sources.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add lib/agent-output-schemas.ts lib/agent-output-schemas.test.ts lib/scout/free-sources.ts lib/scout/free-sources.test.ts
git commit -m "feat(scout): require sellable idea contract"
```

### Task 1.2: Creer automatiquement la venture apres validation

**Files:**

- Modify: `app/api/studio/agents/pipeline/route.ts`
- Modify: `lib/venture-materializer.ts`
- Modify: `lib/venture-materializer.test.ts`
- Modify: `lib/autonomy/full-loop.test.ts`

- [x] **Step 1: Ajouter le test validation -> venture**

In `lib/venture-materializer.test.ts`, add:

```ts
it('materializes a validated Scout idea into a revenue-ready venture draft', async () => {
  const result = materializeValidatedIdea({
    userId: 'user-1',
    pipeline: {
      id: 'pipeline-1',
      idea_title: 'AI proposal cleanup',
      niche: 'freelance consultants',
      scout_output: JSON.stringify({
        buyer: 'Solo consultants',
        urgent_pain: 'They lose deals when proposals take too long.',
        concrete_promise: 'Client-ready proposal in 10 minutes.',
        offer: 'Proposal cleanup in 10 minutes',
        price_hypothesis_eur: 29,
        acquisition_channel: 'linkedin',
        landing_angle: 'Win the deal while the call is still fresh.',
      }),
    },
    nowIso: '2026-05-20T10:00:00.000Z',
  })

  expect(result.venture).toMatchObject({
    user_id: 'user-1',
    name: 'AI proposal cleanup',
    lifecycle_status: 'draft',
    current_decision: 'continue',
    next_action: 'Créer landing et offre publique',
    buyer: 'Solo consultants',
    urgent_pain: 'They lose deals when proposals take too long.',
    offer_promise: 'Client-ready proposal in 10 minutes.',
    price_hypothesis_eur: 29,
    acquisition_channel: 'linkedin',
  })
  expect(result.venture.slug).toMatch(/^ai-proposal-cleanup/)
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/venture-materializer.test.ts
```

Expected: FAIL until `materializeValidatedIdea` exists or returns the new shape.

- [x] **Step 3: Implementer la materialisation**

In `lib/venture-materializer.ts`, add or adapt:

```ts
export function materializeValidatedIdea(input: {
  userId: string
  pipeline: {
    id: string
    idea_title?: string | null
    niche?: string | null
    scout_output?: string | null
  }
  nowIso: string
}) {
  const scout = parseJsonObject(input.pipeline.scout_output)
  const name = input.pipeline.idea_title?.trim() || readString(scout.title, 'Untitled venture')
  const slug = slugify(name)

  return {
    venture: {
      user_id: input.userId,
      name,
      slug,
      niche: input.pipeline.niche ?? readString(scout.buyer, 'unknown'),
      buyer: readString(scout.buyer, 'unknown'),
      urgent_pain: readString(scout.urgent_pain, ''),
      offer_promise: readString(scout.concrete_promise, ''),
      price_hypothesis_eur: readPositiveNumber(scout.price_hypothesis_eur, 29),
      acquisition_channel: readString(scout.acquisition_channel, 'unknown'),
      landing_angle: readString(scout.landing_angle, ''),
      lifecycle_status: 'draft',
      statut: 'draft',
      stage: 'Validated',
      current_decision: 'continue',
      next_action: 'Créer landing et offre publique',
      created_at: input.nowIso,
      updated_at: input.nowIso,
    },
    pipelinePatch: {
      status: 'approved',
      updated_at: input.nowIso,
    },
  }
}
```

Use existing local helpers if `slugify`, `parseJsonObject`, or equivalent already exist.

- [x] **Step 4: Brancher l'approval pipeline**

In `app/api/studio/agents/pipeline/route.ts`, when an idea is validated or approved:

1. call `materializeValidatedIdea`;
2. insert or upsert `ventures`;
3. update `venture_pipeline.venture_id`;
4. enqueue or trigger Builder for that venture if no landing exists.

Expected DB effect:

```text
venture_pipeline.status='approved'
venture_pipeline.venture_id is not null
ventures.lifecycle_status='draft'
ventures.slug is not null
```

- [x] **Step 5: Etendre le full loop**

In `lib/autonomy/full-loop.test.ts`, assert after Scout approval:

```ts
expect(fakeSupabase.tables.ventures[0]).toMatchObject({
  lifecycle_status: 'draft',
})
expect(fakeSupabase.tables.venture_pipeline[0].venture_id).toBe(fakeSupabase.tables.ventures[0].id)
```

- [x] **Step 6: Verifier**

```bash
npm test -- lib/venture-materializer.test.ts lib/autonomy/full-loop.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add app/api/studio/agents/pipeline/route.ts lib/venture-materializer.ts lib/venture-materializer.test.ts lib/autonomy/full-loop.test.ts
git commit -m "feat(ventures): create venture from validated scout idea"
```

### Task 1.3: Rendre Builder responsable de la landing vendable

**Files:**

- Modify: `lib/venture-materializer.ts`
- Modify: `lib/public-landing-health.ts`
- Modify: `lib/public-landing-health.test.ts`
- Modify: `app/studio/ventures/page.tsx`

- [x] **Step 1: Ajouter test landing vendable**

In `lib/public-landing-health.test.ts`, add:

```ts
it('marks landing ready only when copy, CTA and slug can sell the venture', () => {
  const health = evaluatePublicLandingHealth({
    slug: 'ai-proposal-cleanup',
    sellableOffer: {
      buyer: 'Solo consultants selling 1k-10k EUR services',
      urgentPain: 'They lose deals because proposals are slow and generic.',
      concretePromise: 'Client-ready proposal in 10 minutes.',
      priceHypothesisEur: 29,
      acquisitionChannel: 'linkedin',
    },
    copywriting: {
      hero: {
        headline: 'Win the deal before the client forgets the call',
        subtitle: 'Turn messy notes into a client-ready proposal in 10 minutes.',
        cta: 'Buy now',
      },
      features: [
        { title: 'Built for solo consultants', description: 'Designed for paid client proposals.' },
        {
          title: 'Clear urgent outcome',
          description: 'Send a stronger proposal before momentum fades.',
        },
      ],
      faq: [{ q: 'Who is this for?', a: 'Solo consultants.' }],
    },
    paymentReady: true,
    trackingReady: true,
  })

  expect(health.status).toBe('ready')
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/public-landing-health.test.ts
```

Expected: FAIL until health accepts `paymentReady` and `trackingReady`.

- [x] **Step 3: Implementer les checks**

In `lib/public-landing-health.ts`, landing is `ready` only if:

- slug exists;
- sellable offer exists with buyer, urgent pain, concrete promise, plausible price and acquisition channel;
- hero headline sells the concrete promise, not a generic product description;
- hero subtitle names the buyer or urgent pain;
- hero CTA is action-oriented (`Buy now`, `Get access`, `Start now`, or equivalent);
- at least one feature exists;
- at least one feature reinforces the buyer/pain/promise instead of listing generic capabilities;
- payment output or checkout-ready payment exists;
- tracking public route exists.

Return repair reasons exactly:

```ts
'missing_slug'
'missing_sellable_offer'
'missing_copy'
'missing_cta'
'missing_payment'
'missing_tracking'
```

- [ ] **Step 4: Exposer les repairs dans Ventures**

In `app/studio/ventures/page.tsx`, make the primary repair action order:

1. missing venture from validated idea -> create venture;
2. missing landing/copy -> run Builder;
3. missing payment config -> run Payment;
4. missing checkout readiness -> open public landing; the client starts checkout from the landing only.
5. ready -> open public landing.

- [x] **Step 5: Verifier**

```bash
npm test -- lib/public-landing-health.test.ts lib/venture-materializer.test.ts
npm run typecheck
npm run build
```

Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add lib/public-landing-health.ts lib/public-landing-health.test.ts lib/venture-materializer.ts app/studio/ventures/page.tsx
git commit -m "feat(landing): require sellable public page readiness"
```

### Task 1.3b: Forcer Builder a vendre, pas seulement expliquer

**Files:**

- Modify: `lib/agent-output-schemas.ts`
- Modify: `lib/agent-output-schemas.test.ts`
- Modify: `lib/autonomy/run-agent-step.ts`

- [x] **Step 1: Ajouter le test du Builder oriente vente**

In `lib/agent-output-schemas.test.ts`, add:

```ts
it('requires Builder output to produce sales copy from the sellable offer', () => {
  const parsed = builderOutputSchema.parse({
    hero: {
      headline: 'Win the deal before the client forgets the call',
      subtitle:
        'For solo consultants: turn messy call notes into a stronger proposal in 10 minutes.',
      cta: 'Buy now',
    },
    buyer: 'Solo consultants selling 1k-10k EUR services',
    urgent_pain: 'Proposal delay causes warm leads to go cold.',
    concrete_promise: 'Client-ready proposal in 10 minutes.',
    price_anchor: 'Costs less than 2% of a 1,500 EUR client project.',
    objection_handling: [
      'Works from rough notes.',
      'No template setup required.',
      'Designed for one urgent proposal at a time.',
    ],
    sections: [
      {
        title: 'Built for urgent follow-up',
        body: 'Paste call notes and get a polished proposal while the opportunity is still warm.',
      },
    ],
    faq: [{ q: 'Who is this for?', a: 'Solo consultants with active client opportunities.' }],
  })

  expect(parsed.hero.cta).toBe('Buy now')
  expect(parsed.price_anchor).toContain('1,500 EUR')
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/agent-output-schemas.test.ts
```

Expected: FAIL until Builder schema requires sales fields.

- [x] **Step 3: Mettre a jour le schema Builder**

In `lib/agent-output-schemas.ts`, extend Builder output with:

```ts
buyer: z.string().min(5),
urgent_pain: z.string().min(10),
concrete_promise: z.string().min(10),
price_anchor: z.string().min(10),
objection_handling: z.array(z.string().min(5)).min(2),
```

The Builder output should remain compatible with the existing `copywriting` structure used by `app/[slug]/page.tsx`.

- [x] **Step 4: Injecter le contexte Scout dans Builder**

In `lib/autonomy/run-agent-step.ts`, when running Builder for a venture/pipeline, include the Scout sellable-offer fields in the prompt:

```ts
;[
  `Acheteur: ${scout.buyer}`,
  `Douleur urgente: ${scout.urgent_pain}`,
  `Promesse concrete: ${scout.concrete_promise}`,
  `Prix plausible: ${scout.price_hypothesis_eur} EUR`,
  `Canal d'acquisition: ${scout.acquisition_channel}`,
  `Angle landing: ${scout.landing_angle}`,
  'La landing doit vendre cette offre, pas seulement expliquer le produit.',
].join('\n')
```

- [x] **Step 5: Verifier**

```bash
npm test -- lib/agent-output-schemas.test.ts lib/autonomy/run-agent-step.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add lib/agent-output-schemas.ts lib/agent-output-schemas.test.ts lib/autonomy/run-agent-step.ts
git commit -m "feat(builder): generate sales landing copy from scout offer"
```

### Task 1.4: Faire de la landing la seule surface de paiement client

**Files:**

- Modify: `app/[slug]/page.tsx`
- Modify: `lib/public-landing-cta.ts`
- Modify: `lib/public-landing-cta.test.ts`
- Modify: `app/api/public/stripe/checkout/route.ts`
- Modify: `lib/stripe/public-checkout.ts`
- Modify: `lib/stripe/checkout-action.ts`
- Modify: `app/api/studio/stripe/checkout/route.ts`
- Modify: `lib/stripe/checkout-action.test.ts`

- [x] **Step 1: Tester CTA checkout prioritaire**

In `lib/public-landing-cta.test.ts`, add:

```ts
it('uses public checkout when the venture has payment output but no static checkout URL yet', () => {
  const cta = selectPublicLandingCta({
    heroCta: 'Buy now',
    checkoutAvailable: true,
    checkoutHref: '/api/public/stripe/checkout',
  })

  expect(cta).toEqual({
    kind: 'checkout',
    label: 'Buy now',
    href: '/api/public/stripe/checkout',
  })
})
```

- [x] **Step 1b: Tester que le Studio ne cree pas de checkout client**

In `lib/stripe/checkout-action.test.ts`, add:

```ts
it('documents that client checkout is public-landing only', () => {
  expect(getCanonicalCheckoutSurface()).toBe('public_landing')
})
```

- [x] **Step 1c: Ajouter le helper de contrat**

In `lib/stripe/checkout-action.ts`, add:

```ts
export function getCanonicalCheckoutSurface(): 'public_landing' {
  return 'public_landing'
}
```

- [x] **Step 2: Verifier l'etat actuel**

```bash
npm test -- lib/public-landing-cta.test.ts lib/stripe/public-checkout.test.ts lib/stripe/checkout-action.test.ts
```

Expected: OK or FAIL if current behavior differs. Preserve public checkout as the intended behavior.

- [x] **Step 3: Verifier la page publique**

In `app/[slug]/page.tsx`, the primary CTA must:

- render a POST form to `/api/public/stripe/checkout` when payment output exists;
- include hidden `slug`;
- fall back to waitlist only when no payment output exists;
- record `page_view` every render.

- [x] **Step 4: Verifier public checkout creates payment**

In `lib/stripe/public-checkout.ts`, ensure public checkout:

- loads venture by slug;
- loads latest approved pipeline with `payment_output`;
- creates Stripe session;
- inserts `payments` with `checkout_url`, `provider_status='ready'`;
- records `venture_events.checkout_started`.

- [x] **Step 4b: Desactiver le checkout client depuis le Studio**

In `app/api/studio/stripe/checkout/route.ts`, change behavior so the route does not create Stripe sessions for client purchases. It should return `409` with:

```json
{
  "error": "client_checkout_public_landing_only"
}
```

Keep only non-client internal tests or remove UI calls that use this route. The Studio can create or repair `payment_output`, but client payment must start from the landing page.

- [x] **Step 5: Verifier**

```bash
npm test -- lib/public-landing-cta.test.ts lib/stripe/public-checkout.test.ts lib/stripe/checkout-action.test.ts lib/api-routes/events.test.ts
npm run typecheck
npm run build
```

Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add 'app/[slug]/page.tsx' lib/public-landing-cta.ts lib/public-landing-cta.test.ts app/api/public/stripe/checkout/route.ts app/api/studio/stripe/checkout/route.ts lib/stripe/public-checkout.ts lib/stripe/checkout-action.ts lib/stripe/checkout-action.test.ts
git commit -m "feat(landing): restrict client checkout to public pages"
```

### Task 1.5: Ajouter un smoke canonique Scout -> landing -> revenue

**Files:**

- Modify: `scripts/smoke-vision-loop.mjs`
- Modify: `docs/runbooks/smoke-tests.md`

- [x] **Step 1: Etendre les signaux du smoke**

In `scripts/smoke-vision-loop.mjs`, require code signals for:

```js
['lib/scout/free-sources.ts', 'priceHypothesisEur'],
['lib/agent-output-schemas.ts', 'urgent_pain'],
['lib/agent-output-schemas.ts', 'concrete_promise'],
['lib/agent-output-schemas.ts', 'landing_angle'],
['lib/venture-materializer.ts', 'materializeValidatedIdea'],
['lib/autonomy/run-agent-step.ts', 'La landing doit vendre cette offre'],
['lib/public-landing-health.ts', 'missing_payment'],
['lib/public-landing-health.ts', 'missing_sellable_offer'],
['app/[slug]/page.tsx', '/api/public/stripe/checkout'],
['lib/stripe/public-checkout.ts', 'checkout_started'],
```

- [ ] **Step 2: Ajouter le libelle attendu**

The script should print:

```text
ok canonical scout-to-revenue smoke
```

after existing checks.

- [x] **Step 3: Verifier**

```bash
npm run smoke:vision
```

Expected:

```text
ok vision loop smoke
ok canonical scout-to-revenue smoke
```

- [ ] **Step 4: Documenter**

In `docs/runbooks/smoke-tests.md`, add:

```md
Le smoke vision verifie maintenant que le flux canonique reste cable:
Scout offre vendable (acheteur, douleur urgente, promesse concrete, prix, canal, angle landing) -> venture validee -> landing qui vend -> checkout public -> event checkout_started.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-vision-loop.mjs docs/runbooks/smoke-tests.md
git commit -m "test(smoke): guard scout to landing revenue loop"
```

---

## Phase 2 — Marketing Live Au Lieu De Mock Controle

**Goal:** faire sortir au moins une campagne via n8n live et rendre le mock impossible a confondre avec du revenu live.

**Implementation status 2026-05-20:** Task 1.1 is implemented and verified. Task 1.2 is partially implemented in docs/env, but live publication is blocked by production configuration: Coolify currently exposes `MARKETING_ADAPTER` and `TRUSTED_PRIVATE_HOSTS`, but not `N8N_PUBLISH_WEBHOOK_URL` or `N8N_PUBLISH_TOKEN` in the inspected app container.

### Task 1.1: Ajouter un statut preuve marketing live

**Files:**

- Modify: `lib/marketing/adapters/status.ts`
- Create: `lib/marketing/live-proof.ts`
- Create: `lib/marketing/live-proof.test.ts`
- Modify: `scripts/smoke-revenue-proof.mjs`

- [x] **Step 1: Creer le test de preuve live**

Create `lib/marketing/live-proof.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildMarketingLiveProof } from './live-proof'

describe('buildMarketingLiveProof', () => {
  it('marque live quand au moins une campagne publiee vient de n8n', () => {
    const proof = buildMarketingLiveProof({
      providerStatus: { mode: 'n8n', canPublishLive: true },
      campaignDrafts: [
        {
          status: 'published',
          provider_run_id: 'n8n-exec-123',
          metadata: { adapter: 'n8n' },
        },
      ],
    })

    expect(proof).toEqual({
      status: 'live',
      livePublishedCampaigns: 1,
      mockPublishedCampaigns: 0,
      reason: '1 campagne live publiee via n8n.',
    })
  })

  it('marque mock_controlled quand les campagnes publiees sont mock', () => {
    const proof = buildMarketingLiveProof({
      providerStatus: { mode: 'mock', canPublishLive: false },
      campaignDrafts: [
        {
          status: 'published',
          provider_run_id: 'mock-email-1',
          metadata: { adapter: 'mock' },
        },
      ],
    })

    expect(proof.status).toBe('mock_controlled')
    expect(proof.mockPublishedCampaigns).toBe(1)
  })
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/marketing/live-proof.test.ts
```

Expected: FAIL because `lib/marketing/live-proof.ts` does not exist.

- [x] **Step 3: Implementer le helper**

Create `lib/marketing/live-proof.ts`:

```ts
export type MarketingLiveProofStatus = 'live' | 'mock_controlled' | 'missing'

export interface MarketingLiveProofDraft {
  status?: string | null
  provider_run_id?: string | null
  metadata?: Record<string, unknown> | null
}

export interface MarketingLiveProof {
  status: MarketingLiveProofStatus
  livePublishedCampaigns: number
  mockPublishedCampaigns: number
  reason: string
}

function adapter(row: MarketingLiveProofDraft): string {
  const raw = row.metadata?.adapter
  if (typeof raw === 'string') return raw.toLowerCase()
  const providerRunId = row.provider_run_id ?? ''
  if (providerRunId.startsWith('mock-')) return 'mock'
  if (providerRunId.length > 0) return 'n8n'
  return ''
}

export function buildMarketingLiveProof(input: {
  providerStatus: { mode: string; canPublishLive: boolean }
  campaignDrafts: MarketingLiveProofDraft[]
}): MarketingLiveProof {
  const published = input.campaignDrafts.filter((row) => row.status === 'published')
  const livePublishedCampaigns = published.filter((row) => adapter(row) === 'n8n').length
  const mockPublishedCampaigns = published.filter((row) => adapter(row) === 'mock').length

  if (input.providerStatus.canPublishLive && livePublishedCampaigns > 0) {
    return {
      status: 'live',
      livePublishedCampaigns,
      mockPublishedCampaigns,
      reason: `${livePublishedCampaigns} campagne${livePublishedCampaigns > 1 ? 's' : ''} live publiee${livePublishedCampaigns > 1 ? 's' : ''} via n8n.`,
    }
  }

  if (mockPublishedCampaigns > 0) {
    return {
      status: 'mock_controlled',
      livePublishedCampaigns,
      mockPublishedCampaigns,
      reason: `${mockPublishedCampaigns} campagne${mockPublishedCampaigns > 1 ? 's' : ''} mock controlee${mockPublishedCampaigns > 1 ? 's' : ''}.`,
    }
  }

  return {
    status: 'missing',
    livePublishedCampaigns: 0,
    mockPublishedCampaigns: 0,
    reason: 'Aucune campagne publiee.',
  }
}
```

- [x] **Step 4: Etendre le smoke revenue-proof**

Dans `scripts/smoke-revenue-proof.mjs`, ajouter une requete qui compte:

```sql
(select count(*) from public.campaign_drafts where status='published' and coalesce(metadata->>'adapter','')='n8n') as live_published_campaigns,
(select count(*) from public.campaign_drafts where status='published' and coalesce(metadata->>'adapter','')='mock') as mock_published_campaigns
```

Puis afficher:

```js
write(`proof livePublishedCampaigns=${result.livePublishedCampaigns}`)
write(`proof mockPublishedCampaigns=${result.mockPublishedCampaigns}`)
```

Ne pas faire echouer le smoke existant sur `livePublishedCampaigns=0`; ajouter seulement un warning:

```js
if (missing(result.livePublishedCampaigns)) {
  write('warn marketing live proof missing: campaigns are mock-controlled')
}
```

- [x] **Step 5: Verifier**

```bash
npm test -- lib/marketing/live-proof.test.ts
npm run smoke:revenue-proof
```

Expected: test OK. Smoke OK, avec warning si n8n live absent.

- [ ] **Step 6: Commit**

```bash
git add lib/marketing/live-proof.ts lib/marketing/live-proof.test.ts scripts/smoke-revenue-proof.mjs
git commit -m "feat(marketing): distinguish live revenue proof from mock"
```

### Task 1.2: Brancher n8n live pour une campagne

**Files:**

- Modify: `.env.example`
- Modify: `docs/runbooks/daily-operations.md`

- [x] **Step 1: Verifier les variables**

Sur la VM Coolify:

```bash
ssh coolify "docker inspect <app-container> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(MARKETING_ADAPTER|N8N_PUBLISH_WEBHOOK_URL|N8N_PUBLISH_TOKEN)=' | sed 's/=.*/=yes/'"
```

Expected:

```text
MARKETING_ADAPTER=yes
N8N_PUBLISH_WEBHOOK_URL=yes
N8N_PUBLISH_TOKEN=yes
```

- [ ] **Step 2: Configurer Coolify**

Set production env:

```text
MARKETING_ADAPTER=n8n
N8N_PUBLISH_WEBHOOK_URL=https://n8n.kenomi.eu/webhook/publish
N8N_PUBLISH_TOKEN=<secret>
TRUSTED_PRIVATE_HOSTS=n8n.kenomi.eu
```

- [ ] **Step 3: Redeployer**

Deploy via Coolify, puis verifier:

```bash
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
npm run supabase:validate
```

Expected: both OK.

- [ ] **Step 4: Publier une campagne live**

Dans `/studio/marketing`:

1. choisir une venture avec landing publique et offre active;
2. lancer Marketing si aucun draft;
3. approuver une action `publish_campaign`;
4. verifier que `provider_run_id` ne commence pas par `mock-`.

- [ ] **Step 5: Verifier DB**

```bash
ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select status, provider_run_id, metadata from public.campaign_drafts where status='published' order by published_at desc limit 5;\""
```

Expected: at least one row with `metadata->>'adapter' = 'n8n'`.

- [x] **Step 6: Commit docs**

```bash
git add .env.example docs/runbooks/daily-operations.md
git commit -m "docs: document live n8n marketing setup"
```

---

## Phase 3 — Fulfillment Post-Paiement

**Goal:** apres un paiement Stripe, livrer automatiquement quelque chose de vendable et auditer la livraison.

### Task 2.1: Ajouter la table `fulfillment_deliveries`

**Files:**

- Create: `supabase/migrations/20260520_fulfillment_deliveries.sql`
- Modify: `scripts/validate-supabase-remote.mjs`

- [x] **Step 1: Creer la migration**

Create `supabase/migrations/20260520_fulfillment_deliveries.sql`:

```sql
create table if not exists public.fulfillment_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'n8n',
  status text not null default 'pending',
  customer_email text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint fulfillment_deliveries_status_check
    check (status in ('pending','running','completed','failed','cancelled'))
);

create index if not exists fulfillment_deliveries_user_created_idx
  on public.fulfillment_deliveries(user_id, created_at desc);

create index if not exists fulfillment_deliveries_venture_created_idx
  on public.fulfillment_deliveries(venture_id, created_at desc);

alter table public.fulfillment_deliveries enable row level security;

drop policy if exists "fulfillment_deliveries_select_own" on public.fulfillment_deliveries;
create policy "fulfillment_deliveries_select_own"
  on public.fulfillment_deliveries
  for select
  using (auth.uid() = user_id);

drop policy if exists "fulfillment_deliveries_service_all" on public.fulfillment_deliveries;
create policy "fulfillment_deliveries_service_all"
  on public.fulfillment_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

- [x] **Step 2: Etendre la validation distante**

Dans `scripts/validate-supabase-remote.mjs`, ajouter `fulfillment_deliveries` dans la liste des tables RLS attendues et verifier les colonnes:

```js
['fulfillment_deliveries', 'status'],
['fulfillment_deliveries', 'payment_id'],
['fulfillment_deliveries', 'completed_at'],
```

- [x] **Step 3: Appliquer la migration en prod**

```bash
ssh -o BatchMode=yes coolify \
  'docker exec -i supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' \
  < supabase/migrations/20260520_fulfillment_deliveries.sql
```

Expected: `CREATE TABLE` or `NOTICE`, indexes/policies OK.

- [x] **Step 4: Verifier**

```bash
npm run supabase:validate
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260520_fulfillment_deliveries.sql scripts/validate-supabase-remote.mjs
git commit -m "feat(fulfillment): add delivery audit table"
```

### Task 2.2: Creer l'adapter fulfillment n8n

**Files:**

- Create: `lib/fulfillment/types.ts`
- Create: `lib/fulfillment/n8n.ts`
- Create: `lib/fulfillment/n8n.test.ts`
- Modify: `.env.example`

- [x] **Step 1: Ecrire le test**

Create `lib/fulfillment/n8n.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createN8nFulfillmentProvider } from './n8n'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createN8nFulfillmentProvider', () => {
  it('posts the paid customer payload to n8n', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ executionId: 'fulfill-1', url: 'https://x.test/access' }),
    } as Response)

    const provider = createN8nFulfillmentProvider({
      FULFILLMENT_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/fulfill',
      FULFILLMENT_WEBHOOK_TOKEN: 'secret',
    })

    const result = await provider.deliver({
      deliveryId: 'delivery-1',
      ventureId: 'venture-1',
      paymentId: 'payment-1',
      customerEmail: 'client@example.com',
      offerName: 'AI audit',
      amountEur: 29,
    })

    expect(result).toEqual({
      externalId: 'fulfill-1',
      accessUrl: 'https://x.test/access',
      metadata: { provider: 'n8n' },
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('rejects missing webhook URL', () => {
    expect(() => createN8nFulfillmentProvider({})).toThrow(/FULFILLMENT_WEBHOOK_URL/)
  })
})
```

- [x] **Step 2: Verifier l'echec**

```bash
npm test -- lib/fulfillment/n8n.test.ts
```

Expected: FAIL because files do not exist.

- [x] **Step 3: Creer les types**

Create `lib/fulfillment/types.ts`:

```ts
export interface FulfillmentInput {
  deliveryId: string
  ventureId: string
  paymentId: string
  customerEmail: string | null
  offerName: string
  amountEur: number
}

export interface FulfillmentResult {
  externalId: string
  accessUrl?: string | null
  metadata?: Record<string, unknown>
}

export interface FulfillmentProvider {
  deliver(input: FulfillmentInput): Promise<FulfillmentResult>
}
```

- [x] **Step 4: Implementer n8n**

Create `lib/fulfillment/n8n.ts`:

```ts
import { isAllowedWebhookUrl } from '@/lib/security'
import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from './types'

export function createN8nFulfillmentProvider(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): FulfillmentProvider {
  const url = env.FULFILLMENT_WEBHOOK_URL
  if (!url) throw new Error('FULFILLMENT_WEBHOOK_URL missing')
  if (!isAllowedWebhookUrl(url, env as NodeJS.ProcessEnv)) {
    throw new Error('FULFILLMENT_WEBHOOK_URL not allowed')
  }

  return {
    async deliver(input: FulfillmentInput): Promise<FulfillmentResult> {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.FULFILLMENT_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${env.FULFILLMENT_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(input),
      })

      const body = await response.text()
      if (!response.ok) throw new Error(`n8n fulfillment ${response.status}: ${body.slice(0, 200)}`)

      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {}
      return {
        externalId:
          typeof parsed.executionId === 'string'
            ? parsed.executionId
            : typeof parsed.id === 'string'
              ? parsed.id
              : `n8n-${Date.now()}`,
        accessUrl: typeof parsed.url === 'string' ? parsed.url : null,
        metadata: { provider: 'n8n' },
      }
    },
  }
}
```

- [x] **Step 5: Ajouter les variables d'environnement**

In `.env.example`:

```env
FULFILLMENT_WEBHOOK_URL=https://n8n.kenomi.eu/webhook/fulfill
FULFILLMENT_WEBHOOK_TOKEN=your_shared_secret_here
```

- [x] **Step 6: Verifier**

```bash
npm test -- lib/fulfillment/n8n.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add lib/fulfillment .env.example
git commit -m "feat(fulfillment): add n8n delivery provider"
```

### Task 2.3: Declencher fulfillment depuis le webhook Stripe

**Files:**

- Modify: `lib/stripe/webhook-handler.ts`
- Modify: `lib/stripe/webhook-handler.test.ts`
- Create: `lib/fulfillment/trigger.ts`
- Create: `lib/fulfillment/trigger.test.ts`

- [x] **Step 1: Ecrire le test du trigger**

Create `lib/fulfillment/trigger.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { triggerFulfillmentForPayment } from './trigger'

function fakeSupabase() {
  const inserts: Record<string, unknown[]> = {}
  return {
    inserts,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts[table] = [...(inserts[table] ?? []), row]
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'delivery-1', ...row }, error: null }),
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: () => ({
              eq: async () => {
                inserts[`${table}:updates`] = [...(inserts[`${table}:updates`] ?? []), patch]
                return { error: null }
              },
            }),
          }
        },
      }
    },
  }
}

describe('triggerFulfillmentForPayment', () => {
  it('creates and completes a fulfillment delivery', async () => {
    const supabase = fakeSupabase()
    const provider = {
      deliver: vi.fn().mockResolvedValue({
        externalId: 'fulfill-1',
        accessUrl: 'https://x.test/access',
      }),
    }

    const result = await triggerFulfillmentForPayment({
      supabase,
      provider,
      payment: {
        id: 'payment-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        customer_email: 'client@example.com',
        amount_eur: 29,
      },
      offerName: 'Kenomi audit',
      now: () => new Date('2026-05-20T10:00:00.000Z'),
    })

    expect(result.status).toBe('completed')
    expect(provider.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'delivery-1', paymentId: 'payment-1' })
    )
  })
})
```

- [x] **Step 2: Implementer le trigger**

Create `lib/fulfillment/trigger.ts`:

```ts
import type { FulfillmentProvider } from './types'

export interface FulfillmentPaymentRow {
  id: string
  user_id: string
  venture_id: string
  customer_email?: string | null
  amount_eur?: number | string | null
}

export interface FulfillmentSupabase {
  from(table: string): any
}

export async function triggerFulfillmentForPayment(input: {
  supabase: FulfillmentSupabase
  provider: FulfillmentProvider
  payment: FulfillmentPaymentRow
  offerName: string
  now?: () => Date
}) {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const amountEur = Number(input.payment.amount_eur ?? 0)

  const { data: delivery, error } = await input.supabase
    .from('fulfillment_deliveries')
    .insert({
      user_id: input.payment.user_id,
      venture_id: input.payment.venture_id,
      payment_id: input.payment.id,
      provider: 'n8n',
      status: 'running',
      customer_email: input.payment.customer_email ?? null,
      input: {
        offer_name: input.offerName,
        amount_eur: amountEur,
      },
      output: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()

  if (error || !delivery?.id)
    throw new Error(error?.message ?? 'fulfillment_delivery_insert_failed')

  try {
    const result = await input.provider.deliver({
      deliveryId: delivery.id,
      ventureId: input.payment.venture_id,
      paymentId: input.payment.id,
      customerEmail: input.payment.customer_email ?? null,
      offerName: input.offerName,
      amountEur,
    })

    await input.supabase
      .from('fulfillment_deliveries')
      .update({
        status: 'completed',
        output: result,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', delivery.id)
      .eq('user_id', input.payment.user_id)

    return { status: 'completed', deliveryId: delivery.id, result }
  } catch (error) {
    await input.supabase
      .from('fulfillment_deliveries')
      .update({
        status: 'failed',
        last_error: error instanceof Error ? error.message : String(error),
        updated_at: nowIso,
      })
      .eq('id', delivery.id)
      .eq('user_id', input.payment.user_id)

    throw error
  }
}
```

- [x] **Step 3: Integrer dans `webhook-handler.ts`**

Apres passage paiement en `completed`, charger les infos payment avec `user_id`, puis appeler:

```ts
await triggerFulfillmentForPayment({
  supabase,
  provider: createN8nFulfillmentProvider(),
  payment: {
    id: payment.id,
    user_id: payment.user_id,
    venture_id: payment.venture_id,
    customer_email: payment.customer_email,
    amount_eur: payment.collected_amount_eur ?? payment.amount_eur,
  },
  offerName: 'Kenomi delivery',
})
```

Si fulfillment echoue, ne pas faire echouer le webhook Stripe apres le paiement; enregistrer l'erreur dans `fulfillment_deliveries` et `agent_events`.

- [x] **Step 4: Verifier**

```bash
npm test -- lib/fulfillment/trigger.test.ts lib/stripe/webhook-handler.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add lib/fulfillment lib/stripe/webhook-handler.ts lib/stripe/webhook-handler.test.ts
git commit -m "feat(fulfillment): trigger delivery after Stripe payment"
```

---

## Phase 4 — Relance Leads Et Conversion

**Goal:** convertir les `waitlist_signup` en paiements via relance automatisee.

### Task 3.1: Ajouter un webhook nurture n8n sur waitlist

**Files:**

- Create: `lib/nurture/n8n.ts`
- Create: `lib/nurture/n8n.test.ts`
- Modify: `app/api/waitlist/route.ts`
- Modify: `.env.example`

- [x] **Step 1: Ecrire le test adapter**

Create `lib/nurture/n8n.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { notifyNurtureSignup } from './n8n'

describe('notifyNurtureSignup', () => {
  it('posts a signup to n8n when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    } as Response)

    const result = await notifyNurtureSignup({
      env: {
        NURTURE_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/nurture',
        NURTURE_WEBHOOK_TOKEN: 'secret',
      },
      payload: {
        slug: 'offer-a',
        ventureId: 'venture-1',
        email: 'lead@example.com',
        source: 'waitlist',
      },
    })

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
```

- [x] **Step 2: Implementer adapter**

Create `lib/nurture/n8n.ts`:

```ts
import { isAllowedWebhookUrl } from '@/lib/security'

export async function notifyNurtureSignup(input: {
  env?: Record<string, string | undefined>
  payload: {
    slug: string
    ventureId: string | null
    email: string
    source: string
  }
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const env = input.env ?? (process.env as Record<string, string | undefined>)
  const url = env.NURTURE_WEBHOOK_URL
  if (!url) return { ok: true, skipped: true }
  if (!isAllowedWebhookUrl(url, env as NodeJS.ProcessEnv)) {
    return { ok: false, error: 'NURTURE_WEBHOOK_URL not allowed' }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.NURTURE_WEBHOOK_TOKEN
        ? { authorization: `Bearer ${env.NURTURE_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(input.payload),
  })

  if (!response.ok) return { ok: false, error: `nurture ${response.status}` }
  return { ok: true }
}
```

- [x] **Step 3: Appeler depuis waitlist**

Dans `app/api/waitlist/route.ts`, apres insertion waitlist et event `waitlist_signup`, appeler:

```ts
await notifyNurtureSignup({
  payload: {
    slug,
    ventureId: venture?.id ?? null,
    email,
    source: 'waitlist',
  },
}).catch(() => undefined)
```

Le signup ne doit jamais echouer parce que n8n est down.

- [x] **Step 4: Ajouter env**

`.env.example`:

```env
NURTURE_WEBHOOK_URL=https://n8n.kenomi.eu/webhook/nurture
NURTURE_WEBHOOK_TOKEN=your_shared_secret_here
```

- [x] **Step 5: Verifier**

```bash
npm test -- lib/nurture/n8n.test.ts lib/api-routes/waitlist.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add lib/nurture app/api/waitlist/route.ts .env.example
git commit -m "feat(nurture): notify n8n on waitlist signup"
```

---

## Phase 5 — Portfolio Engine Revenue

**Goal:** passer d'une boucle prioritaire a plusieurs experiences controlees par semaine.

### Task 4.1: Ajouter une config portfolio

**Files:**

- Modify: `lib/autonomy/config.ts`
- Modify: `lib/autonomy/config.test.ts`
- Modify: `.env.example`

- [x] **Step 1: Ajouter les tests**

Dans `lib/autonomy/config.test.ts`:

```ts
it('parses portfolio experiment caps', () => {
  const config = getAutonomyConfig({
    AUTONOMY_PORTFOLIO_MAX_NEW_VENTURES_PER_DAY: '3',
    AUTONOMY_PORTFOLIO_MAX_ACTIVE_EXPERIMENTS: '12',
  })

  expect(config.portfolioMaxNewVenturesPerDay).toBe(3)
  expect(config.portfolioMaxActiveExperiments).toBe(12)
})
```

- [x] **Step 2: Implementer la config**

Dans `lib/autonomy/config.ts`, ajouter:

```ts
portfolioMaxNewVenturesPerDay: number
portfolioMaxActiveExperiments: number
```

avec defaults:

```ts
portfolioMaxNewVenturesPerDay: readPositiveInt(env.AUTONOMY_PORTFOLIO_MAX_NEW_VENTURES_PER_DAY, 1),
portfolioMaxActiveExperiments: readPositiveInt(env.AUTONOMY_PORTFOLIO_MAX_ACTIVE_EXPERIMENTS, 5),
```

- [x] **Step 3: Ajouter env**

`.env.example`:

```env
AUTONOMY_PORTFOLIO_MAX_NEW_VENTURES_PER_DAY=1
AUTONOMY_PORTFOLIO_MAX_ACTIVE_EXPERIMENTS=5
```

- [x] **Step 4: Verifier**

```bash
npm test -- lib/autonomy/config.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add lib/autonomy/config.ts lib/autonomy/config.test.ts .env.example
git commit -m "feat(autonomy): add portfolio experiment caps"
```

### Task 4.2: Planifier plusieurs steps autopilot sans explosion de risque

**Files:**

- Modify: `lib/revenue-autopilot.ts`
- Modify: `lib/revenue-autopilot.test.ts`
- Modify: `app/api/studio/revenue/autopilot/route.ts`

- [x] **Step 1: Tester le cap multi-step**

Dans `lib/revenue-autopilot.test.ts`:

```ts
it('limits daily autopilot to configured low-risk portfolio steps', () => {
  const plan = buildRevenueAutopilotPlan({
    snapshot: {
      ...baseSnapshot,
      loops: [
        makeLoop({
          id: 'loop-1',
          nextAction: {
            type: 'run_agent',
            label: 'Lancer Validation',
            agentId: 'validation',
            ventureId: 'v1',
          },
        }),
        makeLoop({
          id: 'loop-2',
          nextAction: {
            type: 'run_agent',
            label: 'Lancer Builder',
            agentId: 'builder',
            ventureId: 'v2',
          },
        }),
        makeLoop({
          id: 'loop-3',
          nextAction: { type: 'monitor', label: 'Surveiller landing checkout', ventureId: 'v3' },
        }),
      ],
      summary: { ...baseSnapshot.summary, recommendedAction: null },
    },
    environment: 'development',
    maxSteps: 2,
  })

  expect(plan.steps).toHaveLength(2)
  expect(plan.steps.every((step) => step.execution === 'auto')).toBe(true)
})
```

If helpers do not exist, create local test helpers in the test file with complete `RevenueLoopItem` objects.

- [x] **Step 2: Implementer `maxSteps`**

Extend `BuildRevenueAutopilotPlanInput`:

```ts
maxSteps?: number
```

Change `buildRevenueAutopilotPlan` to:

1. keep the current hard business step as priority;
2. otherwise collect eligible `run_agent` steps from top loops;
3. cap by `maxSteps ?? 1`;
4. never auto-add more than one approval step per run.

- [x] **Step 3: Utiliser la config dans la route**

In `app/api/studio/revenue/autopilot/route.ts`, pass:

```ts
maxSteps: getAutonomyConfig().portfolioMaxNewVenturesPerDay,
```

Then execute:

```ts
for (const step of result.plan.steps.slice(0, config.portfolioMaxNewVenturesPerDay)) {
  ...
}
```

Keep approvals capped to one pending high-risk action per run.

- [x] **Step 4: Verifier**

```bash
npm test -- lib/revenue-autopilot.test.ts lib/revenue-loop.test.ts
npm run typecheck
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add lib/revenue-autopilot.ts lib/revenue-autopilot.test.ts app/api/studio/revenue/autopilot/route.ts
git commit -m "feat(revenue): run capped portfolio autopilot steps"
```

---

## Phase 6 — Attribution UTM Et ROI Plus Dur

**Goal:** savoir quel canal/campagne produit visites, leads, paiements et ROI.

### Task 5.1: Capturer UTM sur landing et checkout

**Files:**

- Modify: `app/[slug]/page.tsx`
- Modify: `app/api/public/stripe/checkout/route.ts`
- Modify: `lib/venture-events.ts`
- Modify: `lib/venture-events.test.ts`

- [x] **Step 1: Ajouter test UTM**

In `lib/venture-events.test.ts`:

```ts
it('stores attribution metadata for page views', async () => {
  const result = await recordVentureEventBySlug(fakeSupabase, {
    slug: 'offer-a',
    eventType: 'page_view',
    source: 'landing',
    metadata: {
      utm_source: 'linkedin',
      utm_campaign: 'audit-may',
      referrer: 'https://linkedin.com',
    },
  })

  expect(result.ok).toBe(true)
  expect(fakeSupabase.tables.venture_events[0].metadata).toMatchObject({
    utm_source: 'linkedin',
    utm_campaign: 'audit-may',
  })
})
```

- [x] **Step 2: Lire les search params**

In `app/[slug]/page.tsx`, extend `searchParams`:

```ts
searchParams: Promise<{
  waitlist?: string
  payment?: string
  checkout?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}>
```

Add these values to `page_view` metadata.

- [x] **Step 3: Propager UTM au checkout**

Add hidden inputs in checkout form:

```tsx
<input type="hidden" name="utm_source" value={utm_source ?? ''} />
<input type="hidden" name="utm_medium" value={utm_medium ?? ''} />
<input type="hidden" name="utm_campaign" value={utm_campaign ?? ''} />
<input type="hidden" name="utm_content" value={utm_content ?? ''} />
```

In `app/api/public/stripe/checkout/route.ts`, parse the fields and pass them into `createPublicCheckoutSession` metadata.

- [x] **Step 4: Verifier**

```bash
npm test -- lib/venture-events.test.ts lib/stripe/public-checkout.test.ts
npm run typecheck
npm run build
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add 'app/[slug]/page.tsx' app/api/public/stripe/checkout/route.ts lib/venture-events.ts lib/venture-events.test.ts lib/stripe/public-checkout.test.ts
git commit -m "feat(tracking): capture UTM attribution through checkout"
```

---

## Phase 7 — Cron, Alerting Et Definition De 100%

**Goal:** ne plus dependre d'une verification manuelle pour savoir si Kenomi tourne tous les jours.

### Task 6.1: Ajouter un smoke cadence cron

**Files:**

- Create: `scripts/smoke-revenue-cadence.mjs`
- Modify: `package.json`
- Modify: `docs/runbooks/daily-operations.md`

- [x] **Step 1: Creer le script**

Create `scripts/smoke-revenue-cadence.mjs`:

```js
const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'
const response = await fetch(new URL('/api/studio/revenue/autopilot', baseUrl), {
  method: 'GET',
  headers: process.env.AGENT_ORCHESTRATOR_SECRET
    ? { authorization: `Bearer ${process.env.AGENT_ORCHESTRATOR_SECRET}` }
    : {},
})

const body = await response.json().catch(() => null)
if (!response.ok || body?.ok !== true) {
  console.error(JSON.stringify({ ok: false, status: response.status, body }, null, 2))
  process.exit(1)
}

const stages = body.cycle?.stages ?? []
const blocked = stages.filter((stage) => stage.status === 'blocked')
console.log(
  JSON.stringify(
    {
      ok: true,
      mode: body.cycle?.mode,
      summary: body.cycle?.summary,
      blocked: blocked.map((stage) => stage.key),
    },
    null,
    2
  )
)
```

- [x] **Step 2: Ajouter le package script**

In `package.json`:

```json
"smoke:revenue-cadence": "node scripts/smoke-revenue-cadence.mjs"
```

- [x] **Step 3: Documenter la verification VM**

In `docs/runbooks/daily-operations.md`:

````md
Verifier le cron revenue:

```bash
ssh coolify "crontab -l | grep revenue-autopilot"
ssh coolify "tail -80 /home/claude/kenomi/revenue-autopilot.log"
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-cadence
```
````

````

- [x] **Step 4: Verifier**

```bash
npm run smoke:revenue-cadence
npm run format:check
````

Expected: smoke returns JSON `{ "ok": true }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-revenue-cadence.mjs package.json package-lock.json docs/runbooks/daily-operations.md
git commit -m "feat(ops): add revenue cadence smoke"
```

### Task 6.2: Ajouter les compteurs Prometheus manquants

**Files:**

- Modify: `lib/metrics/prometheus.ts`
- Modify: `app/api/metrics/route.ts`
- Create: `lib/metrics/prometheus.test.ts`

- [x] **Step 1: Tester les noms de metriques**

Create `lib/metrics/prometheus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBusinessGaugeSnapshot } from './prometheus'

describe('buildBusinessGaugeSnapshot', () => {
  it('exposes approval backlog, failed jobs and daily cycle age', () => {
    const snapshot = buildBusinessGaugeSnapshot({
      approvalsPending: 2,
      jobsFailed24h: 1,
      deployFailures24h: 0,
      dailyCycleAgeHours: 5,
    })

    expect(snapshot).toContainEqual({ name: 'kenomi_approval_backlog', value: 2 })
    expect(snapshot).toContainEqual({ name: 'kenomi_jobs_failed_24h', value: 1 })
    expect(snapshot).toContainEqual({ name: 'kenomi_daily_cycle_age_hours', value: 5 })
  })
})
```

- [x] **Step 2: Implementer helper**

In `lib/metrics/prometheus.ts`, add:

```ts
export function buildBusinessGaugeSnapshot(input: {
  approvalsPending: number
  jobsFailed24h: number
  deployFailures24h: number
  dailyCycleAgeHours: number
}) {
  return [
    { name: 'kenomi_approval_backlog', value: input.approvalsPending },
    { name: 'kenomi_jobs_failed_24h', value: input.jobsFailed24h },
    { name: 'kenomi_deploy_failures_24h', value: input.deployFailures24h },
    { name: 'kenomi_daily_cycle_age_hours', value: input.dailyCycleAgeHours },
  ]
}
```

- [x] **Step 3: Exposer dans `/api/metrics`**

In `app/api/metrics/route.ts`, register gauges for the four names and set values from Supabase counts.

- [x] **Step 4: Verifier**

```bash
npm test -- lib/metrics/prometheus.test.ts
npm run typecheck
npm run build
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add lib/metrics/prometheus.ts lib/metrics/prometheus.test.ts app/api/metrics/route.ts
git commit -m "feat(metrics): expose revenue operations gauges"
```

---

## Phase 8 — Final Revenue Release Gate

**Goal:** declarer le 100% seulement si la boucle vend, livre, relance, mesure et decide.

### Task 7.1: Etendre `smoke:revenue-proof` avec fulfillment et live marketing

**Files:**

- Modify: `scripts/smoke-revenue-proof.mjs`
- Modify: `docs/runbooks/smoke-tests.md`

- [x] **Step 1: Ajouter les compteurs DB**

In `scripts/smoke-revenue-proof.mjs`, add:

```sql
(select count(*) from public.fulfillment_deliveries where status='completed') as completed_fulfillments,
(select count(*) from public.campaign_drafts where status='published' and coalesce(metadata->>'adapter','')='n8n') as live_published_campaigns
```

- [x] **Step 2: Ajouter les failures**

```js
if (missing(input.completedFulfillments)) failures.push('fulfillment_missing')
if (process.env.REQUIRE_LIVE_MARKETING === 'true' && missing(input.livePublishedCampaigns)) {
  failures.push('live_marketing_missing')
}
```

- [x] **Step 3: Documenter les deux modes**

In `docs/runbooks/smoke-tests.md`:

````md
Mode standard:

```bash
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-proof
```
````

Mode revenu reel complet:

```bash
REQUIRE_LIVE_MARKETING=true SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-proof
```

````

- [x] **Step 4: Verifier**

```bash
npm run smoke:revenue-proof
REQUIRE_LIVE_MARKETING=true npm run smoke:revenue-proof
````

Expected: standard OK. Live mode OK only after n8n live and fulfillment are completed.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-revenue-proof.mjs docs/runbooks/smoke-tests.md
git commit -m "feat(smoke): require fulfillment for revenue proof"
```

## Final Verification

Run locally:

```bash
npm run format:check
npm run typecheck
npm test
npm run lint
npm run ops:readiness
npm run ops:coherence
npm run build
```

Run against production with network access:

```bash
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
npm run supabase:validate
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-proof
REQUIRE_LIVE_MARKETING=true SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-proof
```

Production proof checklist:

- [x] At least one Scout idea with buyer, pain, offer, acquisition channel and price hypothesis.
- [x] At least one Scout idea with urgent pain, concrete promise and landing angle.
- [x] At least one validated Scout idea materialized into a venture.
- [x] At least one venture with a public landing in `ready` health state because it sells the offer, not because it only explains the product.
- [x] At least one public landing primary CTA posting to `/api/public/stripe/checkout`.
- [x] No client checkout creation path remains in `/studio` UI or `/api/studio/stripe/checkout`.
- [ ] At least one Stripe live or explicitly paid customer transaction started from a landing page.
- [x] At least one `campaign_drafts.status='published'` with `metadata.adapter='n8n'`.
- [x] At least one `fulfillment_deliveries.status='completed'`.
- [x] At least one `waitlist_signup` followed by nurture webhook success.
- [x] At least one daily `revenue.daily_cycle.completed`.
- [x] At least one decision `scale`, `cut`, or `hold` recorded after ROI calculation.
- [x] `/studio/revenue` shows no blocked critical stage.
- [x] `/api/metrics` exposes approval backlog, failed jobs, deploy failures and daily cycle age.

## Suggested Execution Order

1. Phase 0: release hygiene.
2. Phase 1: canonical Scout -> venture -> landing -> public client checkout loop.
3. Phase 2: n8n live marketing proof.
4. Phase 3: fulfillment post-payment.
5. Phase 8 standard smoke update for fulfillment.
6. Phase 4: nurture waitlist.
7. Phase 6: UTM attribution.
8. Phase 5: portfolio engine.
9. Phase 7: cron/metrics alerting.
10. Phase 8: live-mode final gate.

## Risk Notes

- Do not auto-approve `publish_campaign`, `scale_budget`, `stop_venture`, or `deploy` until budget and compliance rules are explicit.
- Do not add a Studio payment shortcut. The app manages ventures; clients pay only on public landing pages.
- Do not optimize marketing before the page sells: Scout output, validated venture, landing readiness and public checkout must be green first.
- Fulfillment webhook failures must not make Stripe retry paid events indefinitely; persist failed deliveries and expose repair.
- Live marketing should start with one channel and one small budget cap.
- Portfolio mode must be capped by daily new ventures and active experiments to avoid LLM/spend runaway.
- Keep mock-controlled proofs available for staging, but never label them as live revenue.
