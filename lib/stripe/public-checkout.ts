import type Stripe from 'stripe'
import { buildCheckoutSessionParams, parsePaymentOutput } from './checkout-action'
import { syncPaymentAttribution } from '@/lib/revenue/cash-attribution'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  in(field: string, values: unknown[]): QueryBuilder
  not(field: string, operator: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>
}

export interface PublicCheckoutSupabase {
  from(table: string): QueryBuilder
}

export interface PublicCheckoutStripeClient {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{
        id: string
        url: string | null
        mode: 'payment' | 'subscription' | 'setup'
        payment_intent?: string | Stripe.PaymentIntent | null
        customer_details?: { email?: string | null } | null
      }>
    }
  }
}

interface VentureRow {
  id: string
  user_id: string
  slug: string
}

interface ProspectRow {
  id: string
  user_id: string
  contact_email?: string | null
  source?: string | null
  band?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
}

interface PipelineRow {
  id: string
  payment_output: string | null
}

interface SettingsRow {
  stripe_secret_key?: string | null
}

export interface CreatePublicCheckoutSessionInput {
  supabase: PublicCheckoutSupabase
  stripeClientFactory: (secretKey: string) => PublicCheckoutStripeClient
  slug: string
  origin: string
  envStripeSecretKey?: string | null
  customerEmail?: string | null
  prospectId?: string | null
  outreachAngle?: string | null
  attribution?: {
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    utm_content?: string | null
  }
  now?: () => Date
}

export interface CreatePublicCheckoutSessionResult {
  checkoutUrl: string
  stripeSessionId: string
  ventureId: string
  expectedAmountEur: number
}

function publicCheckoutUrls(origin: string, slug: string) {
  const safeOrigin = origin.replace(/\/$/, '')
  const encodedSlug = encodeURIComponent(slug)
  return {
    successUrl: `${safeOrigin}/${encodedSlug}?payment=success`,
    cancelUrl: `${safeOrigin}/${encodedSlug}?payment=cancelled`,
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getPaymentIntentId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

function cleanAttribution(
  attribution: CreatePublicCheckoutSessionInput['attribution']
): Record<string, string> {
  const entries = Object.entries(attribution ?? {}).flatMap(([key, value]) => {
    if (typeof value !== 'string') return []
    const cleaned = value.trim()
    return cleaned ? [[key, cleaned] as const] : []
  })
  return Object.fromEntries(entries)
}

async function maybeSingle<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

async function resolveCheckoutProspect(input: {
  supabase: PublicCheckoutSupabase
  userId: string
  prospectId: string | null
  customerEmail: string | null
}): Promise<ProspectRow | null> {
  const selectColumns = 'id, user_id, contact_email, source, band, offer_variant, outreach_angle'

  if (input.prospectId) {
    const prospect = await maybeSingle<ProspectRow>(
      input.supabase
        .from('prospects')
        .select(selectColumns)
        .eq('id', input.prospectId)
        .eq('user_id', input.userId)
    )
    if (prospect?.id) return prospect
  }

  if (!input.customerEmail) return null

  return maybeSingle<ProspectRow>(
    input.supabase
      .from('prospects')
      .select(selectColumns)
      .eq('user_id', input.userId)
      .eq('contact_email', input.customerEmail)
      .order('created_at', { ascending: false })
      .limit(1)
  )
}

export async function createPublicCheckoutSession(
  input: CreatePublicCheckoutSessionInput
): Promise<CreatePublicCheckoutSessionResult> {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const { data: ventureData, error: ventureError } = await input.supabase
    .from('ventures')
    .select('id, user_id, slug')
    .eq('slug', input.slug)
    .eq('statut', 'actif')
    .maybeSingle()

  if (ventureError) throw new Error(ventureError.message)
  const venture = ventureData as VentureRow | null
  if (!venture?.id || !venture.user_id) throw new Error('venture_not_found')

  const { data: pipelineData, error: pipelineError } = await input.supabase
    .from('venture_pipeline')
    .select('id, payment_output')
    .eq('venture_id', venture.id)
    .eq('user_id', venture.user_id)
    .in('status', ['approved', 'done'])
    .not('payment_output', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pipelineError) throw new Error(pipelineError.message)
  const pipeline = pipelineData as PipelineRow | null
  if (!pipeline?.payment_output) throw new Error('payment_configuration_missing')

  const stripeSecretKey = stringOrNull(input.envStripeSecretKey)
  if (!stripeSecretKey) {
    const { data: settingsData, error: settingsError } = await input.supabase
      .from('user_settings')
      .select('stripe_secret_key')
      .eq('user_id', venture.user_id)
      .maybeSingle()
    if (settingsError) throw new Error(settingsError.message)

    const settingsKey = stringOrNull((settingsData as SettingsRow | null)?.stripe_secret_key)
    if (!settingsKey) throw new Error('stripe_secret_key_missing')

    return createPublicCheckoutSession({
      ...input,
      envStripeSecretKey: settingsKey,
    })
  }

  const payment = parsePaymentOutput(pipeline.payment_output)
  const urls = publicCheckoutUrls(input.origin, input.slug)
  const stripe = input.stripeClientFactory(stripeSecretKey)
  const attribution = cleanAttribution(input.attribution)
  const prospectId = stringOrNull(input.prospectId)
  const customerEmail = stringOrNull(input.customerEmail)
  const prospect = await resolveCheckoutProspect({
    supabase: input.supabase,
    userId: venture.user_id,
    prospectId,
    customerEmail,
  })
  const attributedProspectId = stringOrNull(prospect?.id) ?? prospectId
  const outreachAngle =
    stringOrNull(input.outreachAngle) ??
    stringOrNull(prospect?.outreach_angle) ??
    null
  const session = await stripe.checkout.sessions.create(
    buildCheckoutSessionParams({
      payment,
      ventureId: venture.id,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      customerEmail: input.customerEmail,
      metadata: {
        source: 'public_landing',
        slug: input.slug,
        pipeline_id: pipeline.id,
        ...(attributedProspectId ? { prospect_id: attributedProspectId } : {}),
        ...(outreachAngle ? { outreach_angle: outreachAngle } : {}),
        ...attribution,
      },
    })
  )

  if (!session.url) throw new Error('stripe_checkout_url_missing')

  const expectedAmountEur = payment.price_amount / 100
  const insertPayment = await input.supabase.from('payments').insert({
    venture_id: venture.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: getPaymentIntentId(session.payment_intent),
    amount_eur: expectedAmountEur,
    expected_amount_eur: expectedAmountEur,
    collected_amount_eur: 0,
    trial_days: payment.trial_days,
    currency: payment.price_currency.toLowerCase(),
    status: 'pending',
    provider_status: 'ready',
    provider_session_id: session.id,
    customer_email: input.customerEmail ?? session.customer_details?.email ?? null,
    checkout_url: session.url,
    checkout_mode: session.mode,
    created_at: nowIso,
    updated_at: nowIso,
  })
  if (insertPayment.error) throw new Error(insertPayment.error.message)

  await syncPaymentAttribution({
    supabase: input.supabase,
    row: {
      user_id: venture.user_id,
      venture_id: venture.id,
      payment_provider: 'stripe',
      payment_reference: session.id,
      checkout_session_id: session.id,
      stripe_payment_intent_id: getPaymentIntentId(session.payment_intent),
      amount_eur: expectedAmountEur,
      currency: payment.price_currency.toLowerCase(),
      payment_status: 'pending',
      attribution_status: 'unknown',
      confidence_score: 0,
      prospect_id: attributedProspectId,
      offer_variant: stringOrNull(prospect?.offer_variant),
      outreach_angle: outreachAngle,
      source: stringOrNull(prospect?.source) ?? attribution.utm_source ?? 'public_landing',
      band: stringOrNull(prospect?.band),
      attributed_at: nowIso,
    },
  })

  const insertEvent = await input.supabase.from('venture_events').insert({
    user_id: venture.user_id,
    venture_id: venture.id,
    event_type: 'checkout_started',
    source: 'public_landing',
    value: payment.price_amount,
    metadata: {
        stripe_session_id: session.id,
        checkout_url: session.url,
        pipeline_id: pipeline.id,
        slug: input.slug,
        prospect_id: attributedProspectId,
        outreach_angle: outreachAngle,
        ...attribution,
      },
    occurred_at: nowIso,
  })
  if (insertEvent.error) throw new Error(insertEvent.error.message)

  const insertHighIntent = await input.supabase.from('venture_events').insert({
    user_id: venture.user_id,
    venture_id: venture.id,
    event_type: 'high_intent_lead',
    source: 'public_landing',
    value: payment.price_amount,
    metadata: {
        stripe_session_id: session.id,
        slug: input.slug,
        pipeline_id: pipeline.id,
        prospect_id: attributedProspectId,
        outreach_angle: outreachAngle,
        customer_email: customerEmail ?? session.customer_details?.email ?? null,
        ...attribution,
      },
    occurred_at: nowIso,
  })
  if (insertHighIntent.error) throw new Error(insertHighIntent.error.message)

  return {
    checkoutUrl: session.url,
    stripeSessionId: session.id,
    ventureId: venture.id,
    expectedAmountEur,
  }
}
