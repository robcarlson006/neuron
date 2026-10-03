import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MarkdownRenderer from '../components/MarkdownRenderer'
import PdfPageViewer, { type PdfRect } from '../components/PdfPageViewer'
import LoadingProgressBar from '../components/common/LoadingProgressBar'
import HighlightCardPreviewModal from '../components/material/HighlightCardPreviewModal'
import type { DocumentAnnotation, Material, Subject, DocumentLocator, HighlightCardDraft } from '../types'

type CueKind = 'cue' | 'question' | 'comment'
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fde68a' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Pink', value: '#fbcfe8' }
]

function splitIntoUnits(content: string, fileType: string, visualPageCount?: number | null): string[] {
  if (fileType === 'image') return [content || 'This image has no extracted text yet.']
  const marked = content.split(/(?=---\s+(?:Page|Slide|Chapter)\s+\d+\s+---)/gi).map((part) => part.trim()).filter(Boolean)
  if (marked.length > 1) return marked

  const paragraphs = content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  if (['pdf', 'doc', 'docx'].includes(fileType) && visualPageCount && visualPageCount > 1) {
    const pages: string[] = Array.from({ length: visualPageCount }, (_, pageIndex) => {
      const start = Math.floor(pageIndex * paragraphs.length / visualPageCount)
      const end = Math.floor((pageIndex + 1) * paragraphs.length / visualPageCount)
      return paragraphs.slice(start, Math.max(start + 1, end)).join('\n\n')
    })
    return pages
  }
  if (fileType === 'pdf' && paragraphs.length > 1) {
    const pageSize = 8
    const pages: string[] = []
    for (let i = 0; i < paragraphs.length; i += pageSize) pages.push(paragraphs.slice(i, i + pageSize).join('\n\n'))
    return pages
  }
  return paragraphs.length > 0 ? paragraphs : [content || 'This material has no extracted text yet.']
}

function parseLocator(annotation: DocumentAnnotation): DocumentLocator | null {
  if (!annotation.locator_json) return null
  try { return JSON.parse(annotation.locator_json) as DocumentLocator } catch { return null }
}

function locatorUnitIndex(locator: DocumentLocator | null): number {
  if (!locator) return 0
  if (typeof locator.page === 'number') return locator.page - 1
  if (typeof locator.slide === 'number') return locator.slide - 1
  const chapterNumber = Number.parseInt(locator.chapter || '', 10)
  return Number.isFinite(chapterNumber) ? chapterNumber - 1 : 0
}

function unitLabel(fileType: string, index: number): string {
  if (fileType === 'pptx' || fileType === 'ppt') return `Slide ${index + 1}`
  if (fileType === 'epub') return `Chapter ${index + 1}`
  if (['pdf', 'doc', 'docx', 'image'].includes(fileType)) return `Page ${index + 1}`
  return `Section ${index + 1}`
}

function unitLocator(fileType: string, index: number): Pick<DocumentLocator, 'page' | 'slide' | 'chapter'> {
  if (fileType === 'pptx' || fileType === 'ppt') return { slide: index + 1 }
  if (fileType === 'epub') return { chapter: String(index + 1) }
  return { page: index + 1 }
}

function annotationLocationLabel(fileType: string, annotation: DocumentAnnotation): string {
  const locator = parseLocator(annotation)
  return unitLabel(fileType, locatorUnitIndex(locator))
}

function studyTextClass(fileType: string): string {
  return fileType === 'pdf' ? 'font-serif text-[15px] leading-7 whitespace-pre-wrap' : ''
}

function renderAnnotatedUnit(unit: string, unitHighlights: DocumentAnnotation[], fileType: string): React.JSX.Element {
  const body = unit.replace(/^---\s+(?:Page|Slide|Chapter)\s+\d+\s+---\s*/i, '')
  const matches: Array<{ start: number; end: number; annotation: DocumentAnnotation }> = []
  for (const annotation of unitHighlights) {
    const quote = annotation.selected_text?.trim()
    if (!quote) continue
    const start = body.indexOf(quote)
    if (start < 0) continue
    const end = start + quote.length
    if (matches.some((match) => start < match.end && end > match.start)) continue
    matches.push({ start, end, annotation })
  }
  matches.sort((left, right) => left.start - right.start)
  if (matches.length === 0) return <MarkdownRenderer content={body} className={studyTextClass(fileType)} />

  const pieces: React.ReactNode[] = []
  let cursor = 0
  matches.forEach((match) => {
    if (match.start > cursor) pieces.push(<MarkdownRenderer key={`text-${cursor}`} content={body.slice(cursor, match.start)} className={studyTextClass(fileType)} />)
    pieces.push(
      <mark
        key={`highlight-${match.annotation.id}`}
        className="rounded px-0.5 ring-1 ring-black/5"
        style={{ backgroundColor: match.annotation.color || '#fde68a' }}
        title={match.annotation.locator_status === 'needs_review' ? 'This highlight needs review because the source changed.' : undefined}
      >
        {body.slice(match.start, match.end)}
      </mark>
    )
    cursor = match.end
  })
  if (cursor < body.length) pieces.push(<MarkdownRenderer key={`text-${cursor}`} content={body.slice(cursor)} className={studyTextClass(fileType)} />)
  return <div className="space-y-3">{pieces}</div>
}

export default function MaterialStudyPage(): React.JSX.Element {
  const { subjectId: subjectIdParam, materialId: materialIdParam } = useParams<{ subjectId: string; materialId: string }>()
  const navigate = useNavigate()
  const subjectId = Number(subjectIdParam)
  const materialId = Number(materialIdParam)
  const [material, setMaterial] = useState<Material | null>(null)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<CueKind>('cue')
  const [summary, setSummary] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [selectionEditorOpen, setSelectionEditorOpen] = useState(false)
  const [regionSelectionActive, setRegionSelectionActive] = useState(false)
  const [selectionUnit, setSelectionUnit] = useState(0)
  const [activeUnit, setActiveUnit] = useState(0)
  const [selectionOffset, setSelectionOffset] = useState({ start: 0, end: 0 })
  const [selectionComment, setSelectionComment] = useState('')
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [visualUrl, setVisualUrl] = useState<string | null>(null)
  const [visualPageCount, setVisualPageCount] = useState<number | null>(null)
  const [sourceChecked, setSourceChecked] = useState(false)
  const [cardDraft, setCardDraft] = useState<HighlightCardDraft | null>(null)
  const [cardRevision, setCardRevision] = useState('')
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false)
  const [cardMessage, setCardMessage] = useState('')
  const [cardError, setCardError] = useState(false)
  const [cardGenerating, setCardGenerating] = useState(false)
  const [visualZoom, setVisualZoom] = useState(1)
  const [visualDrawMode] = useState(true)
  const [saveStatus, setSaveStatus] = useState('Saved')
  const [visualDragStart, setVisualDragStart] = useState<{ left: number; top: number } | null>(null)
  const [visualDragRect, setVisualDragRect] = useState<DocumentLocator['rects']>([])
  const [selectionRects, setSelectionRects] = useState<DocumentLocator['rects']>([])
  const selectedRegionTextRef = useRef<HTMLTextAreaElement | null>(null)
  const toolbarControlsRef = useRef<Array<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | null>>([])
  const viewerRef = useRef<HTMLDivElement>(null)
  const selectionToolbarRef = useRef<HTMLDivElement>(null)
  const visualCanvasRef = useRef<HTMLDivElement>(null)
  const lastLocationKey = `neuron:material-study:last-unit:${materialId}`
  const summaryDraftKey = `neuron:material-study:summary:${materialId}:${activeUnit}`
  const noteDraftKey = `neuron:material-study:${draftKind}:${materialId}:${activeUnit}`
  const summaryDirtyRef = useRef(false)
  const summaryValueRef = useRef(summary)
  const summaryUnitRef = useRef(activeUnit)
  const summarySaveQueueRef = useRef(Promise.resolve())
  const summarySaveTimerRef = useRef<number | null>(null)

  function clearSelectionActions(): void {
    setSelectedText('')
    setSelectionEditorOpen(false)
    setRegionSelectionActive(false)
    setSelectionRects([])
    setSelectionComment('')
    setCardDraft(null)
    setCardRevision('')
    setCardPreviewOpen(false)
    setCardMessage('')
    setCardError(false)
    setSelectionRects([])
    setVisualDragStart(null)
    setVisualDragRect([])
  }

  useEffect(() => {
    if (selectionEditorOpen) requestAnimationFrame(() => selectedRegionTextRef.current?.focus())
  }, [selectionEditorOpen])

  function moveToolbarFocus(event: React.KeyboardEvent<HTMLElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    const controls = toolbarControlsRef.current.filter((control): control is HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement => Boolean(control))
    const currentIndex = controls.indexOf(document.activeElement as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement)
    if (currentIndex < 0) return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const nextIndex = (currentIndex + direction + controls.length) % controls.length
    controls[nextIndex]?.focus()
  }

  const loadAnnotations = useCallback(async () => {
    const rows = await window.electronAPI.reconcileMaterialAnnotations(materialId)
    setAnnotations(rows)
  }, [materialId])

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [loadedMaterial, subjects] = await Promise.all([
          window.electronAPI.getMaterial(materialId) as Promise<Material | null>,
          window.electronAPI.getSubjects()
        ])
        if (cancelled) return
        setMaterial(loadedMaterial)
        setSubject((subjects as Subject[]).find((item) => item.id === subjectId) || null)
        try {
          setSourceUrl(await window.electronAPI.getMaterialFileUrl(materialId))
          setVisualUrl(await window.electronAPI.getMaterialVisualUrl(materialId))
          if (['pdf', 'ppt', 'pptx', 'doc', 'docx', 'epub', 'image'].includes(loadedMaterial?.file_type || '')) {
            setVisualPageCount(await window.electronAPI.getMaterialVisualPageCount(materialId))
          }
        } catch { /* source preview is optional */ }
        finally { setSourceChecked(true) }
        await loadAnnotations()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadAnnotations, materialId, subjectId])

  const units = useMemo(() => material ? splitIntoUnits(material.content_text || '', material.file_type, visualPageCount) : [], [material, visualPageCount])

  useEffect(() => {
    if (!material || units.length === 0) return
    const savedUnit = Number.parseInt(localStorage.getItem(lastLocationKey) || '', 10)
    if (!Number.isFinite(savedUnit) || savedUnit < 0 || savedUnit >= units.length) return
    setActiveUnit(savedUnit)
    setSelectionUnit(savedUnit)
    requestAnimationFrame(() => {
      document.getElementById(`material-unit-${savedUnit}`)?.scrollIntoView({ block: 'start' })
    })
  }, [lastLocationKey, material, units.length])

  useEffect(() => {
    const summaries = annotations.filter((annotation) => annotation.kind === 'summary' && !annotation.deleted_at)
    const current = summaries.find((annotation) => {
      const locator = parseLocator(annotation)
      return locator && locatorUnitIndex(locator) === activeUnit
    }) || summaries.find((annotation) => !parseLocator(annotation))
    const savedDraft = localStorage.getItem(summaryDraftKey)
    if (savedDraft !== null) {
      setSummary(savedDraft)
      summaryDirtyRef.current = savedDraft !== (current?.body || '')
    } else if (!summaryDirtyRef.current || summaryUnitRef.current !== activeUnit) {
      setSummary(current?.body || '')
      summaryDirtyRef.current = false
    }
    summaryUnitRef.current = activeUnit
  }, [activeUnit, annotations, summaryDraftKey])

  useEffect(() => {
    const savedDraft = localStorage.getItem(noteDraftKey)
    setDraft(savedDraft || '')
  }, [noteDraftKey])

  // Keep the selection actions coupled to a live text selection. Toolbar
  // controls preserve the browser selection while they are being used, but
  // clicking elsewhere or collapsing the selection dismisses the toolbar.
  useEffect(() => {
    const dismissWhenSelectionEnds = (): void => {
      if (cardPreviewOpen) return
      const selection = window.getSelection()
      if (selection?.toString().trim()) return
      if (selectionToolbarRef.current?.contains(document.activeElement)) return
      clearSelectionActions()
    }
    const dismissWhenClickingAway = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target instanceof Element && target.closest('[data-testid="highlight-card-preview-modal"]')) return
      if (target && selectionToolbarRef.current?.contains(target)) return
      clearSelectionActions()
    }
    document.addEventListener('selectionchange', dismissWhenSelectionEnds)
    document.addEventListener('pointerdown', dismissWhenClickingAway)
    return () => {
      document.removeEventListener('selectionchange', dismissWhenSelectionEnds)
      document.removeEventListener('pointerdown', dismissWhenClickingAway)
    }
  }, [cardPreviewOpen])

  useEffect(() => {
    if (draft) localStorage.setItem(noteDraftKey, draft)
    else localStorage.removeItem(noteDraftKey)
  }, [draft, noteDraftKey])

  useEffect(() => {
    summaryValueRef.current = summary
    summaryUnitRef.current = activeUnit
  }, [activeUnit, summary])

  const persistSummary = useCallback(async (unit: number, body: string): Promise<void> => {
    const existing = annotations.find((annotation) => {
      if (annotation.kind !== 'summary' || annotation.deleted_at) return false
      const locator = parseLocator(annotation)
      return locator ? locatorUnitIndex(locator) === unit : false
    })
    setSaveStatus('Saving…')
    try {
      if (!body.trim()) {
        if (existing?.id) await window.electronAPI.deleteDocumentAnnotation(existing.id)
      } else {
        await window.electronAPI.saveDocumentAnnotation({
          id: existing?.id,
          subject_id: subjectId,
          material_id: materialId,
          kind: 'summary',
          body,
          locator: { ...unitLocator(material?.file_type || '', unit), quote: units[unit] || '' },
          source_snapshot: units[unit]
        })
      }
      const key = `neuron:material-study:summary:${materialId}:${unit}`
      if (localStorage.getItem(key) === body) localStorage.removeItem(key)
      if (summaryUnitRef.current === unit && summaryValueRef.current === body) summaryDirtyRef.current = false
      setSaveStatus('Saved just now')
      await loadAnnotations()
    } catch (error) {
      setSaveStatus('Save failed — your draft is kept locally')
      throw error
    }
  }, [annotations, loadAnnotations, material, materialId, subjectId, units])

  const queueSummarySave = useCallback((unit: number, body: string): Promise<void> => {
    summarySaveQueueRef.current = summarySaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistSummary(unit, body))
    return summarySaveQueueRef.current
  }, [persistSummary])

  const scheduleSummarySave = useCallback((unit: number, body: string): void => {
    if (summarySaveTimerRef.current !== null) window.clearTimeout(summarySaveTimerRef.current)
    summarySaveTimerRef.current = window.setTimeout(() => {
      summarySaveTimerRef.current = null
      void queueSummarySave(unit, body)
    }, 900)
  }, [queueSummarySave])

  useEffect(() => {
    const flush = (): void => {
      if (summaryDirtyRef.current) void queueSummarySave(summaryUnitRef.current, summaryValueRef.current)
    }
    const onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      if (summarySaveTimerRef.current !== null) window.clearTimeout(summarySaveTimerRef.current)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [queueSummarySave])

  const highlights = annotations.filter((annotation) => annotation.kind === 'highlight' && !annotation.deleted_at)
  const notes = annotations.filter((annotation) => ['cue', 'question', 'comment'].includes(annotation.kind) && !annotation.deleted_at)
  const activeNotes = notes.filter((annotation) => {
    if (annotation.kind === 'comment' && annotation.parent_id) return false
    const locator = parseLocator(annotation)
    return !locator || locatorUnitIndex(locator) === activeUnit
  })
  const activeHighlights = highlights.filter((annotation) => locatorUnitIndex(parseLocator(annotation)) === activeUnit)
  const documentAnnotations = annotations
    .filter((annotation) => !annotation.deleted_at)
    .filter((annotation) => ['highlight', 'cue', 'question'].includes(annotation.kind))
    .sort((left, right) => {
      const unitDifference = locatorUnitIndex(parseLocator(left)) - locatorUnitIndex(parseLocator(right))
      return unitDifference || left.id - right.id
    })
  const needsReviewCount = annotations.filter((annotation) => annotation.locator_status === 'needs_review' && !annotation.deleted_at).length

  function handleSelection(unitIndex: number): void {
    const selection = window.getSelection()
    const text = selection?.toString().trim() || ''
    if (!text) {
      clearSelectionActions()
      return
    }
    const unitText = units[unitIndex] || ''
    const start = Math.max(0, unitText.indexOf(text))
    const visualRects: DocumentLocator['rects'] = []
    setSelectedText(text)
    setSelectionEditorOpen(true)
    setRegionSelectionActive(false)
    setSelectionUnit(unitIndex)
    setActiveUnit(unitIndex)
    setSelectionOffset({ start, end: start + text.length })
    setSelectionComment('')
    setSelectionRects(visualRects)
  }

  async function handlePdfRegionSelection(rect: PdfRect, imageDataUrl: string | null): Promise<void> {
    setSelectedText('')
    setSelectionEditorOpen(true)
    setRegionSelectionActive(true)
    setSelectionUnit(activeUnit)
    setActiveUnit(activeUnit)
    setSelectionOffset({ start: 0, end: 0 })
    setSelectionComment('')
    setSelectionRects([rect])
    void imageDataUrl
  }

  type VisualPointerEvent = React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>

  function visualPoint(event: VisualPointerEvent): { left: number; top: number } | null {
    const canvas = visualCanvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    return {
      left: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1))),
      top: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(bounds.height, 1)))
    }
  }

  function beginVisualHighlight(event: VisualPointerEvent): void {
    if (!visualDrawMode) return
    event.preventDefault()
    event.stopPropagation()
    const point = visualPoint(event)
    if (!point) return
    if ('pointerId' in event) event.currentTarget.setPointerCapture?.(event.pointerId)
    setVisualDragStart(point)
    setVisualDragRect([{ ...point, width: 0, height: 0 }])
  }

  function updateVisualHighlight(event: VisualPointerEvent): void {
    if (!visualDrawMode || !visualDragStart) return
    event.stopPropagation()
    const point = visualPoint(event)
    if (!point) return
    const left = Math.min(visualDragStart.left, point.left)
    const top = Math.min(visualDragStart.top, point.top)
    setVisualDragRect([{ left, top, width: Math.abs(point.left - visualDragStart.left), height: Math.abs(point.top - visualDragStart.top) }])
  }

  function finishVisualHighlight(event: VisualPointerEvent): void {
    if (!visualDrawMode || !visualDragStart) return
    event.stopPropagation()
    const point = visualPoint(event)
    if (!point) return
    const left = Math.min(visualDragStart.left, point.left)
    const top = Math.min(visualDragStart.top, point.top)
    const rect = { left, top, width: Math.abs(point.left - visualDragStart.left), height: Math.abs(point.top - visualDragStart.top) }
    setVisualDragStart(null)
    setVisualDragRect([])
    if (rect.width < 0.005 || rect.height < 0.005) return
    setSelectedText('')
    setSelectionEditorOpen(true)
    setRegionSelectionActive(true)
    setSelectionUnit(activeUnit)
    setActiveUnit(activeUnit)
    setSelectionOffset({ start: 0, end: 0 })
    setSelectionComment('')
    setSelectionRects([rect])
  }

  async function saveHighlight(): Promise<void> {
    if (!selectedText.trim() || !material) return
    setSaving(true)
    try {
      const locator: DocumentLocator = {
        ...unitLocator(material.file_type, selectionUnit),
        startOffset: selectionOffset.start,
        endOffset: selectionOffset.end,
        quote: selectedText,
        ...(selectionRects && selectionRects.length > 0 ? { rects: selectionRects } : {})
      }
      const highlight = await window.electronAPI.saveDocumentAnnotation({
      subject_id: subjectId,
      material_id: material.id,
      kind: 'highlight',
        color: selectedColor,
        body: '',
        selected_text: selectedText,
        locator,
        source_snapshot: units[selectionUnit],
        source_hash: material.file_sha256 || (material.file_mtime != null ? `${material.file_mtime}:${material.file_size || 0}` : undefined)
      })
      if (selectionComment.trim()) {
        await window.electronAPI.saveDocumentAnnotation({
          subject_id: subjectId,
          material_id: material.id,
          kind: 'comment',
          parent_id: highlight.id,
          body: selectionComment.trim(),
          selected_text: selectedText,
          locator,
          source_snapshot: units[selectionUnit]
        })
      }
      await loadAnnotations()
      clearSelectionActions()
      window.getSelection()?.removeAllRanges()
    } finally {
      setSaving(false)
    }
  }

  async function saveNote(): Promise<void> {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const savedDraftKey = noteDraftKey
      const savedDraftKind = draftKind
      const savedDraftUnit = activeUnit
      await window.electronAPI.saveDocumentAnnotation({
        subject_id: subjectId,
        material_id: materialId,
        kind: draftKind,
        body: draft.trim(),
        locator: {
          ...unitLocator(material?.file_type || '', activeUnit),
          quote: units[activeUnit] || ''
        },
        source_snapshot: units[activeUnit]
      })
      localStorage.removeItem(savedDraftKey)
      if (draftKind === savedDraftKind && activeUnit === savedDraftUnit) setDraft('')
      await loadAnnotations()
    } finally {
      setSaving(false)
    }
  }

  async function saveSummary(): Promise<void> {
    setSaving(true)
    try { await queueSummarySave(activeUnit, summary) } finally { setSaving(false) }
  }

  async function deleteHighlight(highlightId: number): Promise<void> {
    setSaving(true)
    try {
      await window.electronAPI.deleteDocumentAnnotation(highlightId)
      clearSelectionActions()
      await loadAnnotations()
    } finally {
      setSaving(false)
    }
  }

  async function generateCard(revision?: string, previousCard?: HighlightCardDraft): Promise<void> {
    if (!selectedText || !material) return
    setSaving(true)
    setCardMessage('')
    setCardError(false)
    setCardGenerating(true)
    try {
      const context = [
        `Selected text:\n${selectedText}`,
        `Surrounding material context:\n${units[selectionUnit] || ''}`,
        revision?.trim() ? `Learner revision request:\n${revision.trim()}` : ''
      ].filter(Boolean).join('\n\n')
      const result = await window.electronAPI.tutorExtractCardFromSnippet(subjectId, context, material.filename, {
        highlightText: selectedText,
        sourceContext: units[selectionUnit] || '',
        materialTitle: material.filename,
        feedback: revision,
        previousCard
      })
      if (!result.success || !result.cards[0]) throw new Error(result.error || 'The AI did not return a card.')
      if (result.normalizedText?.trim()) {
        setSelectedText(result.normalizedText.trim())
        setSelectionOffset({ start: 0, end: result.normalizedText.trim().length })
      }
      setCardDraft(result.cards[0])
      setCardRevision('')
      setCardPreviewOpen(true)
    } catch (error) {
      setCardError(true)
      setCardMessage(error instanceof Error ? error.message : 'Could not generate a flashcard.')
    } finally {
      setSaving(false)
      setCardGenerating(false)
    }
  }

  const closeCardPreview = useCallback(() => setCardPreviewOpen(false), [])

  async function saveCardDraft(): Promise<void> {
    if (!cardDraft) return
    setSaving(true)
    try {
      await window.electronAPI.saveCard({
        subject_id: subjectId,
        material_id: materialId,
        type: cardDraft.type,
        front: cardDraft.front,
        back: cardDraft.back,
        concept: cardDraft.concept || material?.filename,
        is_manual: 0,
        source: 'highlight'
      })
      setCardMessage('Card saved to this material’s deck.')
      setCardDraft(null)
      setCardPreviewOpen(false)
      setCardRevision('')
    } finally {
      setSaving(false)
    }
  }

  function jumpTo(annotation: DocumentAnnotation): void {
    const locator = parseLocator(annotation)
    const unit = locatorUnitIndex(locator)
    clearSelectionActions()
    setActiveUnit(unit)
    localStorage.setItem(lastLocationKey, String(unit))
    document.getElementById(`material-unit-${unit}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function navigateUnit(index: number): void {
    if (index < 0 || index >= units.length) return
    clearSelectionActions()
    setActiveUnit(index)
    setSelectionUnit(index)
    localStorage.setItem(lastLocationKey, String(index))
    document.getElementById(`material-unit-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const materialType = material?.file_type || ''
  const pdfBackedType = materialType === 'pdf' || materialType === 'ppt' || materialType === 'pptx'
  const visualFrameUrl = visualUrl
    ? materialType === 'epub'
      ? `neuron-file://visual-epub-page/${materialId}/${activeUnit + 1}`
      : ['pdf', 'ppt', 'pptx', 'doc', 'docx'].includes(materialType)
        ? `neuron-file://visual-page/${materialId}/${activeUnit + 1}`
        : visualUrl
    : null

  const selectionToolbar = selectionEditorOpen ? (
    <section ref={selectionToolbarRef} onKeyDown={moveToolbarFocus} className="pointer-events-auto max-h-[min(42rem,calc(100vh-13rem))] overflow-y-auto rounded-xl border border-violet-200/90 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-violet-800/90 dark:bg-slate-900/95 dark:shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Highlight editor</div>
        <button ref={(element) => { toolbarControlsRef.current[8] = element }} onClick={clearSelectionActions} className="text-xs text-slate-400">Cancel</button>
      </div>
      <textarea
        ref={(element) => { selectedRegionTextRef.current = element; toolbarControlsRef.current[0] = element }}
        aria-label="Highlighted text"
        value={selectedText}
        onChange={(event) => {
          const text = event.target.value
          setSelectedText(text)
          setSelectionOffset({ start: 0, end: text.length })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void saveHighlight()
          }
          if (event.key === 'ArrowDown' && event.currentTarget.selectionStart === event.currentTarget.value.length) moveToolbarFocus(event)
          if (event.key === 'ArrowDown' && event.currentTarget.selectionStart === event.currentTarget.value.length) event.stopPropagation()
        }}
        placeholder="Type the text you highlighted…"
        className="mt-3 min-h-20 w-full resize-y rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 dark:border-violet-800 dark:bg-violet-950/20 dark:text-white"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Highlight color">
          {HIGHLIGHT_COLORS.map((color, index) => <button key={color.value} ref={(element) => { toolbarControlsRef.current[index + 1] = element }} onClick={() => setSelectedColor(color.value)} aria-label={`Use ${color.name} highlight`} aria-pressed={selectedColor === color.value} className={`h-6 w-6 rounded-full border-2 ${selectedColor === color.value ? 'border-slate-900 dark:border-white' : 'border-white dark:border-slate-700'}`} style={{ backgroundColor: color.value }} />)}
        </div>
        <input ref={(element) => { toolbarControlsRef.current[5] = element }} value={selectionComment} onChange={(event) => setSelectionComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void saveHighlight() } }} placeholder="Optional comment or question…" aria-label="Highlight comment" className="min-w-[220px] flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
        <button ref={(element) => { toolbarControlsRef.current[6] = element }} onClick={() => void saveHighlight()} disabled={saving || !selectedText.trim()} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save highlight</button>
        <button ref={(element) => { toolbarControlsRef.current[7] = element }} onClick={() => void generateCard()} disabled={saving || cardGenerating || !selectedText.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Card</button>
      </div>
      {cardGenerating && <LoadingProgressBar label="Generating flashcard…" sublabel="The card preview will appear when generation finishes." size="sm" className="mt-3" />}
      {cardMessage && <p className={`mt-2 text-xs ${cardError ? 'text-rose-600' : 'text-emerald-600'}`}>{cardMessage}</p>}
    </section>
  ) : null

  if (loading) return <div className="p-8 text-sm text-slate-500">Opening material workspace…</div>
  if (!material) return <div className="p-8 text-sm text-slate-500">Material not found.</div>

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/subject/${subjectId}`)} className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">← {subject?.name || 'Class'}</button>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <div className="min-w-0">
          <h1 className="font-semibold text-slate-900 dark:text-white truncate">{material.filename}</h1>
          <p className="text-[11px] text-slate-400">Cornell material workspace · {highlights.length} highlights · {notes.length} notes</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[280px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_180px]">
        <aside className="row-span-2 min-h-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Cues & notes · {unitLabel(material.file_type, activeUnit)}</h2>
            <span className="text-[10px] text-slate-400" aria-live="polite">{saveStatus}</span>
          </div>
          {needsReviewCount > 0 && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{needsReviewCount} annotation{needsReviewCount === 1 ? '' : 's'} need review because the source changed.</div>}
          <div className="flex gap-1 mb-2">
            {(['cue', 'question'] as CueKind[]).map((kind) => (
              <button key={kind} onClick={() => setDraftKind(kind)} className={`px-2 py-1 rounded text-[11px] ${draftKind === kind ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                {kind === 'cue' ? 'Note' : 'Question'}
              </button>
            ))}
          </div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={draftKind === 'question' ? 'What do you want to understand?' : 'Write a cue or note…'} className="w-full min-h-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 resize-y" />
          <button onClick={() => void saveNote()} disabled={!draft.trim() || saving} className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add note</button>

          <div className="mt-5 space-y-2">
            {activeNotes.length === 0 && activeHighlights.length === 0 && <p className="text-xs text-slate-400">Your notes, questions, and linked comments for this {unitLabel(material.file_type, activeUnit).toLowerCase()} will appear here.</p>}
            {activeNotes.map((note) => (
              <button key={note.id} onClick={() => jumpTo(note)} className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 p-2 hover:border-violet-400 transition-colors">
                <span className="text-[10px] font-bold uppercase text-violet-500">{note.kind}</span>
                <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 line-clamp-4">{note.body}</p>
              </button>
            ))}
            {activeHighlights.map((highlight) => {
              const linkedComments = notes.filter((annotation) => annotation.kind === 'comment' && annotation.parent_id === highlight.id)
              return (
                <div key={highlight.id} className="w-full rounded-lg border border-slate-200 p-2 dark:border-slate-700" style={{ borderLeftColor: highlight.color || '#fde68a', borderLeftWidth: 4 }}>
                  <button onClick={() => jumpTo(highlight)} className="w-full text-left">
                    <span className="text-[10px] font-bold uppercase text-amber-600">highlight</span>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 line-clamp-3">“{highlight.selected_text}”</p>
                    {linkedComments.map((comment) => <p key={comment.id} className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300"><span className="font-semibold text-violet-600">Comment:</span> {comment.body}</p>)}
                    {highlight.locator_status === 'needs_review' && <span className="mt-1 block text-[10px] text-amber-600">Needs review</span>}
                  </button>
                  <button type="button" onClick={() => void deleteHighlight(highlight.id)} disabled={saving} className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-40">Remove highlight</button>
                </div>
              )
            })}
            {documentAnnotations.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">All document annotations</div>
                <div className="space-y-1.5">
                  {documentAnnotations.map((annotation) => (
                    <button key={`document-annotation-${annotation.id}`} onClick={() => jumpTo(annotation)} className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-left hover:border-violet-400 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase text-violet-500">{annotation.kind}</span>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">{annotationLocationLabel(material.file_type, annotation)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-700 dark:text-slate-200">{annotation.kind === 'highlight' ? `“${annotation.selected_text || ''}”` : annotation.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="relative min-h-0 flex flex-col bg-slate-100/70 dark:bg-slate-950">
          <div className="shrink-0 mx-6 mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
            <button onClick={() => navigateUnit(activeUnit - 1)} disabled={activeUnit === 0} className="rounded px-2 py-1 text-xs font-semibold text-violet-600 disabled:opacity-30">← Previous</button>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{unitLabel(material.file_type, activeUnit)} of {units.length}</span>
            <div className="flex items-center gap-2">
              {(visualUrl || sourceUrl) && ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'epub', 'image'].includes(material.file_type) && <>
                <button onClick={() => setVisualZoom((zoom) => Math.max(0.75, Number((zoom - 0.1).toFixed(2))))} aria-label="Zoom out" className="rounded border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">−</button>
                <span className="min-w-12 text-center text-[11px] text-slate-500">{Math.round(visualZoom * 100)}%</span>
                <button onClick={() => setVisualZoom((zoom) => Math.min(1.75, Number((zoom + 0.1).toFixed(2))))} aria-label="Zoom in" className="rounded border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">+</button>
              </>}
              <button onClick={() => navigateUnit(activeUnit + 1)} disabled={activeUnit >= units.length - 1} className="rounded px-2 py-1 text-xs font-semibold text-violet-600 disabled:opacity-30">Next →</button>
            </div>
          </div>
          {selectionToolbar && <div data-testid="highlight-editor-overlay" className="pointer-events-none absolute inset-x-6 top-[-4rem] z-50">
            {selectionToolbar}
          </div>}
          <div ref={viewerRef} data-testid="material-viewer" className="min-h-0 flex-1 overflow-y-auto p-6 md:p-10">
          <article className="mx-auto w-full max-w-none rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-7">
            {sourceChecked && !sourceUrl && ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'epub', 'image'].includes(material.file_type) && (
              <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                The original file is not currently available for this material. Neuron is showing its saved extracted text; sync the linked class folder again to restore the original visual view.
              </div>
            )}
            {sourceChecked && sourceUrl && !visualUrl && ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'epub'].includes(material.file_type) && (
              <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Neuron found the original file but could not build its visual preview on this Mac. The saved extracted text remains available below; try again after installing or enabling the required document viewer support.
              </div>
            )}
            {['pdf', 'ppt', 'pptx', 'doc', 'docx', 'image'].includes(material.file_type) && (visualUrl || sourceUrl) && (
              <section className="mb-8">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Original document view</div>
                </div>
                {pdfBackedType ? (
                  <PdfPageViewer
                    materialId={materialId}
                    sourceUrl={visualUrl || sourceUrl || ''}
                    fallbackUrl={`neuron-file://visual-page/${materialId}/${activeUnit + 1}`}
                    pageNumber={activeUnit + 1}
                    pageLabel={unitLabel(material.file_type, activeUnit)}
                    zoom={visualZoom}
                    boldTextOverlay={material.file_type === 'ppt' || material.file_type === 'pptx'}
                    drawMode={visualDrawMode}
                    highlights={activeHighlights.map((highlight) => ({ id: highlight.id, color: highlight.color, rects: parseLocator(highlight)?.rects || [] }))}
                    selectionRect={regionSelectionActive ? selectionRects?.[0] : null}
                    onRegionSelection={handlePdfRegionSelection}
                  />
                ) : <div className="h-[calc(100vh-310px)] min-h-[560px] w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-200/70 p-4 dark:bg-slate-950">
                  <div className="relative min-h-full">
                    <div ref={visualCanvasRef} data-testid="visual-canvas" className={`relative mx-auto ${visualDrawMode ? 'cursor-crosshair select-none' : ''}`} style={{ width: `${Math.round(visualZoom * 100)}%`, minWidth: visualZoom < 1 ? undefined : '100%', touchAction: visualDrawMode ? 'none' : undefined }} onPointerDown={beginVisualHighlight} onPointerMove={updateVisualHighlight} onPointerUp={finishVisualHighlight} onMouseDown={beginVisualHighlight} onMouseMove={updateVisualHighlight} onMouseUp={finishVisualHighlight}>
                      <img src={material.file_type === 'image' ? (sourceUrl || visualUrl || undefined) : (visualFrameUrl || undefined)} alt={`Page ${activeUnit + 1} of ${material.filename}`} data-visual-zoom={visualZoom} className="block h-auto w-full max-w-none shadow-md" />
                      <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
                      {activeHighlights.flatMap((highlight) => {
                        const rects = parseLocator(highlight)?.rects || []
                        return rects.map((rect, index) => (
                          <span
                            key={`visual-highlight-${highlight.id}-${index}`}
                            data-testid="visual-highlight"
                            className="absolute rounded-sm opacity-75 mix-blend-multiply"
                            style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: highlight.color || '#fde68a' }}
                          />
                        ))
                      })}
                      {regionSelectionActive && selectionRects?.[0] && <span data-testid="active-selection-region" className="pointer-events-none absolute z-10 rounded-sm border-2 border-violet-500 bg-violet-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" style={{ left: `${selectionRects[0].left * 100}%`, top: `${selectionRects[0].top * 100}%`, width: `${selectionRects[0].width * 100}%`, height: `${selectionRects[0].height * 100}%` }} />}
                      </div>
                      {visualDrawMode && visualDragRect?.map((rect, index) => (
                        <span key={`visual-drag-preview-${index}`} data-testid="visual-drag-preview" className="pointer-events-none absolute z-20 rounded-sm border-2 border-amber-500 bg-amber-300/35" style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />
                      ))}
                    </div>
                  </div>
                </div>}
                <p className="mt-2 text-[11px] text-slate-400">The active {material.file_type === 'pdf' ? 'page' : 'slide'} fits the viewer at default zoom. Increase zoom when you want to inspect details.</p>
              </section>
            )}
            {visualUrl && material.file_type === 'epub' && (
              <section className="mb-8">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Original EPUB reading view</div>
                <div className="overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700">
                  <div style={{ transform: `scale(${visualZoom})`, transformOrigin: 'top left', width: `${100 / visualZoom}%`, height: `${70 / visualZoom}vh` }}>
                    <iframe src={visualFrameUrl || undefined} title={`Original view of ${material.filename}`} className="h-full w-full border-0 bg-white" />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Chapter styling and embedded images are preserved in this read-only preview. Use the selectable chapter text below for annotations.</p>
              </section>
            )}
            {sourceUrl && material.file_type === 'pdf' && !visualUrl && <iframe src={sourceUrl} title={material.filename} className="mb-8 h-[70vh] w-full rounded-lg border border-slate-200 dark:border-slate-700" />}
            {['pdf', 'ppt', 'pptx', 'doc', 'docx'].includes(material.file_type) && <div className="mb-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Extracted study text</div>}
            {units[activeUnit] && (
              <section id={`material-unit-${activeUnit}`} onMouseUp={() => handleSelection(activeUnit)} className="scroll-mt-6">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{unitLabel(material.file_type, activeUnit)}</div>
                {renderAnnotatedUnit(units[activeUnit], activeHighlights, material.file_type)}
                {activeHighlights.length > 0 && (
                  <div className="mt-5 space-y-2 border-l-4 border-amber-300 pl-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Saved highlights</div>
                    {activeHighlights.map((highlight) => (
                      <div key={highlight.id} className="rounded-md px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200" style={{ backgroundColor: `${highlight.color || '#fde68a'}66` }}>
                        <mark className="rounded px-0.5" style={{ backgroundColor: highlight.color || '#fde68a' }}>{highlight.selected_text}</mark>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </article>
          </div>
        </main>

        <section className="col-start-2 row-start-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Summary · {unitLabel(material.file_type, activeUnit)}</h2><button onClick={() => void saveSummary()} disabled={saving} className="text-xs font-semibold text-violet-600 disabled:opacity-40">Save summary</button></div>
          <textarea value={summary} onChange={(event) => { const value = event.target.value; summaryDirtyRef.current = true; summaryValueRef.current = value; localStorage.setItem(summaryDraftKey, value); setSummary(value); setSaveStatus('Saving…'); scheduleSummarySave(activeUnit, value) }} onBlur={() => void saveSummary()} placeholder={`Summarize ${unitLabel(material.file_type, activeUnit).toLowerCase()} in your own words…`} className="min-h-0 flex-1 w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm outline-none focus:ring-2 focus:ring-violet-400" />
        </section>
      </div>
      {cardPreviewOpen && cardDraft && (
        <HighlightCardPreviewModal
          draft={cardDraft}
          feedback={cardRevision}
          generating={cardGenerating}
          message={cardMessage}
          error={cardError}
          onDraftChange={setCardDraft}
          onFeedbackChange={setCardRevision}
          onRevise={() => void generateCard(cardRevision, cardDraft)}
          onSave={() => void saveCardDraft()}
          onClose={closeCardPreview}
        />
      )}
    </div>
  )
}
