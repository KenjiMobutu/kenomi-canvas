import { getLandingPage } from '@/lib/queries'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordVentureEventBySlugSafely, type VentureEventSupabase } from '@/lib/venture-events'
import { selectPublicLandingCta } from '@/lib/public-landing-cta'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ waitlist?: string; payment?: string }>
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
  const { waitlist, payment } = await searchParams
  const data = await getLandingPage(slug)
  if (!data) notFound()

  const headerStore = await headers()
  await recordVentureEventBySlugSafely(supabaseAdmin as unknown as VentureEventSupabase, {
    slug,
    eventType: 'page_view',
    source: 'landing',
    metadata: {
      path: `/${slug}`,
      referer: headerStore.get('referer') ?? '',
      user_agent: headerStore.get('user-agent') ?? '',
    },
  })

  const { hero, features, faq } = data.copywriting
  const { data: paymentRows } = await supabaseAdmin
    .from('payments')
    .select('checkout_url, provider_status, status, created_at')
    .eq('venture_id', data.venture_id)
    .not('checkout_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const checkoutPayment = (paymentRows ?? []).find((payment) =>
    ['ready', 'pending'].includes(String(payment.provider_status ?? payment.status))
  )
  const primaryCta = selectPublicLandingCta({
    heroCta: hero.cta,
    checkoutUrl: checkoutPayment?.checkout_url ?? null,
    providerStatus: checkoutPayment?.provider_status ?? checkoutPayment?.status ?? null,
  })

  const showWaitlistSuccess = waitlist === 'ok'
  const showPaymentSuccess = payment === 'success'
  const showPaymentCancel = payment === 'cancelled'

  return (
    <main className="min-h-screen">
      {/* BANNIÈRE CONFIRMATION */}
      {(showWaitlistSuccess || showPaymentSuccess || showPaymentCancel) && (
        <div
          className={`px-4 py-3 text-center text-sm font-medium ${
            showPaymentCancel
              ? 'bg-yellow-900/50 border-b border-yellow-800 text-yellow-300'
              : 'bg-green-900/50 border-b border-green-800 text-green-300'
          }`}
        >
          {showWaitlistSuccess &&
            'Inscription confirmée ! Vous serez notifié en priorité au lancement.'}
          {showPaymentSuccess && 'Paiement reçu ! Bienvenue — vous recevrez vos accès par email.'}
          {showPaymentCancel && 'Paiement annulé. Revenez quand vous voulez.'}
        </div>
      )}

      {/* NAV */}
      <nav className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <Link href="/" className="text-gray-500 text-sm hover:text-white transition-colors">
          ← Kenomi
        </Link>
      </nav>

      {/* HERO */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-950 border border-violet-800 rounded-full px-4 py-1 text-violet-300 text-sm mb-8">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
          Nouveau projet Kenomi
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
          {hero.headline}
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-xl mx-auto">{hero.subtitle}</p>
        <a
          href={showWaitlistSuccess ? undefined : primaryCta.href}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors"
        >
          {showWaitlistSuccess ? 'Inscrit !' : `${primaryCta.label} →`}
        </a>
      </section>

      {/* FEATURES */}
      {features?.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-12">Pourquoi choisir {data.nom} ?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* WAITLIST */}
      <section id="waitlist" className="max-w-xl mx-auto px-6 py-20 text-center">
        {showWaitlistSuccess ? (
          <div className="bg-green-900/30 border border-green-800 rounded-2xl p-8">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2 text-green-300">Vous êtes sur la liste !</h2>
            <p className="text-gray-400">On vous contacte dès que {data.nom} est disponible.</p>
          </div>
        ) : (
          <>
            <h2 className="text-3xl font-bold mb-4">Rejoignez la liste d&apos;attente</h2>
            <p className="text-gray-400 mb-8">Soyez parmi les premiers à accéder à {data.nom}.</p>
            <form action="/api/waitlist" method="POST" className="flex gap-3 max-w-md mx-auto">
              <input type="hidden" name="slug" value={slug} />
              <input
                type="email"
                name="email"
                placeholder="votre@email.com"
                required
                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
              />
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors whitespace-nowrap"
              >
                S&apos;inscrire
              </button>
            </form>
          </>
        )}
      </section>

      {/* FAQ */}
      {faq?.length > 0 && (
        <section className="max-w-2xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-10">Questions fréquentes</h2>
          <div className="space-y-4">
            {faq.map((item, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-2">{item.q}</h3>
                <p className="text-gray-400 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="border-t border-gray-900 py-8 text-center text-gray-600 text-sm">
        Propulsé par{' '}
        <Link href="/" className="text-gray-400 hover:text-white">
          Kenomi
        </Link>
      </footer>
    </main>
  )
}
