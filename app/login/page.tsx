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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-8 rounded brand-logo" />
          <span className="font-extrabold tracking-tighter text-xl uppercase">Kenomi</span>
        </div>

        <form onSubmit={handle} className="bg-surface ring-1 ring-border rounded-xl p-8 space-y-4">
          <h1 className="text-xl font-bold tracking-tight">Connexion</h1>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              className="w-full mt-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mot de passe</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full mt-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent"
            />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-foreground text-background text-sm font-bold rounded-md disabled:opacity-50">
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Pas encore de compte ?{' '}
          <Link href="/signup" className="text-foreground hover:underline">Créer un compte</Link>
        </p>
      </div>
    </div>
  )
}
