import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarkdownRenderer from '../components/MarkdownRenderer'
import NoteAIHelper from '../components/notes/NoteAIHelper'
import type { Material, NotebookPage, SubjectNoteLink } from '../types'

interface SubjectNotesPageProps {
  subjectId: number
  subjectName?: string
  materials: Material[]
}

const LINK_PATTERN = /\[\[material:(\d+)\|([^\]]+)\]\]/g

export default function SubjectNotesPage({ subjectId, subjectName, materials }: SubjectNotesPageProps): React.JSX.Element {
  const navigate = useNavigate()
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const hydratedRef = useRef(false)

  // Pages state
  const [pages, setPages] = useState<NotebookPage[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [body, setBody] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [links, setLinks] = useState<SubjectNoteLink[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [formatting, setFormatting] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [paperStyle, setPaperStyle] = useState<'lined' | 'grid' | 'blank'>('lined')
  const [flipDirection, setFlipDirection] = useState<'left' | 'right' | null>(null)

  // Autocomplete state
  const [slashStart, setSlashStart] = useState<number | null>(null)
  const [slashQuery, setSlashQuery] = useState('')

  // Load pages on mount or subject change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    hydratedRef.current = false

    const loadPages = async (): Promise<void> => {
      try {
        let loadedPages: NotebookPage[] = []
        if (window.electronAPI?.getNotebookPages) {
          loadedPages = await window.electronAPI.getNotebookPages(subjectId)
        } else if (window.electronAPI?.getSubjectNote) {
          const legacy = await window.electronAPI.getSubjectNote(subjectId)
          loadedPages = [{
            id: 1,
            subject_id: subjectId,
            page_number: 1,
            title: 'Page 1',
            body: legacy?.body || '',
            links_json: legacy?.links_json || '[]',
            created_at: legacy?.created_at || new Date().toISOString(),
            updated_at: legacy?.updated_at || new Date().toISOString()
          }]
        }

        if (cancelled) return

        if (loadedPages.length === 0) {
          loadedPages = [{
            id: 1,
            subject_id: subjectId,
            page_number: 1,
            title: 'Page 1',
            body: '',
            links_json: '[]',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]
        }

        setPages(loadedPages)
        setCurrentPageIndex(0)
        const first = loadedPages[0]
        setBody(first.body || '')
        setPageTitle(first.title || 'Page 1')
        try {
          setLinks(first.links_json ? JSON.parse(first.links_json) as SubjectNoteLink[] : [])
        } catch {
          setLinks([])
        }
        hydratedRef.current = true
        setLoading(false)
      } catch {
        if (!cancelled) {
          setStatus('Could not load notebook pages.')
          setLoading(false)
        }
      }
    }

    void loadPages()
    return () => { cancelled = true }
  }, [subjectId])

  const currentPage = pages[currentPageIndex] || null

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

  // Active save function
  async function saveCurrentPage(customBody?: string, customTitle?: string): Promise<void> {
    if (!currentPage || !hydratedRef.current) return
    const textToSave = typeof customBody === 'string' ? customBody : body
    const titleToSave = typeof customTitle === 'string' ? customTitle : pageTitle
    const calculatedLinks = collectLinks(textToSave)

    setSaving(true)
    setStatus('Saving…')
    try {
      if (window.electronAPI?.saveNotebookPage) {
        const saved = await window.electronAPI.saveNotebookPage({
          id: currentPage.id,
          subject_id: subjectId,
          page_number: currentPage.page_number,
          title: titleToSave,
          body: textToSave,
          links: calculatedLinks
        })
        setLinks(calculatedLinks)
        setPages((prev) => prev.map((p, idx) => idx === currentPageIndex ? { ...p, ...saved } : p))
        const timeStr = new Date(saved.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setStatus(`Saved ${timeStr}`)
      } else if (window.electronAPI?.saveSubjectNote) {
        const saved = await window.electronAPI.saveSubjectNote({
          subject_id: subjectId,
          body: textToSave,
          links: calculatedLinks
        })
        setLinks(calculatedLinks)
        setStatus(`Saved ${new Date(saved.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
      }
    } catch {
      setStatus('Could not save page.')
    } finally {
      setSaving(false)
    }
  }

  // Debounced auto-save
  useEffect(() => {
    if (loading || !hydratedRef.current || !currentPage) return
    const timer = window.setTimeout(() => {
      void saveCurrentPage()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [body, pageTitle])

  // Save on tab switch / window unload
  useEffect(() => {
    if (loading || !hydratedRef.current) return
    const flush = (): void => { void saveCurrentPage() }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [loading, currentPageIndex, body, pageTitle])

  // Handle page switching with immediate save flush
  async function goToPage(targetIndex: number, direction: 'left' | 'right'): Promise<void> {
    if (targetIndex < 0 || targetIndex >= pages.length || targetIndex === currentPageIndex) return

    // Flush current page changes before switching
    await saveCurrentPage()

    setFlipDirection(direction)
    const targetPage = pages[targetIndex]
    setCurrentPageIndex(targetIndex)
    setBody(targetPage.body || '')
    setPageTitle(targetPage.title || `Page ${targetPage.page_number}`)
    try {
      setLinks(targetPage.links_json ? JSON.parse(targetPage.links_json) as SubjectNoteLink[] : [])
    } catch {
      setLinks([])
    }
    setPreviousDraft(null)

    // Clear flip animation class after duration
    setTimeout(() => {
      setFlipDirection(null)
    }, 300)
  }

  async function handleAddPage(): Promise<void> {
    await saveCurrentPage()
    try {
      setSaving(true)
      setStatus('Adding page…')
      if (window.electronAPI?.createNotebookPage) {
        const afterNum = currentPage?.page_number || pages.length
        const newPage = await window.electronAPI.createNotebookPage(subjectId, afterNum)
        const updated = await window.electronAPI.getNotebookPages(subjectId)
        setPages(updated)
        const newIndex = updated.findIndex((p) => p.id === newPage.id)
        if (newIndex >= 0) {
          setCurrentPageIndex(newIndex)
          setBody(newPage.body || '')
          setPageTitle(newPage.title || `Page ${newPage.page_number}`)
          setLinks([])
        }
      } else {
        const newNum = pages.length + 1
        const dummy: NotebookPage = {
          id: Date.now(),
          subject_id: subjectId,
          page_number: newNum,
          title: `Page ${newNum}`,
          body: '',
          links_json: '[]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        setPages([...pages, dummy])
        setCurrentPageIndex(pages.length)
        setBody('')
        setPageTitle(`Page ${newNum}`)
        setLinks([])
      }
      setStatus('Page added')
    } catch {
      setStatus('Could not create page')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePage(): Promise<void> {
    if (!currentPage) return
    const confirmDelete = window.confirm(`Delete "${pageTitle || `Page ${currentPage.page_number}`}"?`)
    if (!confirmDelete) return

    try {
      setSaving(true)
      setStatus('Deleting page…')
      if (window.electronAPI?.deleteNotebookPage) {
        const res = await window.electronAPI.deleteNotebookPage(currentPage.id, subjectId)
        if (res.success && res.pages.length > 0) {
          setPages(res.pages)
          const nextIndex = Math.min(currentPageIndex, res.pages.length - 1)
          setCurrentPageIndex(nextIndex)
          const nextP = res.pages[nextIndex]
          setBody(nextP.body || '')
          setPageTitle(nextP.title || `Page ${nextP.page_number}`)
          try {
            setLinks(nextP.links_json ? JSON.parse(nextP.links_json) as SubjectNoteLink[] : [])
          } catch {
            setLinks([])
          }
        }
      } else {
        if (pages.length <= 1) {
          setBody('')
          setPageTitle('Page 1')
        } else {
          const filtered = pages.filter((_, idx) => idx !== currentPageIndex)
          setPages(filtered)
          const nextIdx = Math.max(0, currentPageIndex - 1)
          setCurrentPageIndex(nextIdx)
          setBody(filtered[nextIdx].body || '')
          setPageTitle(filtered[nextIdx].title || `Page ${filtered[nextIdx].page_number}`)
        }
      }
      setStatus('Page updated')
    } catch {
      setStatus('Could not delete page')
    } finally {
      setSaving(false)
    }
  }

  // AI Organize / Format notes
  async function handleOrganizeNotes(): Promise<void> {
    if (!body.trim() || formatting) return

    setFormatting(true)
    setStatus('Formatting notes with AI…')
    setPreviousDraft(body)

    try {
      if (window.electronAPI?.organizeNotes) {
        const result = await window.electronAPI.organizeNotes(body)
        if (result.success && result.text) {
          setBody(result.text)
          setStatus('Notes organized cleanly')
          void saveCurrentPage(result.text)
        } else {
          setStatus(result.error || 'Could not organize notes.')
        }
      } else {
        // Fallback or demo simulation if API not present
        setStatus('AI formatter not available.')
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error formatting notes.')
    } finally {
      setFormatting(false)
    }
  }

  function handleUndoOrganize(): void {
    if (previousDraft !== null) {
      setBody(previousDraft)
      setPreviousDraft(null)
      setStatus('Reverted to draft')
      void saveCurrentPage(previousDraft)
    }
  }

  // Handle typing & / autocomplete
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

  function renderNotebookPreview(text: string): React.JSX.Element {
    const parts: React.ReactNode[] = []
    let cursor = 0
    for (const match of text.matchAll(LINK_PATTERN)) {
      const start = match.index || 0
      if (start > cursor) parts.push(<MarkdownRenderer key={`text-${cursor}`} content={text.slice(cursor, start)} />)
      const materialId = Number(match[1])
      const material = materials.find((item) => item.id === materialId)
      parts.push(material ? (
        <button
          key={`link-${start}`}
          type="button"
          onClick={() => navigate(`/subject/${subjectId}/material/${material.id}`)}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="opacity-70">
            <path d="M4 0h5.5v3.5A1.5 1.5 0 0 0 11 5h3.5v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm6 1.5V4a.5.5 0 0 0 .5.5H13L10 1.5z"/>
          </svg>
          {match[2]}
        </button>
      ) : <React.Fragment key={`missing-${start}`}>{match[0]}</React.Fragment>)
      cursor = start + match[0].length
    }
    if (cursor < text.length) parts.push(<MarkdownRenderer key={`text-${cursor}`} content={text.slice(cursor)} />)
    return <div className="text-[15px] leading-8 text-slate-800 dark:text-slate-100">{parts}</div>
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-[#fdfbf7] p-16 shadow-inner dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <svg className="h-5 w-5 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Opening your notebook…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Realistic Notebook Control Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        {/* Left: Page Flipping Navigation & Page Title */}
        <div className="flex items-center gap-2">
          {/* Flip Prev */}
          <button
            type="button"
            onClick={() => void goToPage(currentPageIndex - 1, 'left')}
            disabled={currentPageIndex <= 0}
            title="Previous Page (Flip left)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
            </svg>
          </button>

          {/* Page Badge & Dropdown */}
          <div className="relative flex items-center rounded-lg bg-amber-50/80 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/60">
            <span>Page {currentPageIndex + 1} of {Math.max(1, pages.length)}</span>
          </div>

          {/* Flip Next */}
          <button
            type="button"
            onClick={() => void goToPage(currentPageIndex + 1, 'right')}
            disabled={currentPageIndex >= pages.length - 1}
            title="Next Page (Flip right)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* New Page button */}
          <button
            type="button"
            onClick={() => void handleAddPage()}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-violet-300 bg-violet-50/60 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
            </svg>
            <span>Add Page</span>
          </button>

          {/* Delete Page button */}
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => void handleDeletePage()}
              title="Delete this page"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Center: Page Title editor input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => setPageTitle(e.target.value)}
            placeholder="Untitled Page"
            className="w-44 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-center text-xs font-semibold text-slate-800 placeholder-slate-400 hover:border-slate-200 focus:border-violet-400 focus:bg-white focus:outline-none dark:text-slate-100 dark:hover:border-slate-700 dark:focus:bg-slate-800"
          />
        </div>

        {/* Right: Format Button, Paper Style, View toggles & AutoSave status */}
        <div className="flex items-center gap-2">
          {/* AI FORMAT BUTTON */}
          <button
            type="button"
            onClick={() => void handleOrganizeNotes()}
            disabled={formatting || !body.trim()}
            title="Cleanly organize and structure your notes with AI without adding or removing content"
            className="group relative flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {formatting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Organizing…</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-violet-200 group-hover:text-white">
                  <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.734 1.734 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162z"/>
                </svg>
                <span>Format</span>
              </>
            )}
          </button>

          {/* Undo Format Button if available */}
          {previousDraft !== null && (
            <button
              type="button"
              onClick={handleUndoOrganize}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title="Undo formatting and return to your raw draft"
            >
              Undo
            </button>
          )}

          {/* Paper Texture Selector */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setPaperStyle('lined')}
              title="Ruled lined paper"
              className={`rounded px-1.5 py-0.5 font-medium ${paperStyle === 'lined' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Lined
            </button>
            <button
              type="button"
              onClick={() => setPaperStyle('grid')}
              title="Graph grid paper"
              className={`rounded px-1.5 py-0.5 font-medium ${paperStyle === 'grid' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setPaperStyle('blank')}
              title="Plain blank paper"
              className={`rounded px-1.5 py-0.5 font-medium ${paperStyle === 'blank' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Blank
            </button>
          </div>

          {/* View Mode (Split, Edit, Preview) */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`rounded px-2 py-0.5 font-medium ${viewMode === 'split' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`rounded px-2 py-0.5 font-medium ${viewMode === 'edit' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`rounded px-2 py-0.5 font-medium ${viewMode === 'preview' ? 'bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              Read
            </button>
          </div>

          {/* Clean AutoSave Indicator */}
          <div className="flex items-center gap-1.5 pl-1">
            <span
              className={`text-[11px] font-medium transition-colors ${
                status.startsWith('Could') ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'
              }`}
              aria-live="polite"
            >
              {saving ? 'Saving…' : status || 'Saved'}
            </span>
            {saving && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </div>
        </div>
      </div>

      {/* ── Realistic Notebook Book Frame & Binding ── */}
      <div className="relative rounded-2xl p-2 md:p-4 bg-gradient-to-b from-[#2e2b2a] via-[#1f1d1d] to-[#181616] shadow-2xl border border-stone-800/80">
        {/* Desk mat / Outer Notebook Cover */}
        <div className="relative flex rounded-xl overflow-hidden bg-[#262423] shadow-2xl ring-1 ring-white/10">

          {/* Spiral Ring Binder Left Spine */}
          <div className="relative z-10 flex w-10 flex-col items-center justify-between py-6 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 border-r border-stone-700/60 shadow-inner select-none">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="relative flex items-center justify-center my-1 w-full">
                {/* Hole punch cutout */}
                <div className="h-3.5 w-3.5 rounded-full bg-stone-950 shadow-inner border border-stone-700/40" />
                {/* Spiral wire ring */}
                <div className="absolute -right-2 h-2.5 w-6 rounded-full bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 shadow-md ring-1 ring-black/30 pointer-events-none" />
              </div>
            ))}
          </div>

          {/* Realistic Notebook Page Sheet Area */}
          <div
            className={`relative flex-1 min-h-[640px] bg-[#fbf9f4] dark:bg-[#151921] transition-transform duration-300 ${
              flipDirection === 'left' ? '-translate-x-1 opacity-90' : flipDirection === 'right' ? 'translate-x-1 opacity-90' : ''
            }`}
          >
            {/* Red / Magenta Academic Left Margin Rule */}
            <div className="absolute left-10 top-0 bottom-0 w-px bg-rose-300/80 dark:bg-rose-900/40 pointer-events-none z-10" />

            {/* Folio Header of the page */}
            <div className="flex items-center justify-between border-b border-stone-200/90 dark:border-slate-800/80 px-8 py-3 bg-[#f8f5ee]/70 dark:bg-[#1a202c]/50">
              <div className="flex items-center gap-3 pl-4">
                <span className="font-serif italic text-xs tracking-wider text-stone-500 dark:text-slate-400">
                  {pageTitle || `Page ${currentPageIndex + 1}`}
                </span>
                <span className="text-[10px] text-stone-400 dark:text-slate-500 font-mono">
                  {currentPage?.updated_at ? new Date(currentPage.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-stone-400 dark:text-slate-500">
                  Pg. {currentPageIndex + 1}
                </span>
              </div>
            </div>

            {/* Main Notebook Body Content (Split, Edit, or Preview) */}
            <div
              className={`p-6 md:p-8 ${
                paperStyle === 'lined'
                  ? 'notebook-lined-pattern'
                  : paperStyle === 'grid'
                  ? 'notebook-grid-pattern'
                  : ''
              }`}
            >
              <div
                className={`grid gap-6 ${
                  viewMode === 'split'
                    ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]'
                    : 'grid-cols-1'
                }`}
              >
                {/* ── Editor Section ── */}
                {(viewMode === 'split' || viewMode === 'edit') && (
                  <div className="relative">
                    <textarea
                      ref={editorRef}
                      value={body}
                      onChange={handleChange}
                      autoFocus
                      placeholder="Start writing your lecture notes, equations, questions, or type / to link course materials…"
                      className="min-h-[580px] w-full resize-y bg-transparent pl-8 pr-4 text-[15px] leading-8 font-sans text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-slate-500 outline-none focus:ring-0 border-0"
                      style={{
                        lineHeight: '32px'
                      }}
                    />

                    {/* Slash Autocomplete Menu */}
                    {slashStart !== null && (
                      <div className="absolute left-8 right-4 top-14 z-30 max-h-64 overflow-y-auto rounded-xl border border-violet-200 bg-white p-1.5 shadow-2xl dark:border-violet-800 dark:bg-slate-900">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Link Material
                        </div>
                        {filteredMaterials.length > 0 ? (
                          filteredMaterials.map((material) => (
                            <button
                              key={material.id}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertMaterial(material)}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition hover:bg-violet-50 dark:hover:bg-violet-950/40"
                            >
                              <span className="font-semibold text-slate-800 dark:text-slate-100 truncate pr-2">
                                {material.filename}
                              </span>
                              <span className="shrink-0 text-[10px] font-mono text-slate-400 uppercase">
                                {material.file_type}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            No materials match “{slashQuery}”.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Preview Section ── */}
                {(viewMode === 'split' || viewMode === 'preview') && (
                  <div className="rounded-xl border border-stone-200/70 bg-white/60 p-6 shadow-sm backdrop-blur-xs dark:border-slate-800/80 dark:bg-slate-900/60 min-h-[580px]">
                    <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2 dark:border-slate-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500">
                        Clean Formatted Notes
                      </span>
                      {body.trim() && (
                        <span className="text-[10px] text-stone-400 dark:text-slate-500">
                          {body.split(/\s+/).filter(Boolean).length} words
                        </span>
                      )}
                    </div>

                    {body.trim() ? (
                      renderNotebookPreview(body)
                    ) : (
                      <div className="flex flex-col items-center justify-center py-24 text-center text-stone-400 dark:text-slate-500">
                        <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="opacity-40 mb-2">
                          <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                        </svg>
                        <p className="text-sm">Start writing or formatting your notes to see the clean notebook preview here.</p>
                      </div>
                    )}

                    {links.length > 0 && (
                      <div className="mt-8 border-t border-stone-200/80 pt-4 dark:border-slate-800">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500">
                          Referenced Course Materials
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {links.map((link) => (
                            <button
                              key={link.material_id}
                              type="button"
                              onClick={() => navigate(`/subject/${subjectId}/material/${link.material_id}`)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800"
                            >
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3z"/>
                              </svg>
                              <span>{link.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Page Folio / Quick Page Jumper */}
            <div className="flex items-center justify-between border-t border-stone-200/70 bg-[#f9f6ef]/80 px-8 py-3 text-xs text-stone-500 dark:border-slate-800/80 dark:bg-[#1a202c]/40 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400 dark:text-slate-500">Quick Jump:</span>
                <div className="flex flex-wrap items-center gap-1">
                  {pages.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void goToPage(idx, idx > currentPageIndex ? 'right' : 'left')}
                      className={`h-6 min-w-6 rounded px-1.5 text-xs font-medium transition ${
                        idx === currentPageIndex
                          ? 'bg-amber-200 text-amber-900 font-bold shadow-2xs dark:bg-amber-900 dark:text-amber-100'
                          : 'bg-stone-200/60 text-stone-600 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void goToPage(currentPageIndex - 1, 'left')}
                  disabled={currentPageIndex <= 0}
                  className="hover:text-stone-800 disabled:opacity-30 dark:hover:text-white"
                >
                  ← Previous Page
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => void goToPage(currentPageIndex + 1, 'right')}
                  disabled={currentPageIndex >= pages.length - 1}
                  className="hover:text-stone-800 disabled:opacity-30 dark:hover:text-white"
                >
                  Next Page →
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Floating Note AI Helper */}
      <div className="fixed bottom-6 right-6 z-40">
        <NoteAIHelper
          subjectName={subjectName}
          currentNotes={body}
          onInsertText={(insertedText) => {
            const editor = editorRef.current
            if (editor) {
              const start = editor.selectionStart || body.length
              const end = editor.selectionEnd || body.length
              const next = body.slice(0, start) + (body ? '\n\n' : '') + insertedText + body.slice(end)
              setBody(next)
              void saveCurrentPage(next)
            } else {
              const next = body ? `${body}\n\n${insertedText}` : insertedText
              setBody(next)
              void saveCurrentPage(next)
            }
          }}
        />
      </div>

      <style>{`
        .notebook-lined-pattern {
          background-image: repeating-linear-gradient(
            transparent,
            transparent 31px,
            rgba(203, 213, 225, 0.45) 31px,
            rgba(203, 213, 225, 0.45) 32px
          );
          background-size: 100% 32px;
        }
        .dark .notebook-lined-pattern {
          background-image: repeating-linear-gradient(
            transparent,
            transparent 31px,
            rgba(51, 65, 85, 0.45) 31px,
            rgba(51, 65, 85, 0.45) 32px
          );
        }
        .notebook-grid-pattern {
          background-image:
            linear-gradient(to right, rgba(203, 213, 225, 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(203, 213, 225, 0.3) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .dark .notebook-grid-pattern {
          background-image:
            linear-gradient(to right, rgba(51, 65, 85, 0.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(51, 65, 85, 0.35) 1px, transparent 1px);
        }
      `}</style>
    </div>
  )
}
