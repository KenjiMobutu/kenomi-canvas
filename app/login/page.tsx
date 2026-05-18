'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { toast } from 'sonner'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handle(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return toast.error(error.message)
    toast.success('Connecté')
    router.push('/studio')
  }

  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center px-4">
      <form onSubmit={handle} className="w-full max-w-md gradient-border rounded-xl p-8 space-y-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-8 rounded brand-logo" />
          <span className="font-extrabold tracking-tighter text-xl uppercase">Kenomi</span>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tighter">Connexion</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accédez au cockpit Next.js du Venture Studio.
          </p>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@kenomi.ai"
          className="w-full px-4 py-3 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full px-4 py-3 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-foreground text-background font-bold rounded-md disabled:opacity-50"
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="text-sm text-muted-foreground text-center">
          Pas de compte ?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Créer un compte
          </Link>
        </p>
      </form>
    </main>
  )
}
