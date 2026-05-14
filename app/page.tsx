import { getAllActiveVentures, type VentureListItem } from '@/lib/queries'
import Link from 'next/link'

export const revalidate = 60

export default async function Home() {
  const ventures = await getAllActiveVentures()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold mb-2">Kenomi</h1>
        <p className="text-gray-400 mb-12">AI Venture Studio</p>

        {ventures.length === 0 ? (
          <p className="text-gray-500">Aucun projet actif pour le moment.</p>
        ) : (
          <div className="grid gap-4">
            {ventures.map((v: VentureListItem) => (
              <Link
                key={v.id}
                href={`/${v.slug}`}
                className="block p-6 bg-gray-900 rounded-2xl border border-gray-800 hover:border-violet-500 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-lg">{v.nom}</h2>
                    <span className="text-xs text-gray-500 mt-1 inline-block uppercase tracking-wider">
                      {v.type_produit?.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-violet-400 text-sm">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
