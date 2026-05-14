'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

export default function Settings() {
  const { user } = useAuth()
  const [url, setUrl] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setUrl(data?.ollama_base_url || 'http://192.168.0.14:11434')
        setModel(data?.ollama_model || 'qwen3:8b')
      })
  }, [user])

  async function save() {
    if (!user) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('user_settings')
      .upsert({ user_id: user.id, ollama_base_url: url, ollama_model: model })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Paramètres sauvegardés')
  }

  return (
    <div>
      <header className="h-16 border-b border-border flex items-center px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          System / <span className="text-foreground">Settings</span>
        </h1>
      </header>

      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tighter">Configuration Ollama</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Le serveur de chat appelle votre instance Ollama. L'URL doit être accessible depuis l'infrastructure Kenomi (utilisez un tunnel ou exposez via Coolify).
          </p>
        </div>

        <div className="bg-surface ring-1 ring-border p-6 rounded-xl space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Base URL Ollama</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.0.14:11434"
              className="w-full mt-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent font-mono" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modèle par défaut</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3:8b"
              className="w-full mt-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent font-mono" />
          </div>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md disabled:opacity-50">
            {saving ? '...' : 'Sauvegarder'}
          </button>
        </div>

        <div className="bg-surface ring-1 ring-border p-6 rounded-xl">
          <h3 className="font-semibold mb-2">Compte</h3>
          <p className="text-sm text-muted-foreground">Email : <span className="font-mono text-foreground">{user?.email}</span></p>
        </div>
      </div>
    </div>
  )
}
