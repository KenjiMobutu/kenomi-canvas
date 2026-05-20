import { getLandingPage } from '@/lib/queries'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordVentureEventBySlugSafely, type VentureEventSupabase } from '@/lib/venture-events'
import { selectPublicLandingCta } from '@/lib/public-landing-cta'
import { notifyNurtureSignup } from '@/lib/nurture/n8n'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    waitlist?: string
    payment?: string
    checkout?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getLandingPage(slug)
  if (!data) return { title: 'Not found' }
  return {
    title: data.copywriting.meta_title ?? data.nom,
    description: data.copywriting.meta_desc ?? data.headline,
  }
}

export default async function LandingPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { waitlist, payment, checkout, utm_source, utm_medium, utm_campaign, utm_content } =
    await searchParams
  const data = await getLandingPage(slug)
  if (!data) notFound()

  const headerStore = await headers()
  await recordVentureEventBySlugSafely(supabaseAdmin as unknown as VentureEventSupabase, {
    slug,
    eventType: 'page_view',
    source: 'landing',
    metadata: {
      path: `/${slug}`,
      referrer: headerStore.get('referer') ?? '',
      user_agent: headerStore.get('user-agent') ?? '',
      utm_source: utm_source ?? '',
      utm_medium: utm_medium ?? '',
      utm_campaign: utm_campaign ?? '',
      utm_content: utm_content ?? '',
    },
  })

  const { hero, features, faq, pricing, proof, objections, sections, audience } = data.copywriting
  const { data: checkoutPipelines } = await supabaseAdmin
    .from('venture_pipeline')
    .select('id')
    .eq('venture_id', data.venture_id)
    .in('status', ['approved', 'done'])
    .not('payment_output', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const primaryCta = selectPublicLandingCta({
    heroCta: hero.cta,
    checkoutAvailable: (checkoutPipelines ?? []).length > 0,
    checkoutHref: '/api/public/stripe/checkout',
  })

  const showWaitlistSuccess = waitlist === 'ok'
  const showPaymentSuccess = payment === 'success'
  const showPaymentCancel = payment === 'cancelled'
  const showCheckoutError = checkout === 'error'

  if (showPaymentCancel || showCheckoutError) {
    await recordVentureEventBySlugSafely(supabaseAdmin as unknown as VentureEventSupabase, {
      slug,
      eventType: 'checkout_abandoned',
      source: 'landing',
      metadata: {
        path: `/${slug}`,
        reason: showPaymentCancel ? 'payment_cancelled' : 'checkout_error',
        utm_source: utm_source ?? '',
        utm_medium: utm_medium ?? '',
        utm_campaign: utm_campaign ?? '',
        utm_content: utm_content ?? '',
      },
    })

    await notifyNurtureSignup({
      payload: {
        eventType: 'checkout_abandoned',
        slug,
        ventureId: data.venture_id,
        email: null,
        source: 'landing',
        utm_source: utm_source ?? '',
        utm_medium: utm_medium ?? '',
        utm_campaign: utm_campaign ?? '',
        utm_content: utm_content ?? '',
        pricingLabel: pricing?.label ?? null,
      },
    }).catch(() => undefined)
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {(showWaitlistSuccess || showPaymentSuccess || showPaymentCancel || showCheckoutError) && (
        <div
          className={`border-b px-4 py-3 text-center text-sm font-medium ${
            showPaymentCancel || showCheckoutError
              ? 'border-amber-800 bg-amber-950/70 text-amber-200'
              : 'border-emerald-800 bg-emerald-950/70 text-emerald-200'
          }`}
        >
          {showWaitlistSuccess &&
            'Inscription confirmée ! Vous serez notifié en priorité au lancement.'}
          {showPaymentSuccess && 'Paiement reçu ! Bienvenue — vous recevrez vos accès par email.'}
          {showPaymentCancel && 'Paiement annulé. Revenez quand vous voulez.'}
          {showCheckoutError && 'Checkout indisponible pour le moment. Rejoignez la waitlist.'}
        </div>
      )}

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm text-neutral-500 transition-colors hover:text-white">
          ← Kenomi
        </Link>
        <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Vente publique autonome
        </div>
      </nav>

      <section className="border-b border-neutral-900">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:items-start lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900 bg-emerald-950/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
              Offre live
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              {hero.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">{hero.subtitle}</p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              {primaryCta.kind === 'checkout' && !showWaitlistSuccess ? (
                <form action={primaryCta.href} method="POST" className="inline-flex">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="utm_source" value={utm_source ?? ''} />
                  <input type="hidden" name="utm_medium" value={utm_medium ?? ''} />
                  <input type="hidden" name="utm_campaign" value={utm_campaign ?? ''} />
                  <input type="hidden" name="utm_content" value={utm_content ?? ''} />
                  <button
                    type="submit"
                    className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-emerald-500 px-6 py-3 text-base font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
                  >
                    {primaryCta.label}
                  </button>
                </form>
              ) : (
                <a
                  href={showWaitlistSuccess ? undefined : primaryCta.href}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-emerald-500 px-6 py-3 text-base font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
                >
                  {showWaitlistSuccess ? 'Inscrit' : primaryCta.label}
                </a>
              )}
              <a
                href="#waitlist"
                className="inline-flex min-w-[220px] items-center justify-center rounded-lg border border-neutral-800 px-6 py-3 text-base font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                Recevoir le lancement
              </a>
            </div>

            <dl className="mt-10 grid gap-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-neutral-500">Acheteur</dt>
                <dd className="mt-2 text-sm leading-6 text-neutral-200">
                  {audience?.for?.[0] ?? data.nom}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-neutral-500">Offre</dt>
                <dd className="mt-2 text-sm leading-6 text-neutral-200">
                  {pricing?.label ?? 'Offre sur demande'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Raison d acheter
                </dt>
                <dd className="mt-2 text-sm leading-6 text-neutral-200">
                  {proof?.bullets?.[0] ?? hero.subtitle}
                </dd>
              </div>
            </dl>
          </div>

          <aside className="rounded-xl border border-neutral-900 bg-neutral-900 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="text-sm text-neutral-400">Offre publique</div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {pricing?.label ?? 'Tarification en préparation'}
            </div>
            {pricing?.price_anchor ? (
              <p className="mt-3 text-sm leading-6 text-neutral-300">{pricing.price_anchor}</p>
            ) : null}

            {pricing?.included?.length ? (
              <div className="mt-6 border-t border-neutral-900 pt-6">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Inclus</div>
                <ul className="mt-4 space-y-3 text-sm text-neutral-200">
                  {pricing.included.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 border-t border-neutral-900 pt-6">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                Pourquoi croire cette offre
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                {proof?.headline ?? hero.subtitle}
              </p>
            </div>
          </aside>
        </div>
      </section>

      {sections?.length ? (
        <section className="border-b border-neutral-900">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-8 lg:grid-cols-2">
              {sections.map((section) => (
                <div key={section.title} className="border-b border-neutral-900 pb-6 lg:border-b-0">
                  <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-neutral-300">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {features?.length > 0 && (
        <section className="border-b border-neutral-900">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-3xl font-semibold text-white">Ce que vous achetez réellement</h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">
                Une offre structurée pour réduire le délai entre un signal d achat et votre action
                commerciale.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {features.map((f, i) => (
                <article
                  key={i}
                  className="rounded-lg border border-neutral-900 bg-neutral-900 p-6"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">{f.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {(audience?.for?.length || audience?.not_for?.length) && (
        <section className="border-b border-neutral-900">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold text-white">Pour qui</h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-neutral-300">
                {(audience?.for ?? []).map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Quand ne pas l acheter</h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-neutral-300">
                {(audience?.not_for ?? []).map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-neutral-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {(proof?.headline || proof?.bullets?.length) && (
        <section className="border-b border-neutral-900">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold text-white">
                Pourquoi cette offre est crédible
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">
                {proof?.headline ?? hero.subtitle}
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {(proof?.bullets ?? []).map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-neutral-900 bg-neutral-900 p-5 text-sm leading-6 text-neutral-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {objections?.length ? (
        <section className="border-b border-neutral-900">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold text-white">Objections traitées avant achat</h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">
                La page doit lever les doutes principaux avant de demander un paiement ou un email.
              </p>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {objections.map((item, index) => (
                <article
                  key={`${item.objection}-${index}`}
                  className="rounded-lg border border-neutral-900 bg-neutral-900 p-6"
                >
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {item.objection}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-neutral-200">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-8 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold text-white">
                Passez à l achat ou demandez le lancement
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">
                La voie principale est le checkout public. Si vous n êtes pas prêt maintenant,
                laissez votre email pour relance ciblée.
              </p>
            </div>
            <div className="mt-6 lg:mt-0">
              {primaryCta.kind === 'checkout' && !showWaitlistSuccess ? (
                <form action={primaryCta.href} method="POST" className="inline-flex">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="utm_source" value={utm_source ?? ''} />
                  <input type="hidden" name="utm_medium" value={utm_medium ?? ''} />
                  <input type="hidden" name="utm_campaign" value={utm_campaign ?? ''} />
                  <input type="hidden" name="utm_content" value={utm_content ?? ''} />
                  <button
                    type="submit"
                    className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-emerald-400 px-6 py-3 text-base font-semibold text-neutral-950 transition-colors hover:bg-emerald-300"
                  >
                    {primaryCta.label}
                  </button>
                </form>
              ) : (
                <a
                  href={showWaitlistSuccess ? undefined : primaryCta.href}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-emerald-400 px-6 py-3 text-base font-semibold text-neutral-950 transition-colors hover:bg-emerald-300"
                >
                  {showWaitlistSuccess ? 'Inscrit' : primaryCta.label}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="waitlist" className="mx-auto max-w-xl px-6 py-20 text-center">
        {showWaitlistSuccess ? (
          <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-8">
            <h2 className="text-2xl font-semibold text-emerald-200">Vous êtes sur la liste</h2>
            <p className="mt-3 text-neutral-300">
              On vous contacte dès que {data.nom} est disponible.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-3xl font-semibold text-white">Recevoir le lancement</h2>
            <p className="mt-4 text-base leading-7 text-neutral-300">
              Si vous n achetez pas maintenant, laissez un email pour la relance et les offres de
              lancement.
            </p>
            <form action="/api/waitlist" method="POST" className="mx-auto mt-8 flex max-w-md gap-3">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="utm_source" value={utm_source ?? ''} />
              <input type="hidden" name="utm_medium" value={utm_medium ?? ''} />
              <input type="hidden" name="utm_campaign" value={utm_campaign ?? ''} />
              <input type="hidden" name="utm_content" value={utm_content ?? ''} />
              <input
                type="email"
                name="email"
                placeholder="votre@email.com"
                required
                className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg bg-white px-6 py-3 font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                S&apos;inscrire
              </button>
            </form>
          </>
        )}
      </section>

      {faq?.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-white">Questions fréquentes</h2>
          <div className="mt-10 space-y-4">
            {faq.map((item, i) => (
              <div key={i} className="rounded-lg border border-neutral-900 bg-neutral-900 p-6">
                <h3 className="font-semibold text-white">{item.q}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-300">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-neutral-900 py-8 text-center text-sm text-neutral-600">
        Propulsé par{' '}
        <Link href="/" className="text-neutral-400 hover:text-white">
          Kenomi
        </Link>
      </footer>
    </main>
  )
}
