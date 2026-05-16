'use client'
import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/studio-utils'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, rose, amber,
} from '@/lib/ck-vars'
import { isAllowedMimeType, isAllowedFileSize, sanitizeFilename, MAX_UPLOAD_BYTES } from '@/lib/validation'

interface Doc {
  id: string
  name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

function fmtSize(b: number | null) {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function mimeIcon(mime: string | null) {
  if (!mime) return '📄'
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('image')) return '🖼'
  if (mime.includes('video')) return '🎬'
  if (mime.includes('audio')) return '🎵'
  if (mime.includes('zip') || mime.includes('tar')) return '📦'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('text')) return '📄'
  return '📁'
}

export default function DocumentsPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Doc | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('documents').select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    const list = (data as Doc[]) || []
    setDocs(list)
    setSelected(prev => prev ? (list.find(d => d.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null))
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!isAllowedFileSize(file.size)) {
      toast.error(`Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    if (!isAllowedMimeType(file.type)) {
      toast.error(`Type de fichier non autorisé : ${file.type || 'inconnu'}`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(true)
    const safeName = sanitizeFilename(file.name)
    const path = `${user.id}/${Date.now()}_${safeName}`

    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      return toast.error(error.message)
    }

    const { error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name: safeName,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (dbError) {
      await supabase.storage.from('documents').remove([path])
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      return toast.error(dbError.message)
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    toast.success('Document uploadé')
    load()
  }

  async function del(d: Doc) {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([d.storage_path])
    if (storageError) {
      return toast.error(`Suppression storage échouée : ${storageError.message}`)
    }

    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', d.id)
      .eq('user_id', user!.id)
    if (dbError) {
      return toast.error(`Suppression base échouée : ${dbError.message}`)
    }

    toast.success('Document supprimé')
    if (selected?.id === d.id) setSelected(null)
    load()
  }

  async function download(d: Doc) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 60)
    if (error || !data?.signedUrl) return toast.error('Impossible de générer le lien')
    window.open(data.signedUrl, '_blank')
  }

  const uploadAction = (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 999,
      background: accent, color: '#0b0d12',
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
      cursor: uploading ? 'wait' : 'pointer',
      opacity: uploading ? 0.7 : 1,
    }}>
      ↑ {uploading ? 'Upload…' : 'Upload'}
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={upload} disabled={uploading} />
    </label>
  )

  return (
    <CkShell breadcrumb="System / Documents" title="Knowledge Base" subtitle={`${docs.length} fichier${docs.length !== 1 ? 's' : ''}`} actions={uploadAction}>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 16 }}>
        {/* File list */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden' }}>
          {docs.map((d, i) => (
            <button key={d.id} onClick={() => setSelected(d)} className="ck-row-hover" style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              borderBottom: i < docs.length - 1 ? `1px solid ${line}` : 'none',
              background: selected?.id === d.id ? surface2 : 'transparent',
              cursor: 'pointer', transition: 'background .1s',
            }}>
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                background: accent + '14',
                display: 'grid', placeItems: 'center', fontSize: 18,
              }}>{mimeIcon(d.mime_type)}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted2, marginTop: 2 }}>
                  {d.mime_type || '—'} · {fmtSize(d.size_bytes)}
                </div>
              </div>

              <div style={{ fontSize: 11, color: muted2, flexShrink: 0 }}>
                {new Date(d.created_at).toLocaleDateString('fr-FR')}
              </div>
            </button>
          ))}
          {docs.length === 0 && (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
              <p style={{ fontSize: 13, color: muted2 }}>Aucun document. Uploadez votre premier fichier.</p>
            </div>
          )}
        </div>

        {/* Aside */}
        <aside style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 20, height: 'fit-content' }}>
          {selected ? (
            <>
              <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 16 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: accent }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Document details</div>
                <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '-.01em', color: text, wordBreak: 'break-word' }}>
                  {selected.name}
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {([
                  ['Type',  selected.mime_type || '—'],
                  ['Taille', fmtSize(selected.size_bytes)],
                  ['Ajouté', new Date(selected.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ padding: '9px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: text, marginTop: 3, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => download(selected)} style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8,
                  background: amber + '14', color: amber,
                  border: `1px solid ${amber}40`, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>↓ Télécharger</button>
                <button onClick={() => del(selected)} style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8,
                  background: rose + '14', color: rose,
                  border: `1px solid ${rose}40`, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>🗑 Supprimer</button>
              </div>
            </>
          ) : (
            <div style={{ minHeight: 200, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez un document.</p>
            </div>
          )}
        </aside>
      </div>
    </CkShell>
  )
}
