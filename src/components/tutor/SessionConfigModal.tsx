import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
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
  GapAnalysisResult,
  QuickReviewTopic
} from '../../types'

interface SessionConfigModalProps {
  subjectId: number
  subjectName: string
  materialId?: number
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
    propInitialMode || (propMaterialId ? 'material' : propInitialModuleId ? 'syllabus' : initialTopic ? 'custom' : 'new_content')
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
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(propMaterialId || null)
  const [customTopic, setCustomTopic] = useState(initialTopic || '')
  const [quickReviewTopics, setQuickReviewTopics] = useState<QuickReviewTopic[]>([])

  // ── Config State ──
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedDepth, setSelectedDepth] = useState<1 | 2 | 3 | 4 | 5 | 'adaptive'>('adaptive')
  const [neverStudied, setNeverStudied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sliderValue, setSliderValue] = useState<number>(30)
  const [inputValue, setInputValue] = useState('')

  const sliderRef = useRef<HTMLInputElement>(null)

  // Beginner mode forces minimum depth 3 if manual depth < 3 is selected
  const finalDepth: 1 | 2 | 3 | 4 | 5 | 'adaptive' =
    selectedDepth === 'adaptive'
      ? 'adaptive'
      : (neverStudied && selectedDepth < 3 ? 3 : selectedDepth)

  // All new topics across entire class
  const allNewTopicsList = modules.flatMap(mod =>
    (mod.topics || [])
      .filter(t => Boolean(t.has_new_material || t.is_gap) && !t.completed && !(t as any).studied)
      .map(t => ({ topic: t, module: mod }))
  )

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
        if (isMounted) {
          setMaterialsList(mats)
          if (propMaterialId) {
            setSelectedMaterialId(propMaterialId)
          } else if (mats.length > 0 && !selectedMaterialId) {
            setSelectedMaterialId(mats[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load syllabus/materials for config modal:', err)
      } finally {
        if (isMounted) setLoadingData(false)
      }
    }

    async function loadGaps(): Promise<void> {
      if (!user) return
      setLoadingGaps(true)
      try {
        const gaps = (await window.electronAPI.tutorGetGapAnalysis(subjectId, user.id)) as GapAnalysisResult
        if (isMounted) {
          setGapAnalysis(gaps)
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
      gapTopics = gapAnalysis?.recommendedTopics?.slice(0, 1) || []
      chosenTopic = gapTopics[0] || gapAnalysis?.recommendedFocus || 'Identified Knowledge Gap'
      chosenModuleId = gapAnalysis?.recommendedModuleId
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
      const activeMat = materialsList.find(m => m.id === selectedMaterialId)
      chosenMaterialId = activeMat?.id || propMaterialId
      chosenMaterialName = activeMat?.filename || propMaterialName
      chosenTopic = chosenMaterialName ? `Material: ${chosenMaterialName}` : subjectName
    } else if (studyMode === 'custom') {
      chosenTopic = customTopic.trim() || subjectName
    }

    const finalDuration = selectedTime !== null
      ? selectedTime
      : (studyMode === 'fill_gaps' && gapAnalysis?.recommendedEstimatedMinutes ? gapAnalysis.recommendedEstimatedMinutes : null)

    const config: TutorSessionConfig = {
      duration_minutes: finalDuration,
      depth_level: finalDepth,
      never_studied: neverStudied || studyMode === 'new_content',
      material_id: chosenMaterialId,
      material_name: chosenMaterialName,
      module_id: chosenModuleId,
      module_name: chosenModuleName,
      target_topic: chosenTopic,
      target_topics: chosenTopics.length > 0 ? chosenTopics : undefined,
      target_topic_ids: isQuickReview ? quickReviewTopics.map(t => t.id).filter(id => id > 0) : undefined,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col p-6 my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <span>🧠</span> AI Tutor Session
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Class: <span className="font-semibold text-slate-700 dark:text-slate-300">{subjectName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1">
          {/* ── Topic Selection Tabs / Mode ── */}
          <div>
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center justify-between">
              <span>📚 What topic would you like to study?</span>
              {gapAnalysis && gapAnalysis.totalGapsCount > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                  {gapAnalysis.totalGapsCount} gap{gapAnalysis.totalGapsCount === 1 ? '' : 's'} detected
                </span>
              )}
            </label>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setStudyMode('new_content')
                  if (selectedTopics.length === 0 && allNewTopicsList.length > 0) {
                    setSelectedTopics(allNewTopicsList.map(i => i.topic.title))
                  }
                }}
                className={`p-2.5 rounded-xl text-left border transition-all relative ${
                  studyMode === 'new_content'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 text-amber-600 dark:text-amber-400">
                  <span>✨</span> New Content
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  {allNewTopicsList.length > 0 ? `${allNewTopicsList.length} new topics` : 'Across class'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('quick_review')}
                className={`p-2.5 rounded-xl text-left border transition-all relative ${
                  studyMode === 'quick_review'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 text-amber-600 dark:text-amber-400">
                  <span>⚡</span> Quick Review
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  {quickReviewTopics.length > 0 ? `${quickReviewTopics.length} topics (1-3 Qs)` : 'All topics'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('fill_gaps')}
                className={`p-2.5 rounded-xl text-left border transition-all relative ${
                  studyMode === 'fill_gaps'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 text-violet-600 dark:text-violet-400">
                  <span>⚡</span> Fill Gaps
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Auto-target gaps
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('active_recall')}
                className={`p-2.5 rounded-xl text-left border transition-all relative ${
                  studyMode === 'active_recall'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 text-emerald-600 dark:text-emerald-400">
                  <span>🎯</span> Active Recall
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Continuous Q&A
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('syllabus')}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  studyMode === 'syllabus'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <span>📖</span> Syllabus
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Choose module
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('material')}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  studyMode === 'material'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <span>📄</span> Material
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Study file
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStudyMode('custom')}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  studyMode === 'custom'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <span>✏️</span> Custom
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Type topic
                </div>
              </button>
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
                  <div className="space-y-2.5 pt-1">
                    {gapAnalysis.struggledTopics.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
                          ⚠️ Struggled Topics to Reinforce
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {gapAnalysis.struggledTopics.map((item, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 font-medium"
                            >
                              {item.topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {gapAnalysis.uncoveredTopics.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                          🆕 Uncovered Topics to Introduce
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {gapAnalysis.uncoveredTopics.slice(0, 5).map((item, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-100/80 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/60 font-medium"
                            >
                              {item.topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-violet-200/60 dark:border-violet-800/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                          Target Knowledge Gap:
                        </span>
                        {gapAnalysis.recommendedEstimatedMinutes && (
                          <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 rounded-full">
                            ⏱️ Suggested ~{gapAnalysis.recommendedEstimatedMinutes} min
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        {gapAnalysis.recommendedFocus}
                      </p>
                    </div>
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
                        const isSelected = selectedMaterialId === mat.id
                        return (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => setSelectedMaterialId(mat.id)}
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

          {/* ── Difficulty Selector ── */}
          <div>
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 block">
              🎯 Difficulty Level
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

            {neverStudied && typeof selectedDepth === 'number' && selectedDepth < 3 && (
              <p className="text-xs text-amber-500 mt-1.5">
                Beginner mode requires at least Proficient difficulty. Using Level 3.
              </p>
            )}
          </div>

          {/* ── Time Selector ── */}
          <div>
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 block">
              ⏱️ Session Duration <span className="text-xs text-slate-400 font-normal">(optional)</span>
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
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={neverStudied}
                onChange={e => setNeverStudied(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
              />
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  🆕 I've never studied this topic before
                </span>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Start from absolute fundamentals without assuming prior knowledge.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* ── Summary & Start ── */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700 mt-2">
          <div className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[260px]">
            <span className="font-semibold text-violet-600 dark:text-violet-400">
              {studyMode === 'new_content'
                ? `✨ New Content (${selectedTopics.length > 0 ? selectedTopics.length + ' topic' + (selectedTopics.length > 1 ? 's' : '') : 'All'})`
                : studyMode === 'fill_gaps'
                ? '⚡ Fill Gaps'
                : studyMode === 'active_recall'
                ? '🎯 Active Recall'
                : studyMode === 'syllabus'
                ? `📖 ${selectedTopic || 'Syllabus'}`
                : studyMode === 'material'
                ? `📄 Material`
                : `✏️ ${customTopic || 'Custom'}`}
            </span>
            {selectedTime !== null ? <span> · {selectedTime}m</span> : <span> · Unlimited</span>}
            <span> · {DEPTH_LEVELS.find(d => d.level === finalDepth)?.name}</span>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              starting
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
              'Start Session →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
