import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Activity, BookOpen, CheckCircle2, FileText, Lightbulb, Sparkles, Target, X, Zap } from '../icons'
import {
  TutorSessionConfig,
  DEPTH_LEVELS,
  TIME_PRESETS,
  TIME_SLIDER_MIN,
  TIME_SLIDER_MAX,
  TIME_SLIDER_STEP,
  SyllabusModule,
  ModuleTopic,
  LibraryFile,
  GapAnalysisItem,
  GapAnalysisResult,
  QuickReviewTopic,
  DocumentAnnotation,
  Lecture
} from '../../types'

interface SessionConfigModalProps {
  subjectId: number
  subjectName: string
  materialId?: number
  materialIds?: number[]
  materialName?: string
  initialTopic?: string
  initialTopics?: string[]
  initialModuleId?: number
  initialMode?: StudyMode
  onClose: () => void
}

type StudyMode = 'new_content' | 'quick_review' | 'fill_gaps' | 'active_recall' | 'syllabus' | 'material' | 'custom'

export default function SessionConfigModal({
  subjectId,
  subjectName,
  materialId: propMaterialId,
  materialIds: propMaterialIds,
  materialName: propMaterialName,
  initialTopic,
  initialTopics,
  initialModuleId: propInitialModuleId,
  initialMode: propInitialMode,
  onClose
}: SessionConfigModalProps): React.JSX.Element {
  const navigate = useNavigate()
  const { user } = useAppStore()

  // ── Mode & Topic State ──
  const [studyMode, setStudyMode] = useState<StudyMode>(
    propInitialMode || (propMaterialIds && propMaterialIds.length > 0 ? 'material' : propMaterialId ? 'material' : propInitialModuleId ? 'syllabus' : initialTopic ? 'custom' : 'new_content')
  )
  const [modules, setModules] = useState<(SyllabusModule & { topics?: ModuleTopic[] })[]>([])
  const [materialsList, setMaterialsList] = useState<LibraryFile[]>([])
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysisResult | null>(null)
  const [loadingGaps, setLoadingGaps] = useState(true)
  const [loadingData, setLoadingData] = useState(true)

  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(propInitialModuleId || null)
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic || '')
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    initialTopics && initialTopics.length > 0 ? initialTopics : initialTopic ? [initialTopic] : []
  )
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>(
    propMaterialIds && propMaterialIds.length > 0
      ? propMaterialIds
      : propMaterialId
        ? [propMaterialId]
        : []
  )
  const [materialAnnotationsById, setMaterialAnnotationsById] = useState<Record<number, DocumentAnnotation[]>>({})
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<number[]>([])
  const [lecturesList, setLecturesList] = useState<Lecture[]>([])
  const [selectedLectureIds, setSelectedLectureIds] = useState<number[]>([])
  const [lectureAnnotationsById, setLectureAnnotationsById] = useState<Record<number, DocumentAnnotation[]>>({})
  const [selectedLectureAnnotationIds, setSelectedLectureAnnotationIds] = useState<number[]>([])
  const [customTopic, setCustomTopic] = useState(initialTopic || '')
  const [quickReviewTopics, setQuickReviewTopics] = useState<QuickReviewTopic[]>([])
  const [selectedGapKeys, setSelectedGapKeys] = useState<string[]>([])
  const [useSuggestedGapTime, setUseSuggestedGapTime] = useState(false)

  // ── Config State ──
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedDepth, setSelectedDepth] = useState<1 | 2 | 3 | 4 | 5 | 'adaptive'>('adaptive')
  const [neverStudied, setNeverStudied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sliderValue, setSliderValue] = useState<number>(30)
  const [inputValue, setInputValue] = useState('')

  const sliderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    if (selectedMaterialIds.length === 0) {
      setMaterialAnnotationsById({})
      setSelectedAnnotationIds([])
      return () => { active = false }
    }
    Promise.all(selectedMaterialIds.map(async (materialId) => {
      try {
        return [materialId, await window.electronAPI.listDocumentAnnotations({ materialId })] as const
      } catch {
        return [materialId, [] as DocumentAnnotation[]] as const
      }
    })).then((entries) => {
      if (!active) return
      const annotationMap = Object.fromEntries(entries) as Record<number, DocumentAnnotation[]>
      setMaterialAnnotationsById(annotationMap)
      setSelectedAnnotationIds(entries.flatMap(([, rows]) => rows.map((row) => row.id)))
    })
    return () => { active = false }
  }, [selectedMaterialIds])

  // "Never studied" adds foundational scaffolding in the tutor prompt but
  // must not silently rewrite the learner's selected difficulty level.
  const finalDepth: 1 | 2 | 3 | 4 | 5 | 'adaptive' =
    selectedDepth === 'adaptive'
      ? 'adaptive'
      : selectedDepth

  // All new topics across entire class
  const allNewTopicsList = modules.flatMap(mod =>
    (mod.topics || [])
      .filter(t => Boolean(t.has_new_material || t.is_gap) && !t.completed && !(t as any).studied)
      .map(t => ({ topic: t, module: mod }))
  )

  const gapKey = (item: GapAnalysisItem): string => item.topicId ? `topic:${item.topicId}` : `${item.type}:${item.moduleId || 'none'}:${item.topic.toLocaleLowerCase()}`
  const gapItems = gapAnalysis ? (gapAnalysis.items || [...gapAnalysis.struggledTopics, ...gapAnalysis.uncoveredTopics]) : []
  const selectedGapItems = gapItems.filter(item => selectedGapKeys.includes(gapKey(item)))
  const suggestedGapMinutes = selectedGapItems.reduce((total, item) => total + (item.recommendedMinutes || item.estimatedMinutes || 20), 0)

  function selectRecommendedGaps(analysis = gapAnalysis): void {
    if (!analysis) return
    const all = analysis.items || [...analysis.struggledTopics, ...analysis.uncoveredTopics]
    const recommended = analysis.recommendedTopics || []
    const matches = all.filter(item => recommended.some(topic => topic.toLocaleLowerCase() === item.topic.toLocaleLowerCase()))
    setSelectedGapKeys((matches.length > 0 ? matches : all.slice(0, 1)).map(gapKey))
  }

  function getGapTopicId(item: GapAnalysisItem): number | undefined {
    return item.topicId
  }

  // ── Load syllabus, materials, and gap analysis ──
  useEffect(() => {
    let isMounted = true

    async function loadData(): Promise<void> {
      setLoadingData(true)
      try {
        // Load modules & topics
        const mods = (await window.electronAPI.syllabusListModules(subjectId)) as SyllabusModule[]
        const modsWithTopics: (SyllabusModule & { topics?: ModuleTopic[] })[] = []
        for (const mod of mods) {
          try {
            const tops = (await window.electronAPI.syllabusListTopics(mod.id)) as ModuleTopic[]
            modsWithTopics.push({ ...mod, topics: tops })
          } catch {
            modsWithTopics.push({ ...mod, topics: [] })
          }
        }

        // Load full-subject curriculum topics for Quick Review
        try {
          const qrTops = (await window.electronAPI.tutorGetSubjectCurriculumTopics(subjectId)) as QuickReviewTopic[]
          if (isMounted) setQuickReviewTopics(qrTops || [])
        } catch (qrErr) {
          console.warn('Failed to load Quick Review topics:', qrErr)
        }
        if (isMounted) {
          setModules(modsWithTopics)

          const allNew = modsWithTopics.flatMap(mod =>
            (mod.topics || [])
              .filter(t => Boolean(t.has_new_material || t.is_gap) && !t.completed && !(t as any).studied)
              .map(t => t.title)
          )

          if (propInitialMode === 'new_content' || (!propInitialMode && !propMaterialId && !propInitialModuleId && !initialTopic && allNew.length > 0)) {
            if (initialTopics && initialTopics.length > 0) {
              setSelectedTopics(initialTopics)
              setSelectedTopic(initialTopics.join(', '))
            } else if (allNew.length > 0) {
              setSelectedTopics(allNew)
              setSelectedTopic(allNew.join(', '))
            }
          } else if (propInitialModuleId) {
            setSelectedModuleId(propInitialModuleId)
            const targetMod = modsWithTopics.find(m => m.id === propInitialModuleId)
            if (initialTopics && initialTopics.length > 0) {
              setSelectedTopics(initialTopics)
              setSelectedTopic(initialTopics.join(', '))
            } else if (targetMod?.topics && targetMod.topics.length > 0) {
              setSelectedTopics(targetMod.topics.map(t => t.title))
              setSelectedTopic(targetMod.topics[0].title)
            } else if (targetMod) {
              setSelectedTopics([targetMod.title])
              setSelectedTopic(targetMod.title)
            }
          } else if (modsWithTopics.length > 0 && !selectedModuleId) {
            setSelectedModuleId(modsWithTopics[0].id)
            if (initialTopics && initialTopics.length > 0) {
              setSelectedTopics(initialTopics)
              setSelectedTopic(initialTopics.join(', '))
            } else if (modsWithTopics[0].topics && modsWithTopics[0].topics.length > 0) {
              setSelectedTopic(modsWithTopics[0].topics[0].title)
              setSelectedTopics([modsWithTopics[0].topics[0].title])
            } else {
              setSelectedTopic(modsWithTopics[0].title)
              setSelectedTopics([modsWithTopics[0].title])
            }
          }
        }

        // Load materials
        const mats = (await window.electronAPI.libraryGetFiles(subjectId)) as LibraryFile[]
        const lectures = await window.electronAPI.listLectures(subjectId)
        const lectureAnnotationEntries = await Promise.all(lectures.map(async (lecture) => {
          try {
            return [lecture.id, await window.electronAPI.listDocumentAnnotations({ lectureId: lecture.id })] as const
          } catch {
            return [lecture.id, [] as DocumentAnnotation[]] as const
          }
        }))
        if (isMounted) {
          setMaterialsList(mats)
          setLecturesList(lectures)
          const annotationMap = Object.fromEntries(lectureAnnotationEntries) as Record<number, DocumentAnnotation[]>
          setLectureAnnotationsById(annotationMap)
          setSelectedLectureAnnotationIds([])
          if (propMaterialId) setSelectedMaterialIds([propMaterialId])
        }
      } catch (err) {
        console.error('Failed to load syllabus/materials for config modal:', err)
      } finally {
        if (isMounted) setLoadingData(false)
      }
    }

    async function loadGaps(): Promise<void> {
      setLoadingGaps(true)
      try {
        const gaps = (await window.electronAPI.tutorGetGapAnalysis(subjectId, user?.id || 0)) as GapAnalysisResult
        if (isMounted) {
          setGapAnalysis(gaps)
          const allGapItems = gaps.items || [...gaps.struggledTopics, ...gaps.uncoveredTopics]
          const initialGap = initialTopic
            ? allGapItems.find(item => item.topic.toLocaleLowerCase() === initialTopic.toLocaleLowerCase())
            : undefined
          if (initialGap) setSelectedGapKeys([gapKey(initialGap)])
          else selectRecommendedGaps(gaps)
        }
      } catch (err) {
        console.error('Failed to load gap analysis:', err)
      } finally {
        if (isMounted) setLoadingGaps(false)
      }
    }

    loadData()
    loadGaps()

    return () => {
      isMounted = false
    }
  }, [subjectId, user?.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleTimePreset(minutes: number | null): void {
    setSelectedTime(minutes)
    if (minutes !== null) {
      setSliderValue(minutes)
      setInputValue(String(minutes))
    } else {
      setSliderValue(TIME_SLIDER_MIN)
      setInputValue('')
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = Number(e.target.value)
    setSliderValue(val)
    setSelectedTime(val)
    setInputValue(String(val))
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= TIME_SLIDER_MIN && parsed <= TIME_SLIDER_MAX) {
      setSliderValue(parsed)
      setSelectedTime(parsed)
    }
  }, [])

  function handleInputBlur(): void {
    const parsed = parseInt(inputValue, 10)
    if (!isNaN(parsed) && parsed >= TIME_SLIDER_MIN && parsed <= TIME_SLIDER_MAX) {
      setSliderValue(parsed)
      setSelectedTime(parsed)
      setInputValue(String(parsed))
    } else if (inputValue !== '') {
      setInputValue(selectedTime !== null ? String(selectedTime) : '')
    }
  }

  function handleStart(): void {
    if (starting) return
    setStarting(true)

    let chosenTopic = ''
    let chosenTopics: string[] = []
    let chosenModuleId: number | undefined
    let chosenModuleName: string | undefined
    let chosenMaterialIds: number[] = []
    let chosenMaterialId: number | undefined
    let chosenMaterialName: string | undefined
    let isFillGaps = false
    let gapTopics: string[] = []

    let isActiveRecall = false
    let isQuickReview = false
    let qrTopics: QuickReviewTopic[] = []

    if (studyMode === 'quick_review') {
      isQuickReview = true
      qrTopics = quickReviewTopics
      chosenTopics = quickReviewTopics.map(t => t.title)
      chosenTopic = `Quick Review: ${subjectName} (${quickReviewTopics.length} topics)`
    } else if (studyMode === 'new_content') {
      if (selectedTopics.length > 0) {
        chosenTopics = selectedTopics
        chosenTopic = selectedTopics.join(', ')
      } else {
        const allNew = modules.flatMap(mod =>
          (mod.topics || [])
            .filter(t => Boolean(t.has_new_material || t.is_gap))
            .map(t => t.title)
        )
        chosenTopics = allNew.length > 0 ? allNew : [subjectName]
        chosenTopic = chosenTopics.join(', ')
      }
    } else if (studyMode === 'fill_gaps') {
      isFillGaps = true
      gapTopics = selectedGapItems.map(item => item.topic)
      chosenTopic = gapTopics[0] || gapAnalysis?.recommendedFocus || 'Identified Knowledge Gap'
      chosenModuleId = selectedGapItems[0]?.moduleId || gapAnalysis?.recommendedModuleId
      chosenTopics = gapTopics
    } else if (studyMode === 'active_recall') {
      isActiveRecall = true
      chosenTopic = 'Active Recall Drill — Rapid Q&A'
    } else if (studyMode === 'syllabus') {
      const activeMod = modules.find(m => m.id === selectedModuleId)
      chosenModuleId = activeMod?.id
      chosenModuleName = activeMod?.title
      if (selectedTopics.length > 0) {
        chosenTopics = selectedTopics
        chosenTopic = selectedTopics.join(', ')
      } else {
        chosenTopics = activeMod?.topics && activeMod.topics.length > 0
          ? activeMod.topics.map(t => t.title)
          : (activeMod?.title ? [activeMod.title] : [])
        chosenTopic = chosenTopics.join(', ') || activeMod?.title || subjectName
      }
    } else if (studyMode === 'material') {
      const activeMats = materialsList.filter(m => selectedMaterialIds.includes(m.id))
      chosenMaterialIds = activeMats.map(m => m.id)
      chosenMaterialId = chosenMaterialIds[0] || propMaterialId
      chosenMaterialName = activeMats.length === 1
        ? activeMats[0].filename
        : activeMats.length > 1
          ? `${activeMats.length} selected materials`
          : propMaterialName
      chosenTopic = chosenMaterialName ? `Material: ${chosenMaterialName}` : subjectName
    } else if (studyMode === 'custom') {
      chosenTopic = customTopic.trim() || subjectName
    }

    const finalDuration = selectedTime !== null
      ? selectedTime
      : (studyMode === 'fill_gaps' && useSuggestedGapTime ? suggestedGapMinutes || gapAnalysis?.recommendedEstimatedMinutes || null : null)

    const config: TutorSessionConfig = {
      duration_minutes: finalDuration,
      depth_level: finalDepth,
      never_studied: neverStudied || studyMode === 'new_content',
      material_id: chosenMaterialId,
      material_ids: studyMode === 'material' ? chosenMaterialIds : undefined,
      material_name: chosenMaterialName,
      annotation_ids: studyMode === 'material'
        ? [...selectedAnnotationIds, ...selectedLectureAnnotationIds]
        : undefined,
      // Annotation IDs are authoritative when present, so lecture_ids is only
      // used for backwards-compatible whole-lecture selection when no sidecar
      // annotations exist yet.
      lecture_ids: studyMode === 'material' && selectedLectureIds.length > 0 && selectedLectureAnnotationIds.length === 0
        ? selectedLectureIds
        : undefined,
      module_id: chosenModuleId,
      module_name: chosenModuleName,
      target_topic: chosenTopic,
      target_topics: chosenTopics.length > 0 ? chosenTopics : undefined,
      target_topic_ids: isQuickReview
        ? quickReviewTopics.map(t => t.id).filter(id => id > 0)
        : isFillGaps
          ? selectedGapItems.map(getGapTopicId).filter((id): id is number => id !== undefined)
          : undefined,
      gap_topic_ids: isFillGaps
        ? selectedGapItems.map(getGapTopicId).filter((id): id is number => id !== undefined)
        : undefined,
      gap_target_ids: isFillGaps ? selectedGapItems.map(item => getGapTopicId(item) ?? null) : undefined,
      gap_evidence_by_topic_id: isFillGaps
        ? Object.fromEntries(selectedGapItems.filter(item => item.topicId).map(item => [item.topicId, item.evidence || []]))
        : undefined,
      recommended_minutes_by_topic_id: isFillGaps
        ? Object.fromEntries(selectedGapItems.filter(item => item.topicId).map(item => [item.topicId, item.recommendedMinutes || item.estimatedMinutes || 20]))
        : undefined,
      is_fill_gaps: isFillGaps,
      gap_topics: gapTopics,
      is_active_recall: isActiveRecall,
      is_quick_review: isQuickReview,
      quick_review_topics: isQuickReview ? qrTopics : undefined
    }

    const encoded = encodeURIComponent(JSON.stringify(config))
    navigate(`/tutor/${subjectId}?config=${encoded}`)
  }

  function isPresetActive(minutes: number | null): boolean {
    if (minutes === null) return selectedTime === null
    return selectedTime === minutes
  }

  // Find active module topics
  const currentModule = modules.find(m => m.id === selectedModuleId)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutor-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl max-h-[min(92vh,860px)] flex flex-col my-auto overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neuron-100 text-neuron-600 dark:bg-neuron-900/50 dark:text-neuron-300">
                <Sparkles size={16} />
              </span>
              <span className="text-xs font-semibold text-neuron-600 dark:text-neuron-300">AI tutor</span>
            </div>
            <h2 id="tutor-session-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Start a study session
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{subjectName}</span>
              {gapAnalysis && gapAnalysis.totalGapsCount > 0 && <span>{gapAnalysis.totalGapsCount} gap{gapAnalysis.totalGapsCount === 1 ? '' : 's'} detected</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close study session setup"
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-5 sm:px-7 py-5 space-y-7 flex-1">
          {/* ── Topic Selection Tabs / Mode ── */}
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">How would you like to study?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose a guided path, or focus on a specific source.</p>
              {gapAnalysis && gapAnalysis.totalGapsCount > 0 && (
                <span className="sr-only">{gapAnalysis.totalGapsCount} gaps detected</span>
              )}
            </div>

            {/* Mode selection buttons */}
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Recommended</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setStudyMode('new_content')
                  if (selectedTopics.length === 0 && allNewTopicsList.length > 0) {
                    setSelectedTopics(allNewTopicsList.map(i => i.topic.title))
                  }
                }}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'new_content'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300"><Sparkles size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">New content</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{allNewTopicsList.length > 0 ? `${allNewTopicsList.length} new topics` : 'Across class'}</span></span>
                {studyMode === 'new_content' && <CheckCircle2 size={16} className="text-neuron-600 dark:text-neuron-300" />}
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('quick_review')}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'quick_review'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300"><Zap size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Quick review</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{quickReviewTopics.length > 0 ? `${quickReviewTopics.length} topics · 1–3 questions` : 'All topics'}</span></span>
                {studyMode === 'quick_review' && <CheckCircle2 size={16} className="text-neuron-600 dark:text-neuron-300" />}
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('fill_gaps')}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'fill_gaps'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300"><Target size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Fill gaps</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Target your weakest areas</span></span>
                {studyMode === 'fill_gaps' && <CheckCircle2 size={16} className="text-neuron-600 dark:text-neuron-300" />}
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('active_recall')}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'active_recall'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300"><Activity size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Active recall</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Continuous questions and answers</span></span>
                {studyMode === 'active_recall' && <CheckCircle2 size={16} className="text-neuron-600 dark:text-neuron-300" />}
              </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Choose a source</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">

              <button
                type="button"
                onClick={() => setStudyMode('syllabus')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'syllabus'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <BookOpen size={16} className="shrink-0 text-neuron-600 dark:text-neuron-300" /><span><span className="block text-xs font-semibold">Syllabus</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Choose module</span></span>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('material')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'material'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <FileText size={16} className="shrink-0 text-neuron-600 dark:text-neuron-300" /><span><span className="block text-xs font-semibold">Material</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Study a file</span></span>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('custom')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 ${
                  studyMode === 'custom'
                    ? 'border-neuron-400 bg-neuron-50 text-neuron-900 shadow-sm dark:border-neuron-500 dark:bg-neuron-900/30 dark:text-neuron-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-neuron-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-neuron-700 dark:hover:bg-slate-800'
                }`}
              >
                <Lightbulb size={16} className="shrink-0 text-neuron-600 dark:text-neuron-300" /><span><span className="block text-xs font-semibold">Custom</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Type a topic</span></span>
              </button>
              </div>
            </div>

            {/* ── Mode 0: New Content Box ── */}
            {studyMode === 'new_content' && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-amber-50/80 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-amber-950/30 border border-amber-300/80 dark:border-amber-700/60 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>✨</span> Study New & Unreviewed Content
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Target new concepts and unreviewed topics across all modules in this class.
                    </p>
                  </div>
                  {allNewTopicsList.length > 0 && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 shrink-0">
                      {allNewTopicsList.length} new topic{allNewTopicsList.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {loadingData ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                    <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    Scanning curriculum for new content...
                  </div>
                ) : allNewTopicsList.length > 0 ? (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Select Topics to Study ({selectedTopics.length}/{allNewTopicsList.length}):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTopics(allNewTopicsList.map(item => item.topic.title))
                          }}
                          className="text-amber-700 dark:text-amber-400 hover:underline font-semibold"
                        >
                          Select all
                        </button>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedTopics([])}
                          className="text-slate-500 dark:text-slate-400 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Grouped by module */}
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {modules
                        .filter(mod => (mod.topics || []).some(t => Boolean(t.has_new_material || t.is_gap) && !t.completed && !(t as any).studied))
                        .map(mod => {
                          const modNewTopics = (mod.topics || []).filter(t => Boolean(t.has_new_material || t.is_gap) && !t.completed && !(t as any).studied)
                          return (
                            <div key={mod.id} className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-amber-200/80 dark:border-amber-800/60 space-y-1.5">
                              <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center justify-between">
                                <span>📖 {mod.title}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                  {modNewTopics.length} new
                                </span>
                              </div>
                              <div className="space-y-1">
                                {modNewTopics.map(topic => {
                                  const isChecked = selectedTopics.includes(topic.title)
                                  return (
                                    <label
                                      key={topic.id}
                                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                        isChecked
                                          ? 'border-amber-400 bg-amber-50/90 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 font-medium'
                                          : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={e => {
                                            if (e.target.checked) {
                                              setSelectedTopics(prev => [...prev, topic.title])
                                            } else {
                                              setSelectedTopics(prev => prev.filter(t => t !== topic.title))
                                            }
                                          }}
                                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>{topic.title}</span>
                                      </div>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 font-semibold">
                                        {topic.has_new_material ? '✨ New' : '⚠️ Gap'}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="p-3 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 text-xs text-amber-900 dark:text-amber-200">
                      No recently tagged new materials found. Showing all unstudied curriculum topics across all modules:
                    </div>
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {modules.map(mod => {
                        const unstudiedTopics = (mod.topics || []).filter(t => !t.completed && !(t as any).studied)
                        if (unstudiedTopics.length === 0) return null
                        return (
                          <div key={mod.id} className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                              📖 {mod.title}
                            </div>
                            <div className="space-y-1">
                              {unstudiedTopics.map(topic => {
                                const isChecked = selectedTopics.includes(topic.title)
                                return (
                                  <label
                                    key={topic.id}
                                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                      isChecked
                                        ? 'border-amber-400 bg-amber-50/90 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 font-medium'
                                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={e => {
                                          if (e.target.checked) {
                                            setSelectedTopics(prev => [...prev, topic.title])
                                          } else {
                                            setSelectedTopics(prev => prev.filter(t => t !== topic.title))
                                          }
                                        }}
                                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                      />
                                      <span>{topic.title}</span>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Mode: Quick Review Box ── */}
            {studyMode === 'quick_review' && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/90 via-violet-50/40 to-amber-50/80 dark:from-amber-950/40 dark:via-violet-950/20 dark:to-amber-950/30 border border-amber-300/80 dark:border-amber-700/60 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>⚡</span> Quick Review — Full Subject Coverage
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Neuron will systematically progress through every topic in your subject, asking 1–3 core questions per topic (math problem, Socratic reasoning, or active recall based on what's most effective).
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 flex-shrink-0">
                    {quickReviewTopics.length} topic{quickReviewTopics.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Curriculum topics list preview */}
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-2.5 border border-amber-200/80 dark:border-amber-800/50 max-h-48 overflow-y-auto space-y-1.5">
                  {quickReviewTopics.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2 text-center">
                      No syllabus topics found for this class yet. Upload materials or generate a syllabus to unlock structured Quick Review.
                    </p>
                  ) : (
                    quickReviewTopics.map((topic, idx) => (
                      <div key={topic.id || idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {topic.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">
                          {topic.module_title}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <span>💡</span>
                  <span>Recommended: Use "Untimed" duration so you can complete all {quickReviewTopics.length} topics at your own pace.</span>
                </div>
              </div>
            )}

            {/* ── Mode Active Recall Box ── */}
            {studyMode === 'active_recall' && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/50 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <span>🎯</span> Continuous Active Recall Drill
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  The AI tutor will ask sharp active recall questions one after another, correct your answers immediately with clean LaTeX math solutions, and keep going continuously until you finish.
                </p>
              </div>
            )}

            {/* ── Mode 1: Fill in Gaps Box ── */}
            {studyMode === 'fill_gaps' && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50/80 to-purple-50/50 dark:from-violet-950/40 dark:to-purple-950/20 border border-violet-200 dark:border-violet-800 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                      <span>⚡</span> Auto-Detected Knowledge Gaps
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Neuron uses your past tutor sessions to target topics you struggled with or haven't covered yet.
                    </p>
                  </div>
                </div>

                {loadingGaps ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                    <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    Analyzing your learning history & syllabus...
                  </div>
                ) : gapAnalysis ? (
                  <div className="space-y-3 pt-1">
                    {gapItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-violet-200 dark:border-violet-800 px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        No gaps have been detected yet. Try Syllabus or Custom study to choose a topic directly.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-violet-700 dark:text-violet-300">Select the gaps to study</span>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => selectRecommendedGaps()} className="rounded-md border border-violet-200 px-2 py-1 font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-900/40">Select recommended</button>
                            <button type="button" onClick={() => setSelectedGapKeys(gapItems.map(gapKey))} className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Select all</button>
                            <button type="button" onClick={() => setSelectedGapKeys([])} className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Clear</button>
                          </div>
                        </div>
                        {(['struggled', 'refresh', 'uncovered'] as const).map((kind) => {
                          const items = gapItems.filter(item => kind === 'struggled' ? item.type === 'struggled' : kind === 'uncovered' ? item.type === 'uncovered' : item.type === 'refresh')
                          if (items.length === 0) return null
                          const heading = kind === 'struggled' ? 'Needs attention' : kind === 'refresh' ? 'Refresh soon' : 'Not yet assessed'
                          return (
                            <div key={kind} className="space-y-1.5">
                              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{heading}</span>
                              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                                {items.map((item) => {
                                  const key = gapKey(item)
                                  const checked = selectedGapKeys.includes(key)
                                  return (
                                    <label key={key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${checked ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/30' : 'border-slate-200 bg-white/70 hover:border-violet-200 dark:border-slate-700 dark:bg-slate-800/50'}`}>
                                      <input aria-label={`Study ${item.topic}`} type="checkbox" checked={checked} onChange={() => setSelectedGapKeys(previous => checked ? previous.filter(value => value !== key) : [...previous, key])} className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                                      <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100"><span className="truncate">{item.topic}</span><span className="shrink-0 text-[10px] font-medium text-violet-600 dark:text-violet-300">~{item.recommendedMinutes || item.estimatedMinutes || 20} min</span></span>
                                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{item.details || item.evidence?.[0]?.detail || item.moduleTitle || 'Detected from your learning history'}</span>
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-200/60 pt-2 dark:border-violet-800/60">
                          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{selectedGapItems.length} selected · ~{suggestedGapMinutes} min suggested</span>
                          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300"><input type="checkbox" checked={useSuggestedGapTime} onChange={event => { const checked = event.target.checked; setUseSuggestedGapTime(checked); if (checked) { setSelectedTime(suggestedGapMinutes || null); setInputValue(suggestedGapMinutes ? String(suggestedGapMinutes) : '') } else if (selectedTime === suggestedGapMinutes) { setSelectedTime(null); setInputValue('') } }} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" /> Use suggested time</label>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No learning gaps detected yet. Tutor will introduce the first unstudied syllabus material.
                  </p>
                )}
              </div>
            )}

            {/* ── Mode 2: Syllabus Modules & Topics ── */}
            {studyMode === 'syllabus' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
                {loadingData ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
                    <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    Loading syllabus...
                  </div>
                ) : modules.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      No syllabus modules found for this class.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStudyMode('custom')}
                      className="text-xs text-violet-600 dark:text-violet-400 font-semibold hover:underline"
                    >
                      Type a custom topic instead →
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        Select Module:
                      </label>
                      <select
                        value={selectedModuleId || ''}
                        onChange={e => {
                          const id = Number(e.target.value)
                          setSelectedModuleId(id)
                          const mod = modules.find(m => m.id === id)
                          if (mod?.topics && mod.topics.length > 0) {
                            setSelectedTopics(mod.topics.map(t => t.title))
                            setSelectedTopic(mod.topics[0].title)
                          } else if (mod) {
                            setSelectedTopics([mod.title])
                            setSelectedTopic(mod.title)
                          }
                        }}
                        className="w-full text-xs font-medium bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        {modules.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.title} {m.status === 'completed' ? '✓' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {currentModule && currentModule.topics && currentModule.topics.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Select Topics to Study ({selectedTopics.length}/{currentModule.topics.length}):
                          </label>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setSelectedTopics(currentModule.topics!.map(t => t.title))}
                              className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
                            >
                              Select all
                            </button>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <button
                              type="button"
                              onClick={() => setSelectedTopics([])}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {currentModule.topics.map(t => {
                            const isSelected = selectedTopics.includes(t.title)
                            const isDone = Boolean(t.completed || (t as ModuleTopic & { studied?: boolean }).studied)

                            return (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setSelectedTopics(prev =>
                                    prev.includes(t.title)
                                      ? prev.filter(item => item !== t.title)
                                      : [...prev, t.title]
                                  )
                                  setSelectedTopic(t.title)
                                }}
                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                                  isSelected
                                    ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100 border border-violet-300 dark:border-violet-700 shadow-sm'
                                    : 'bg-white dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 pointer-events-none"
                                  />
                                  <span className="truncate">{t.title}</span>
                                </div>
                                {isDone && (
                                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">
                                    ✓ Done
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {selectedTopics.length === 0 && (
                          <p className="text-[11px] text-slate-400 mt-1 italic">
                            All topics in this module will be covered by default.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Mode 3: Specific Material ── */}
            {studyMode === 'material' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
                {materialsList.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-3">
                    No uploaded materials found for this class.
                  </p>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Choose Material / Document:
                    </label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {materialsList.map(mat => {
                        const isSelected = selectedMaterialIds.includes(mat.id)
                        return (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => setSelectedMaterialIds((current) => isSelected ? current.filter((id) => id !== mat.id) : [...current, mat.id])}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                              isSelected
                                ? 'bg-violet-600 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                            }`}
                          >
                            <span>📄</span>
                            <span className="truncate flex-1">{mat.filename}</span>
                            {isSelected && <span>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedMaterialIds.map((materialId) => {
                        const annotations = materialAnnotationsById[materialId] || []
                        const material = materialsList.find((item) => item.id === materialId)
                        return (
                          <div key={materialId} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/60 p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Notes & highlights · {material?.filename || 'Material'}</span>
                              <button type="button" onClick={() => setSelectedAnnotationIds((current) => current.length >= annotations.length && annotations.every((row) => current.includes(row.id)) ? current.filter((id) => !annotations.some((row) => row.id === id)) : [...new Set([...current, ...annotations.map((row) => row.id)])])} className="text-[10px] text-violet-600 dark:text-violet-400">
                                {annotations.length > 0 && annotations.every((row) => selectedAnnotationIds.includes(row.id)) ? 'Deselect all' : 'Select all'}
                              </button>
                            </div>
                            {annotations.length === 0 ? (
                              <p className="text-[10px] text-slate-400">No Cornell annotations saved for this material yet.</p>
                            ) : (
                              <div className="space-y-1 max-h-28 overflow-y-auto">
                                {annotations.map((annotation) => (
                                  <label key={annotation.id} className="flex items-start gap-2 text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={selectedAnnotationIds.includes(annotation.id)} onChange={(event) => setSelectedAnnotationIds((current) => event.target.checked ? [...new Set([...current, annotation.id])] : current.filter((id) => id !== annotation.id))} className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                                    <span><strong className="uppercase text-violet-500">{annotation.kind}</strong>{annotation.selected_text ? ` — “${annotation.selected_text.slice(0, 65)}${annotation.selected_text.length > 65 ? '…' : ''}”` : ` — ${annotation.body.slice(0, 80)}`}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {lecturesList.length > 0 && (
                      <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/60 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Lecture notes</span>
                          <button type="button" onClick={() => {
                            const selectAll = selectedLectureIds.length !== lecturesList.length
                            setSelectedLectureIds(selectAll ? lecturesList.map((lecture) => lecture.id) : [])
                            setSelectedLectureAnnotationIds(selectAll ? Object.values(lectureAnnotationsById).flat().map((annotation) => annotation.id) : [])
                          }} className="text-[10px] text-violet-600 dark:text-violet-400">
                            {selectedLectureIds.length === lecturesList.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {lecturesList.map((lecture) => {
                            const lectureAnnotations = lectureAnnotationsById[lecture.id] || []
                            const lectureSelected = selectedLectureIds.includes(lecture.id)
                            return (
                              <div key={lecture.id} className="rounded-md border border-slate-100 dark:border-slate-700/60 p-1.5">
                                <label className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer">
                                  <input type="checkbox" checked={lectureSelected} onChange={(event) => {
                                    setSelectedLectureIds((current) => event.target.checked ? [...current, lecture.id] : current.filter((id) => id !== lecture.id))
                                    setSelectedLectureAnnotationIds((current) => event.target.checked
                                      ? [...new Set([...current, ...lectureAnnotations.map((annotation) => annotation.id)])]
                                      : current.filter((id) => !lectureAnnotations.some((annotation) => annotation.id === id)))
                                  }} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                                  <span className="truncate">🎙️ {lecture.title}</span>
                                </label>
                                {lectureAnnotations.length > 0 && (
                                  <div className="ml-5 mt-1 space-y-0.5">
                                    {lectureAnnotations.map((annotation) => (
                                      <label key={annotation.id} className="flex items-start gap-1.5 text-[9px] text-slate-500 dark:text-slate-400 cursor-pointer">
                                        <input type="checkbox" checked={selectedLectureAnnotationIds.includes(annotation.id)} onChange={(event) => setSelectedLectureAnnotationIds((current) => event.target.checked ? [...new Set([...current, annotation.id])] : current.filter((id) => id !== annotation.id))} className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                                        <span><strong className="uppercase text-violet-500">{annotation.kind}</strong>{annotation.selected_text ? ` — “${annotation.selected_text.slice(0, 55)}${annotation.selected_text.length > 55 ? '…' : ''}”` : ` — ${annotation.body.slice(0, 70)}`}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Mode 4: Custom Topic ── */}
            {studyMode === 'custom' && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                  Enter Custom Topic or Question:
                </label>
                <input
                  type="text"
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  placeholder="e.g. Binary Search Trees, Cell Respiration, French Passé Composé"
                  className="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  The AI tutor will build the entire session around this specific topic.
                </p>
              </div>
            )}
          </div>

          {/* ── Session Settings ── */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/45">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-neuron-600 shadow-sm dark:bg-slate-900 dark:text-neuron-300"><Target size={15} /></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Session settings</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Tune the pace and challenge before you begin.</p>
              </div>
            </div>

            {/* ── Difficulty Selector ── */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 block">
                Difficulty level
              </label>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setSelectedDepth('adaptive')}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                  selectedDepth === 'adaptive'
                    ? 'border-violet-500 dark:border-violet-500 bg-violet-50/90 dark:bg-violet-900/30 shadow-xs'
                    : 'border-transparent bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <div className="flex-1 flex items-baseline justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        selectedDepth === 'adaptive'
                          ? 'text-violet-700 dark:text-violet-300'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      Adaptive (AI Calibrated)
                    </span>
                    <span
                      className={`text-[11px] ${
                        selectedDepth === 'adaptive'
                          ? 'text-violet-600 dark:text-violet-400 font-medium'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      Auto-scales dynamically based on your mastery & retention
                    </span>
                  </div>
                </div>
              </button>

              {DEPTH_LEVELS.map(dl => {
                const isSelected = selectedDepth === dl.level
                return (
                  <button
                    key={dl.level}
                    type="button"
                    onClick={() => setSelectedDepth(dl.level)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
                        : 'border-transparent bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{dl.icon}</span>
                      <div className="flex-1 flex items-baseline justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            isSelected
                              ? 'text-violet-700 dark:text-violet-300'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {dl.name}
                        </span>
                        <span
                          className={`text-[11px] ${
                            isSelected
                              ? 'text-violet-500 dark:text-violet-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {dl.description}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            </div>

          {/* ── Time Selector ── */}
            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 block">
                Session duration <span className="font-normal text-slate-400">(optional)</span>
              </label>

            {/* Preset buttons */}
            <div className="flex gap-2 flex-wrap mb-3">
              {TIME_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleTimePreset(preset.minutes)}
                  className={`flex-1 min-w-[55px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isPresetActive(preset.minutes)
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Slider + input */}
            {selectedTime !== null ? (
              <div className="flex items-center gap-3">
                <input
                  ref={sliderRef}
                  type="range"
                  min={TIME_SLIDER_MIN}
                  max={TIME_SLIDER_MAX}
                  step={TIME_SLIDER_STEP}
                  value={sliderValue}
                  onChange={handleSliderChange}
                  className="flex-1 accent-violet-600 h-1.5 rounded-full cursor-pointer"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number"
                    min={TIME_SLIDER_MIN}
                    max={TIME_SLIDER_MAX}
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    className="w-14 text-center text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <span className="text-xs text-slate-400">min</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                No time limit — study at your own pace
              </p>
            )}
            </div>

          {/* ── Never Studied Toggle ── */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={neverStudied}
                onChange={e => setNeverStudied(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
              />
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  I've never studied this topic before
                </span>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Start from absolute fundamentals without assuming prior knowledge.
                </p>
              </div>
            </label>
            </div>
          </div>
        </div>

        {/* ── Summary & Start ── */}
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
            <span className="block truncate font-semibold text-neuron-600 dark:text-neuron-300">
              {studyMode === 'new_content'
                ? `New content · ${selectedTopics.length > 0 ? selectedTopics.length + ' topic' + (selectedTopics.length > 1 ? 's' : '') : 'All'}`
                : studyMode === 'fill_gaps'
                ? 'Fill gaps'
                : studyMode === 'active_recall'
                ? 'Active recall'
                : studyMode === 'syllabus'
                ? `${selectedTopic || 'Syllabus'}`
                : studyMode === 'material'
                ? 'Material'
                : customTopic || 'Custom'}
            </span>
            <span className="block truncate text-[11px]">{selectedTime !== null ? `${selectedTime} min` : 'No time limit'} · {DEPTH_LEVELS.find(d => d.level === finalDepth)?.name}</span>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={starting || (studyMode === 'fill_gaps' && selectedGapItems.length === 0) || (studyMode === 'material' && selectedMaterialIds.length === 0 && selectedLectureIds.length === 0 && selectedLectureAnnotationIds.length === 0)}
            className={`inline-flex shrink-0 items-center justify-center rounded-xl px-5 py-2.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neuron-500 focus-visible:ring-offset-2 ${
              starting || (studyMode === 'fill_gaps' && selectedGapItems.length === 0) || (studyMode === 'material' && selectedMaterialIds.length === 0 && selectedLectureIds.length === 0 && selectedLectureAnnotationIds.length === 0)
                ? 'bg-violet-400 text-white cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            {starting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting...
              </span>
            ) : (
              'Start session'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
