import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import SessionConfigModal from '../../components/tutor/SessionConfigModal'
import PostLecturePromptModal from '../../components/tutor/PostLecturePromptModal'
import { navigateToFocusBlockItem } from '../../lib/focusBlockNav'
import type { DailyPlan, SyllabusModule, CalendarScheduleContext } from '../../types'

type HubState = 'loading' | 'loaded' | 'error'

export default function TutorHub(): React.JSX.Element {
  const { user, subjects, focusBlock, startFocusBlock } = useAppStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [state, setState] = useState<HubState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [dailyPlans, setDailyPlans] = useState<(DailyPlan & { subject_name: string })[]>([])
  const [planDate, setPlanDate] = useState('')
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30)
  const [customMinutes, setCustomMinutes] = useState<string>('')
  const [isCustom, setIsCustom] = useState<boolean>(false)
  const [subjectModules, setSubjectModules] = useState<Record<number, SyllabusModule[]>>({})
  const [showConfigModal, setShowConfigModal] = useState<{ subjectId: number; subjectName: string; initialTopic?: string } | null>(null)

  const [scheduleContext, setScheduleContext] = useState<CalendarScheduleContext | null>(null)
  const [dismissContextBanner, setDismissContextBanner] = useState<boolean>(false)
  const [showPostLectureModal, setShowPostLectureModal] = useState<boolean>(false)
  const [subjectMaterials, setSubjectMaterials] = useState<{ id: number; filename: string }[]>([])

  const activeSubjects = subjects.filter(s => s.status !== 'archived')

  useEffect(() => {
    if (user) {
      loadHub()
    }
  }, [user, subjects.length])

  async function loadHub(): Promise<void> {
    if (!user) return
    setState('loading')
    setError(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      setPlanDate(today)

      // Load daily plans
      const plans = await window.electronAPI.planGetDailyPlan(user.id, today) as (DailyPlan & { subject_name: string })[]
      setDailyPlans(plans)

      // Detect Calendar Schedule Context (Pre/Post event triggers)
      try {
        const ctx = await window.electronAPI.calendar.detectCurrentContext(user.id)
        setScheduleContext(ctx)
        if (ctx?.event.subject_id) {
          const mats = (await window.electronAPI.getMaterials(ctx.event.subject_id)) as { id: number; filename: string }[]
          setSubjectMaterials(mats || [])
        }
      } catch (ctxErr) {
        console.warn('Failed to detect calendar context:', ctxErr)
      }

      // Check if URL specifies duration query
      const urlMinutes = searchParams.get('minutes')
      if (urlMinutes) {
        const parsed = parseInt(urlMinutes, 10)
        if (parsed > 0) setSelectedMinutes(parsed)
      }

      // Load syllabus modules for each subject
      const modMap: Record<number, SyllabusModule[]> = {}
      for (const subject of activeSubjects) {
        try {
          const modules = await window.electronAPI.syllabusListModules(subject.id) as SyllabusModule[]
          modMap[subject.id] = modules
        } catch {
          modMap[subject.id] = []
        }
      }
      setSubjectModules(modMap)

      setState('loaded')
    } catch (err) {
      console.error('Failed to load tutor hub:', err)
      setError('Something went wrong loading your tutor dashboard.')
      setState('error')
    }
  }

  async function handleGeneratePlan(
    minutesOverride?: number,
    contextOptions?: {
      contextType?: 'pre_event' | 'post_event' | 'standard'
      eventTitle?: string
      subjectName?: string
      subjectId?: number
      lectureTopic?: string
      materialsSummary?: string
    }
  ): Promise<void> {
    if (!user) return
    const targetMinutes = minutesOverride || (isCustom ? (parseInt(customMinutes, 10) || 30) : selectedMinutes)
    setGeneratingPlan(true)
    setError(null)
    try {
      const plans = await window.electronAPI.planGenerateFocusBlock(
        user.id,
        targetMinutes,
        planDate,
        contextOptions
      ) as (DailyPlan & { subject_name: string })[]
      setDailyPlans(plans)
    } catch (err) {
      console.error('Failed to generate focus block:', err)
      setError('Could not generate focus block. Please check your settings or try again.')
    } finally {
      setGeneratingPlan(false)
    }
  }

  async function handleStartSprint(stepIndex = 0): Promise<void> {
    if (dailyPlans.length === 0) return
    const target = dailyPlans[stepIndex]
    if (!target) return

    startFocusBlock(dailyPlans, stepIndex)
    await navigateToFocusBlockItem(target, navigate, user?.id)
  }

  async function handleCompletePlan(planId: number): Promise<void> {
    await window.electronAPI.planCompleteAction(planId)
    setDailyPlans(prev => prev.map(p => p.id === planId ? { ...p, is_completed: 1 } : p))
  }

  async function handleDismissPlan(planId: number): Promise<void> {
    await window.electronAPI.planDismissAction(planId)
    setDailyPlans(prev => prev.filter(p => p.id !== planId))
  }

  // ── Loading State ──
  if (state === 'loading') {
    return (
      <div className="p-8 w-full page-enter">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <span className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading your tutor dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Error State ──
  if (state === 'error') {
    return (
      <div className="p-8 w-full page-enter">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md text-center">{error}</p>
          <button onClick={loadHub} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Try Again</button>
        </div>
      </div>
    )
  }

  // ── Empty State (no subjects) ──
  if (activeSubjects.length === 0) {
    return (
      <div className="p-8 w-full page-enter">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">AI Tutor</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your personal AI teaching assistant</p>
          </div>
          <button onClick={() => navigate('/tutor/general')} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 2.5V11H3a2 2 0 01-2-2V3a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            General Chat
          </button>
        </div>
        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="text-5xl mb-5">🧠</div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">No classes yet</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Add a class and upload your study materials to get started. Neuron will create a syllabus and teach you.
          </p>
          <button onClick={() => navigate('/')} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
            Add Your First Class
          </button>
        </div>
      </div>
    )
  }

  // ── Main hub view ──
  const incompletePlans = dailyPlans.filter(p => !p.is_completed)

  return (
    <div className="p-8 w-full page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">AI Tutor</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {planDate ? new Date(planDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/tutor/general')}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 2.5V11H3a2 2 0 01-2-2V3a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            General Chat
          </button>
        </div>
      </div>

      {/* Smart Schedule Context Banner */}
      {scheduleContext && !dismissContextBanner && (
        <div className="mb-6">
          {scheduleContext.type === 'pre_event' ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/70 dark:border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🔔</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Pre-Class Primer
                    </span>
                    <span className="text-xs text-slate-400">· Starting in {scheduleContext.minutesUntilStart}m</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {scheduleContext.event.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Review key definitions and prerequisite flashcards for {scheduleContext.event.subject_name || 'this class'}.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => {
                    const mins = Math.min(20, scheduleContext.minutesUntilStart || 15)
                    handleGeneratePlan(mins, {
                      contextType: 'pre_event',
                      eventTitle: scheduleContext.event.title,
                      subjectName: scheduleContext.event.subject_name,
                      subjectId: scheduleContext.event.subject_id || undefined
                    })
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
                >
                  <span>⚡</span> Start Primer ({Math.min(20, scheduleContext.minutesUntilStart || 15)}m)
                </button>
                <button
                  onClick={() => setDismissContextBanner(true)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 text-xs"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent border border-violet-300/70 dark:border-violet-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🎓</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Post-Lecture Concept Lock-In
                    </span>
                    <span className="text-xs text-slate-400">· Wrapped up {scheduleContext.minutesSinceEnd}m ago</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {scheduleContext.event.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Lock in today's material while it's fresh: brief recall + targeted Socratic debrief.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => setShowPostLectureModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>🚀</span> Lock In Today's Material
                </button>
                <button
                  onClick={() => setDismissContextBanner(true)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 text-xs"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Focus Block Section */}
      <div className="mb-8 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-6 shadow-sm">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100 dark:border-slate-700/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Focus Block</h2>
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-700/40">
                Smart Sprint
              </span>
              {incompletePlans.length > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                  · {incompletePlans.reduce((acc, p) => acc + (p.estimated_minutes || 0), 0)} min total
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Moment-based study sprints tailored to your available time, due cards, and weak spots.
            </p>
          </div>

          {/* Time Selector Chips & Action */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 mr-1">Time:</span>
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                onClick={() => {
                  setSelectedMinutes(mins)
                  setIsCustom(false)
                  handleGeneratePlan(mins)
                }}
                disabled={generatingPlan}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  !isCustom && selectedMinutes === mins
                    ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/20'
                    : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'
                }`}
              >
                {mins === 15 ? '⚡ 15m' : mins === 30 ? '⏱️ 30m' : mins === 45 ? '📚 45m' : '🔥 60m'}
              </button>
            ))}

            {isCustom ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  placeholder="mins"
                  className="w-16 px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 text-center focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  onClick={() => {
                    const parsed = parseInt(customMinutes, 10)
                    if (parsed > 0) handleGeneratePlan(parsed)
                  }}
                  className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Go
                </button>
                <button
                  onClick={() => setIsCustom(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 p-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCustom(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Custom
              </button>
            )}

            <button
              onClick={() => handleGeneratePlan()}
              disabled={generatingPlan}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-600"
              title="Recalculate Focus Block based on current progress"
            >
              {generatingPlan ? (
                <>
                  <span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 7h12M7 1v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Recalculate
                </>
              )}
            </button>

            {incompletePlans.length > 0 ? (
              <button
                onClick={() => {
                  const firstIncomplete = dailyPlans.findIndex(p => !p.is_completed)
                  handleStartSprint(firstIncomplete !== -1 ? firstIncomplete : 0)
                }}
                className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm ml-1"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><path d="M4 2.5l7 4.5-7 4.5V2.5z"/></svg>
                Start Focus Block
              </button>
            ) : dailyPlans.length > 0 ? (
              <span className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 rounded-xl text-xs font-semibold flex items-center gap-1.5 ml-1">
                <span>✓</span> All Steps Completed
              </span>
            ) : null}
          </div>
        </div>

        {/* Active Focus Block in progress callout */}
        {focusBlock?.isRunning && (
          <div className="mb-4 bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-700/50 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-600 animate-ping" />
              <div>
                <p className="text-xs font-bold text-violet-900 dark:text-violet-200">
                  Focus Block in Progress: Step {focusBlock.activeIndex + 1} of {focusBlock.items.length}
                </p>
                <p className="text-[11px] text-violet-700 dark:text-violet-300">
                  {focusBlock.items[focusBlock.activeIndex]?.suggested_action}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleStartSprint(focusBlock.activeIndex)}
              className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-sm"
            >
              Resume Step →
            </button>
          </div>
        )}

        {/* Sprint Items List */}
        {dailyPlans.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
            <div className="text-3xl mb-2">⚡</div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Ready for a Focus Block?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-sm mx-auto">
              Select how much time you have right now (15m, 30m, 45m, 60m) to generate a targeted study sprint.
            </p>
            <button
              onClick={() => handleGeneratePlan(30)}
              disabled={generatingPlan}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-2"
            >
              <span>Generate 30m Sprint</span>
              <span>→</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {dailyPlans.map((plan, idx) => {
              const isCompleted = Boolean(plan.is_completed)

              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-4 transition-all relative group ${
                    isCompleted
                      ? 'bg-violet-50/90 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700/80 shadow-xs'
                      : 'bg-slate-50/70 dark:bg-slate-750/70 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  {/* Top-right "x" dismiss button for completed items */}
                  {isCompleted && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismissPlan(plan.id)
                      }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-violet-100/80 dark:hover:bg-violet-900/60 transition-all z-10"
                      title="Dismiss completed item"
                      aria-label="Dismiss completed item"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Step number badge */}
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                          isCompleted
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300'
                        }`}
                      >
                        {isCompleted ? '✓' : idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Tags & Badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`text-xs font-semibold ${isCompleted ? 'text-violet-950 dark:text-violet-100' : 'text-slate-800 dark:text-slate-200'}`}>
                            {plan.subject_name}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            · {plan.estimated_minutes} min
                          </span>

                          {isCompleted && (
                            <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/50 px-2 py-0.5 rounded-full border border-violet-300 dark:border-violet-700/60 flex items-center gap-1">
                              ✓ Completed
                            </span>
                          )}

                          {plan.action_type === 'flashcards' && (
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/40 flex items-center gap-1">
                              ⚡ Due Flashcards
                            </span>
                          )}
                          {plan.action_type === 'tutor_drill' && (
                            <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-700/40 flex items-center gap-1">
                              🎯 Weak Spot Drill
                            </span>
                          )}
                          {plan.action_type === 'syllabus_read' && (
                            <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-700/40 flex items-center gap-1">
                              📖 Syllabus Progress
                            </span>
                          )}
                          {plan.priority === 1 && !isCompleted && (
                            <span className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full">
                              High Yield
                            </span>
                          )}
                        </div>

                        {/* Main Title */}
                        <p className={`text-sm font-semibold ${isCompleted ? 'text-violet-950 dark:text-violet-100' : 'text-slate-900 dark:text-slate-100'}`}>
                          {plan.suggested_action}
                        </p>

                        {/* Learning Objective / Subtext */}
                        {plan.learning_objective && (
                          <p className={`text-xs mt-1 leading-relaxed ${isCompleted ? 'text-violet-700/80 dark:text-violet-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            🎯 <span className="italic">{plan.learning_objective}</span>
                          </p>
                        )}

                        {/* Action Links */}
                        <div className="flex items-center gap-3 mt-3">
                          {!isCompleted ? (
                            <button
                              onClick={() => handleCompletePlan(plan.id)}
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
                            >
                              ✓ Done
                            </button>
                          ) : (
                            <span className="text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1">
                              ✓ Finished
                            </span>
                          )}
                          <button
                            onClick={() => handleDismissPlan(plan.id)}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center gap-1"
                            title="Dismiss from focus block"
                          >
                            <span className="text-[10px] font-bold">✕</span> Dismiss
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Launch / Completed Button */}
                    <div className="flex-shrink-0 self-center">
                      {isCompleted ? (
                        <div className="flex items-center gap-2 mr-5">
                          <span className="px-3.5 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                            <span>✓</span> Completed
                          </span>
                          <button
                            onClick={() => handleStartSprint(idx)}
                            className="p-1 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium hover:underline"
                            title="Review this step"
                          >
                            Review
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartSprint(idx)}
                          className="px-3.5 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          {plan.action_type === 'flashcards' ? 'Start Flashcards' :
                           plan.action_type === 'tutor_drill' ? 'Launch Tutor Drill' :
                           plan.action_type === 'syllabus_read' ? 'Open Chapter' : 'Start Step'}
                          <span className="text-xs">→</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Classes Grid */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">Your Classes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeSubjects.map(subject => {
            const modules = subjectModules[subject.id] || []
            const completedModules = modules.filter(m => m.status === 'completed').length
            const totalModules = modules.length
            const progressPct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0

            return (
              <div
                key={subject.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-violet-300 dark:hover:border-violet-700 transition-all cursor-pointer group"
                onClick={() => navigate(`/subject/${subject.id}`)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                    {subject.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                      {subject.name}
                    </h3>
                    {subject.course_code && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{subject.course_code}</p>
                    )}
                  </div>
                </div>

                {totalModules > 0 ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 mb-1.5">
                      <span>{completedModules}/{totalModules} modules</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-violet-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      No syllabus yet
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); setShowConfigModal({ subjectId: subject.id, subjectName: subject.name }) }}
                    className="flex-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Start Tutor Session
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/study/${subject.id}`) }}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Study Cards
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showConfigModal && (
        <SessionConfigModal
          subjectId={showConfigModal.subjectId}
          subjectName={showConfigModal.subjectName}
          initialTopic={showConfigModal.initialTopic}
          initialMode={showConfigModal.initialTopic ? 'custom' : 'fill_gaps'}
          onClose={() => setShowConfigModal(null)}
        />
      )}

      {showPostLectureModal && scheduleContext && (
        <PostLecturePromptModal
          isOpen={showPostLectureModal}
          onClose={() => setShowPostLectureModal(false)}
          event={scheduleContext.event}
          minutesSinceEnd={scheduleContext.minutesSinceEnd}
          materials={subjectMaterials}
          onStartSprint={(options) => {
            handleGeneratePlan(options.minutes, {
              contextType: 'post_event',
              eventTitle: scheduleContext.event.title,
              subjectName: scheduleContext.event.subject_name,
              subjectId: scheduleContext.event.subject_id || undefined,
              lectureTopic: options.lectureTopic,
              materialsSummary: options.materialsSummary
            })
          }}
        />
      )}
    </div>
  )
}
