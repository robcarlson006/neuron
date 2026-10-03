import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarkdownRenderer from '../components/MarkdownRenderer'
import type { Material, SubjectNote, SubjectNoteLink } from '../types'

interface SubjectNotesPageProps {
  subjectId: number
  materials: Material[]
}

const LINK_PATTERN = /\[\[material:(\d+)\|([^\]]+)\]\]/g

export default function SubjectNotesPage({ subjectId, materials }: SubjectNotesPageProps): React.JSX.Element {
  const navigate = useNavigate()
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const hydratedRef = useRef(false)
  const [body, setBody] = useState('')
  const [links, setLinks] = useState<SubjectNoteLink[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [slashStart, setSlashStart] = useState<number | null>(null)
  const [slashQuery, setSlashQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void window.electronAPI.getSubjectNote(subjectId).then((note: SubjectNote | null) => {
      if (cancelled) return
      setBody(note?.body || '')
      try { setLinks(note?.links_json ? JSON.parse(note.links_json) as SubjectNoteLink[] : []) } catch { setLinks([]) }
      hydratedRef.current = true
      setLoading(false)
    }).catch(() => {
      if (!cancelled) { setStatus('Could not load notes.'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [subjectId])

  const filteredMaterials = useMemo(() => {
    const query = slashQuery.trim().toLowerCase()
    return materials.filter((material) => !query || material.filename.toLowerCase().includes(query)).slice(0, 8)
  }, [materials, slashQuery])

  function collectLinks(text: string): SubjectNoteLink[] {
    const result: SubjectNoteLink[] = []
    for (const match of text.matchAll(LINK_PATTERN)) {
      const materialId = Number(match[1])
      if (materials.some((material) => material.id === materialId) && !result.some((link) => link.material_id === materialId)) {
        result.push({ material_id: materialId, label: match[2] })
      }
    }
    return result
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    const nextBody = event.target.value
    const cursor = event.target.selectionStart
    setBody(nextBody)
    const beforeCursor = nextBody.slice(0, cursor)
    const match = beforeCursor.match(/(?:^|\s)\/([^\s]*)$/)
    if (match) {
      setSlashStart(cursor - match[0].length + match[0].lastIndexOf('/'))
      setSlashQuery(match[1])
    } else {
      setSlashStart(null)
      setSlashQuery('')
    }
  }

  function insertMaterial(material: Material): void {
    const editor = editorRef.current
    if (!editor || slashStart === null) return
    const cursor = editor.selectionStart
    const token = `[[material:${material.id}|${material.filename}]]`
    const nextBody = `${body.slice(0, slashStart)}${token}${body.slice(cursor)}`
    setBody(nextBody)
    setLinks((current) => current.some((link) => link.material_id === material.id) ? current : [...current, { material_id: material.id, label: material.filename }])
    setSlashStart(null)
    setSlashQuery('')
    requestAnimationFrame(() => {
      const nextCursor = slashStart + token.length
      editor.focus()
      editor.setSelectionRange(nextCursor, nextCursor)
    })
  }

  async function save(): Promise<void> {
    setSaving(true)
    setStatus('Saving…')
    try {
      const saved = await window.electronAPI.saveSubjectNote({ subject_id: subjectId, body, links: collectLinks(body) })
      setLinks(collectLinks(body))
      setStatus(`Saved ${new Date(saved.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    } catch {
      setStatus('Could not save notes.')
    } finally { setSaving(false) }
  }

  useEffect(() => {
    if (loading || !hydratedRef.current) return
    const timer = window.setTimeout(() => { void save() }, 700)
    return () => window.clearTimeout(timer)
  }, [body])

  useEffect(() => {
    if (loading || !hydratedRef.current) return
    const flush = (): void => { void save() }
    const onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [loading, subjectId, body])

  function renderNotebookPreview(text: string): React.JSX.Element {
    const parts: React.ReactNode[] = []
    let cursor = 0
    for (const match of text.matchAll(LINK_PATTERN)) {
      const start = match.index || 0
      if (start > cursor) parts.push(<MarkdownRenderer key={`text-${cursor}`} content={text.slice(cursor, start)} />)
      const materialId = Number(match[1])
      const material = materials.find((item) => item.id === materialId)
      parts.push(material ? <button key={`link-${start}`} type="button" onClick={() => navigate(`/subject/${subjectId}/material/${material.id}`)} className="mx-0.5 rounded bg-violet-100 px-1 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200">{match[2]}</button> : <React.Fragment key={`missing-${start}`}>{match[0]}</React.Fragment>)
      cursor = start + match[0].length
    }
    if (cursor < text.length) parts.push(<MarkdownRenderer key={`text-${cursor}`} content={text.slice(cursor)} />)
    return <div className="text-sm leading-7 text-slate-700 dark:text-slate-200">{parts}</div>
  }

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">Opening notebook…</div>

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900 dark:text-white">Notebook</h3><p className="text-xs text-slate-500">Write notes anytime. Type / to link a material.</p></div>
          <div className="flex items-center gap-3"><span className={`text-[11px] ${status.startsWith('Could') ? 'text-rose-500' : 'text-slate-400'}`} aria-live="polite">{saving ? 'Saving…' : status || 'Saved automatically'}</span><button onClick={() => void save()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white">Save now</button></div>
        </div>
        <textarea ref={editorRef} value={body} onChange={handleChange} autoFocus placeholder="Start writing your lecture notes, questions, ideas, and connections…" className="min-h-[560px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-4 text-base leading-8 outline-none focus:ring-2 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        {slashStart !== null && (
          <div className="absolute left-5 right-5 top-[122px] z-20 max-h-64 overflow-y-auto rounded-lg border border-violet-200 bg-white p-1 shadow-xl dark:border-violet-800 dark:bg-slate-900">
            {filteredMaterials.length > 0 ? filteredMaterials.map((material) => <button key={material.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMaterial(material)} className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-violet-50 dark:hover:bg-violet-950/30"><span className="font-semibold text-slate-800 dark:text-slate-100">{material.filename}</span><span className="ml-2 text-slate-400">{material.file_type}</span></button>) : <div className="px-3 py-2 text-xs text-slate-400">No materials match “{slashQuery}”.</div>}
          </div>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Preview</h3>
        {body.trim() ? renderNotebookPreview(body) : <p className="text-sm text-slate-400">Your notebook preview will appear here.</p>}
        {links.length > 0 && <div className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-700"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked materials</div><div className="flex flex-wrap gap-2">{links.map((link) => <button key={link.material_id} type="button" onClick={() => navigate(`/subject/${subjectId}/material/${link.material_id}`)} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">{link.label}</button>)}</div></div>}
      </section>
    </div>
  )
}
