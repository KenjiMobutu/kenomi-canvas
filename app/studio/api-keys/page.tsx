'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { KeyRound, Plus, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
}

function generateKey() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return 'ken_' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export default function ApiKeys() {
  const { user } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState('')
  const [reveal, setReveal] = useState<string | null>(null)

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('api_keys')
      .select('id,name,key_prefix,last_used_at,created_at')
      .order('created_at', { ascending: false })
    setKeys((data as ApiKey[]) || [])
  }
  useEffect(() => { if (user) load() }, [user])

  async function create() {
    if (!user || !name) return
    const supabase = createSupabaseBrowser()
    const k = generateKey()
    const hash = await sha256(k)
    const { error } = await supabase.from('api_keys').insert({
      user_id: user.id, name, key_prefix: k.slice(0, 12), key_hash: hash,
    })
    if (error) return toast.error(error.message)
    setReveal(k)
    setName('')
    load()
  }

  async function del(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('api_keys').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          System / <span className="text-foreground">API Keys</span>
        </h1>
      </header>

      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {reveal && (
          <div className="gradient-border p-5 rounded-xl">
            <p className="text-xs font-bold text-accent mb-2">⚠ Copiez cette clé maintenant — elle ne sera plus affichée.</p>
            <div className="flex gap-2 items-center bg-background/50 p-3 rounded font-mono text-xs">
              <span className="flex-1 break-all">{reveal}</span>
              <button onClick={() => { navigator.clipboard.writeText(reveal); toast.success('Copié') }}>
                <Copy className="size-4" />
              </button>
            </div>
            <button onClick={() => setReveal(null)} className="text-xs text-muted-foreground mt-3 hover:text-foreground">Fermer</button>
          </div>
        )}

        <div className="bg-surface ring-1 ring-border rounded-xl p-5 flex gap-2">
          <input placeholder="Nom de la clé (ex: production)" value={name} onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <button onClick={create}
            className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center gap-2">
            <Plus className="size-3" /> Générer
          </button>
        </div>

        <div className="divide-y divide-border ring-1 ring-border rounded-xl bg-surface overflow-hidden">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-4 p-4 group">
              <div className="size-10 bg-accent/10 text-accent rounded grid place-items-center">
                <KeyRound className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{k.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}••••</p>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</p>
              <button onClick={() => del(k.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {keys.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">Aucune clé API.</p>}
        </div>
      </div>
    </div>
  )
}
