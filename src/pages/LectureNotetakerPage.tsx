import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { DocumentAnnotation, Lecture, Material, Subject } from '../types'
import MarkdownRenderer from '../components/MarkdownRenderer'

export default function LectureNotetakerPage(): React.JSX.Element {
  const { subjectId: subjectIdParam, lectureId: lectureIdParam } = useParams<{ subjectId: string; lectureId: string }>()
  const navigate = useNavigate()
  const subjectId = Number(subjectIdParam)
  const lectureId = Number(lectureIdParam)
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [relatedMaterial, setRelatedMaterial] = useState<Material | null>(null)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [questions, setQuestions] = useState('')
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [questionId, setQuestionId] = useState<number | undefined>()
  const [noteId, setNoteId] = useState<number | undefined>()
  const [summaryId, setSummaryId] = useState<number | undefined>()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('Loading lecture workspace…')
  const [notesView, setNotesView] = useState<'write' | 'preview'>('write')
  const notesEditorRef = useRef<HTMLTextAreaElement>(null)
  const hydratedRef = useRef(false)
  const questionsDirtyRef = useRef(false)
  const notesDirtyRef = useRef(false)
  const summaryDirtyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const [loadedLecture, subjects, saved] = await Promise.all([
        window.electronAPI.getLecture(lectureId),
        window.electronAPI.getSubjects(),
        window.electronAPI.listDocumentAnnotations({ lectureId })
      ])
      if (cancelled) return
      setLecture(loadedLecture)
      setSubject((subjects as Subject[]).find((item) => item.id === subjectId) || null)
      if (loadedLecture?.material_id) {
        try {
          const linked = await window.electronAPI.getMaterial(loadedLecture.material_id) as Material | null
          if (!cancelled) setRelatedMaterial(linked)
        } catch { /* the notetaker remains usable when the linked material is unavailable */ }
      }
      const question = saved.find((item: DocumentAnnotation) => item.kind === 'question' && !item.deleted_at)
      const note = saved.find((item: DocumentAnnotation) => item.kind === 'cue' && !item.deleted_at)
      const savedSummary = saved.find((item: DocumentAnnotation) => item.kind === 'summary' && !item.deleted_at)
      setQuestions(question?.body || '')
      setNotes(note?.body || '')
      setSummary(savedSummary?.body || '')
      setQuestionId(question?.id)
      setNoteId(note?.id)
      setSummaryId(savedSummary?.id)
      hydratedRef.current = true
      if (loadedLecture?.audio_path) {
        try { setAudioUrl(await window.electronAPI.getLectureAudioUrl(loadedLecture.audio_path)) } catch { /* audio remains optional */ }
      }
      setStatus('Autosave is on')
    }
    void load()
    return () => { cancelled = true }
  }, [lectureId, subjectId])

  useEffect(() => {
    if (!lecture || !hydratedRef.current || !questionsDirtyRef.current) return
    const timer = window.setTimeout(() => { void saveSection('question', questions) }, 900)
    return () => window.clearTimeout(timer)
  }, [lecture, questions])

  useEffect(() => {
    if (!lecture || !hydratedRef.current || !notesDirtyRef.current) return
    const timer = window.setTimeout(() => { void saveSection('cue', notes) }, 900)
    return () => window.clearTimeout(timer)
  }, [lecture, notes])

  useEffect(() => {
    if (!lecture || !hydratedRef.current || !summaryDirtyRef.current) return
    const timer = window.setTimeout(() => { void saveSection('summary', summary) }, 900)
    return () => window.clearTimeout(timer)
  }, [lecture, summary])

  useEffect(() => {
    if (!lecture || !hydratedRef.current) return
    const flush = (): void => {
      const saves: Promise<void>[] = []
      if (questionsDirtyRef.current) saves.push(saveSection('question', questions))
      if (notesDirtyRef.current) saves.push(saveSection('cue', notes))
      if (summaryDirtyRef.current) saves.push(saveSection('summary', summary))
      void Promise.all(saves)
    }
    const onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [lecture, questions, notes, summary])

  async function saveSection(kind: 'question' | 'cue' | 'summary', body: string): Promise<void> {
    const existingId = kind === 'question' ? questionId : kind === 'cue' ? noteId : summaryId
    if (!body.trim()) {
      if (!existingId) return
      await window.electronAPI.deleteDocumentAnnotation(existingId)
      if (kind === 'question') setQuestionId(undefined)
      if (kind === 'cue') setNoteId(undefined)
      if (kind === 'summary') setSummaryId(undefined)
      if (kind === 'question') questionsDirtyRef.current = false
      if (kind === 'cue') notesDirtyRef.current = false
      if (kind === 'summary') summaryDirtyRef.current = false
      setStatus('Section cleared')
      return
    }
    const saved = await window.electronAPI.saveDocumentAnnotation({
      id: existingId,
      subject_id: subjectId,
      lecture_id: lectureId,
      kind,
      body,
      source_snapshot: lecture?.raw_transcript?.slice(0, 1000)
    })
    if (kind === 'question') setQuestionId(saved.id)
    if (kind === 'cue') setNoteId(saved.id)
    if (kind === 'summary') setSummaryId(saved.id)
    if (kind === 'question') questionsDirtyRef.current = false
    if (kind === 'cue') notesDirtyRef.current = false
    if (kind === 'summary') summaryDirtyRef.current = false
    setStatus('Saved just now')
  }

  function insertNoteFormat(prefix: string, suffix = ''): void {
    const editor = notesEditorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selected = notes.slice(start, end)
    const formatted = selected
      ? prefix === '- ' ? selected.split('\n').map((line) => `${prefix}${line}`).join('\n') : `${prefix}${selected}${suffix}`
      : `${prefix}${suffix}`
    const nextNotes = `${notes.slice(0, start)}${formatted}${notes.slice(end)}`
    setNotes(nextNotes)
    requestAnimationFrame(() => {
      editor.focus()
      const cursor = start + formatted.length
      editor.setSelectionRange(cursor, cursor)
    })
  }

  if (!lecture) return <div className="p-8 text-sm text-slate-500">{status}</div>

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/subject/${subjectId}`)} className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">← {subject?.name || 'Class'}</button>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1"><h1 className="font-semibold text-slate-900 dark:text-white truncate">{lecture.title}</h1><p className="text-[11px] text-slate-400" aria-live="polite">Cornell lecture notetaker · {status}</p></div>
        <div className="flex items-center gap-2">
          {relatedMaterial && <button onClick={() => navigate(`/subject/${subjectId}/material/${relatedMaterial.id}`)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">Open related material</button>}
          {audioUrl && <audio controls src={audioUrl} className="h-8 max-w-[300px]" />}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[340px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_220px]">
        <aside className="row-span-2 min-h-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Cues & questions</h2><span className="text-[10px] text-slate-400">Cornell cue column</span></div>
          <textarea value={questions} onChange={(event) => { questionsDirtyRef.current = true; setQuestions(event.target.value) }} onBlur={() => void saveSection('question', questions)} placeholder="Write questions, key terms, and cues while listening…" className="w-full min-h-[230px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm resize-y outline-none focus:ring-2 focus:ring-violet-400" />
          <button onClick={() => void saveSection('question', questions)} className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Save cues</button>
          <div className="mt-6 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Keep this column short and interrogative: “Why?”, “How?”, “What changes?”, or “What would I need to recall on an exam?”
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-6 md:p-10 bg-slate-100/70 dark:bg-slate-950">
          <div className="mx-auto max-w-5xl h-full min-h-[520px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-9 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lecture notes</h2><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] text-slate-400">Markdown math, bullets, and headings supported</span>{notesView === 'write' && <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertNoteFormat('- ')} aria-label="Insert bullet list" className="rounded px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">• List</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertNoteFormat('## ')} aria-label="Insert heading" className="rounded px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Heading</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertNoteFormat('$', '$')} aria-label="Insert equation" className="rounded px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">ƒx Equation</button></div>}<div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5"><button onClick={() => setNotesView('write')} className={`rounded px-2 py-1 text-[10px] font-semibold ${notesView === 'write' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' : 'text-slate-400'}`}>Write</button><button onClick={() => setNotesView('preview')} className={`rounded px-2 py-1 text-[10px] font-semibold ${notesView === 'preview' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' : 'text-slate-400'}`}>Preview</button></div></div></div>
            {notesView === 'write' ? (
          <textarea ref={notesEditorRef} value={notes} onChange={(event) => { notesDirtyRef.current = true; setNotes(event.target.value) }} onBlur={() => void saveSection('cue', notes)} placeholder="Capture the lecturer’s argument, examples, equations, and connections… Try **bold**, bullet lists, or $x^2 + y^2 = r^2$ for math." className="flex-1 w-full min-h-[420px] resize-none rounded-lg border border-transparent bg-transparent p-2 text-base leading-8 text-slate-800 dark:text-slate-100 outline-none focus:border-violet-200 dark:focus:border-violet-800" />
            ) : (
              <div className="flex-1 min-h-[420px] overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-5 text-base leading-8 text-slate-800 dark:text-slate-100">
                {notes.trim() ? <MarkdownRenderer content={notes} /> : <p className="text-sm text-slate-400">Your rendered notes will appear here.</p>}
              </div>
            )}
            <div className="flex justify-end"><button onClick={() => void saveSection('cue', notes)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Save notes</button></div>
          </div>
        </main>

        <section className="col-start-2 row-start-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Post-lecture summary</h2><button onClick={() => void saveSection('summary', summary)} className="text-xs font-semibold text-violet-600">Save summary</button></div>
          <textarea value={summary} onChange={(event) => { summaryDirtyRef.current = true; setSummary(event.target.value) }} onBlur={() => void saveSection('summary', summary)} placeholder="Close the lecture, then reconstruct the main ideas from memory…" className="min-h-0 flex-1 w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm outline-none focus:ring-2 focus:ring-violet-400" />
        </section>
      </div>

      {lecture.raw_transcript && (
        <details className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-2 text-xs">
          <summary className="cursor-pointer text-slate-500">Show generated transcript / structured notes</summary>
          <div className="max-h-48 overflow-y-auto py-3 text-slate-600 dark:text-slate-300"><MarkdownRenderer content={lecture.raw_transcript} /></div>
        </details>
      )}
    </div>
  )
}
