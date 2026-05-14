'use client'
import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { FileText, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

interface Doc {
  id: string
  name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

function fmtSize(b: number | null) {
  if (!b) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function Documents() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Doc | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
    const list = (data as Doc[]) || []
    setDocs(list)
    setSelected((prev) => (prev ? (list.find((d) => d.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)))
  }
  useEffect(() => { if (user) load() }, [user])

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    const supabase = createSupabaseBrowser()
    const path = `${user.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { setUploading(false); return toast.error(error.message) }
    await supabase.from('documents').insert({
      user_id: user.id, name: file.name, storage_path: path,
      mime_type: file.type, size_bytes: file.size,
    })
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    toast.success('Document uploadé')
    load()
  }

  async function del(d: Doc) {
    const supabase = createSupabaseBrowser()
    await supabase.storage.from('documents').remove([d.storage_path])
    await supabase.from('documents').delete().eq('id', d.id)
    load()
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          System / <span className="text-foreground">Documents</span>
        </h1>
        <label className="px-4 py-1.5 bg-foreground text-background text-xs font-bold rounded-full flex items-center gap-2 cursor-pointer">
          <Upload className="size-3" /> {uploading ? 'Upload...' : 'Upload'}
          <input ref={fileRef} type="file" className="hidden" onChange={upload} disabled={uploading} />
        </label>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Knowledge Base</p>
            <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Documents Studio</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          <div className="divide-y divide-border ring-1 ring-border rounded-xl bg-surface overflow-hidden">
            {docs.map((d) => (
              <button key={d.id} onClick={() => setSelected(d)}
                className={`w-full text-left flex items-center gap-4 p-4 hover:bg-white/[0.03] ${selected?.id === d.id ? 'bg-white/[0.04]' : ''}`}>
                <div className="size-10 bg-accent/10 text-accent rounded grid place-items-center">
                  <FileText className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{d.mime_type || '—'} · {fmtSize(d.size_bytes)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</p>
              </button>
            ))}
            {docs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                Aucun document. Uploadez votre premier fichier.
              </p>
            )}
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            {selected ? (
              <>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Document details</p>
                <h3 className="text-xl font-extrabold tracking-tighter mt-2 break-words">{selected.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {selected.mime_type || '—'} · {fmtSize(selected.size_bytes)} · {new Date(selected.created_at).toLocaleDateString()}
                </p>
                <button onClick={() => del(selected)}
                  className="mt-5 w-full px-4 py-2 ring-1 ring-border text-xs font-bold rounded-md flex items-center justify-center gap-2 hover:text-destructive">
                  <Trash2 className="size-4" /> Supprimer
                </button>
              </>
            ) : (
              <div className="min-h-[200px] grid place-items-center text-center">
                <p className="text-sm text-muted-foreground">Sélectionnez un document pour voir ses détails.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
