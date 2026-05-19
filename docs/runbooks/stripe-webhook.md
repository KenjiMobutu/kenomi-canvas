# Stripe Webhook Runbook

## Scope

Use this runbook when checkout sessions are created but payments do not appear
in `venture_events` or venture revenue is not updated.

## Endpoint

Stripe must send events to:

```text
https://lab.kenomi.eu/api/stripe/webhook
```

Required environment variables:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Signature Verification

The route rejects unsigned or invalid requests with `400`. Never disable
signature verification. Rotate `STRIPE_WEBHOOK_SECRET` if it may have leaked.

## Expected Event Flow

1. `checkout.session.completed` arrives from Stripe.
2. Handler finds `payments.stripe_session_id`.
3. `payments.status` becomes `completed`.
4. A `venture_events` row is inserted with `event_type='payment_succeeded'`.
5. `ventures.revenus_total` is recalculated from completed payments.

## Triage Checklist

1. Confirm the Stripe Dashboard webhook endpoint is `/api/stripe/webhook`.
2. Confirm the signing secret matches `STRIPE_WEBHOOK_SECRET`.
3. Check Stripe delivery logs for `400` or `500`.
4. Verify the checkout session id exists:

```sql
select id, venture_id, stripe_session_id, status
from public.payments
where stripe_session_id = '<cs_...>';
```

5. Verify event capture:

```sql
select event_type, value, metadata, occurred_at
from public.venture_events
where metadata->>'stripe_session_id' = '<cs_...>';
```

## Replay

Use Stripe Dashboard replay for failed deliveries after fixing env vars or DB
state. Do not manually insert revenue unless Stripe confirms payment success.

## Test Payment Proof

Use this flow to prove real revenue attribution in production:

1. Open `/studio/revenue`.
2. Click the priority action that creates the Stripe checkout.
3. Approve the `create_checkout` approval if production requires it.
4. Open the Checkout URL.
5. Pay with Stripe test card:

```text
4242 4242 4242 4242
```

Use any future expiry date and any CVC.

6. Verify Supabase through the Coolify VM:

```bash
ssh coolify "docker exec supabase-db-i12k0ju0ok5wk4gnts6uap03 psql -U supabase_admin -d postgres -c \"select status, provider_status, amount_eur, checkout_url is not null as has_checkout from public.payments order by created_at desc limit 5; select event_type, value, metadata->>'stripe_session_id' as session from public.venture_events where event_type='payment_succeeded' order by occurred_at desc limit 5;\""
```

Expected:

- latest payment `status='completed'`
- latest payment `provider_status='completed'`
- `has_checkout=true`
- at least one `venture_events.payment_succeeded`

## Manual Repair

If Stripe confirms payment and replay is impossible:

```sql
update public.payments
set status = 'completed', updated_at = now()
where stripe_session_id = '<cs_...>';

insert into public.venture_events (
  user_id, venture_id, event_type, source, value, metadata, occurred_at
)
select
  v.user_id,
  p.venture_id,
  'payment_succeeded',
  'stripe_manual_repair',
  (p.amount_eur * 100)::numeric,
  jsonb_build_object('stripe_session_id', p.stripe_session_id),
  now()
from public.payments p
join public.ventures v on v.id = p.venture_id
where p.stripe_session_id = '<cs_...>';
```

Then recalculate `ventures.revenus_total` from completed payments.
