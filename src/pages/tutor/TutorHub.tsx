import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import SessionConfigModal from '../../components/tutor/SessionConfigModal'
import type { DailyPlan, SyllabusModule } from '../../types'

type HubState = 'loading' | 'loaded' | 'error'

export default function TutorHub(): React.JSX.Element {
  const { user, subjects } = useAppStore()
  const navigate = useNavigate()

  const [state, setState] = useState<HubState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [dailyPlans, setDailyPlans] = useState<(DailyPlan & { subject_name: string })[]>([])
  const [planDate, setPlanDate] = useState('')
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [subjectModules, setSubjectModules] = useState<Record<number, SyllabusModule[]>>({})
  const [showConfigModal, setShowConfigModal] = useState<{ subjectId: number; subjectName: string } | null>(null)

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

  async function handleGeneratePlan(): Promise<void> {
    if (!user) return
    setGeneratingPlan(true)
    try {
      const plans = await window.electronAPI.planGeneratePlan(user.id, planDate) as (DailyPlan & { subject_name: string })[]
      setDailyPlans(plans)
    } catch (err) {
      console.error('Failed to generate plan:', err)
      setError('Could not generate plan. Make sure your API key is configured.')
    } finally {
      setGeneratingPlan(false)
    }
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
      <div className="p-8 max-w-5xl page-enter">
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
      <div className="p-8 max-w-5xl page-enter">
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
      <div className="p-8 max-w-5xl page-enter">
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
  const completedPlans = dailyPlans.filter(p => p.is_completed)

  return (
    <div className="p-8 max-w-5xl page-enter">
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

      {/* Today's Plan Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Today's Plan</h2>
            {dailyPlans.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {incompletePlans.length} remaining
              </span>
            )}
          </div>
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            {generatingPlan ? (
              <>
                <span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7h12M7 1v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {dailyPlans.length === 0 ? 'Generate Plan' : 'Regenerate'}
              </>
            )}
          </button>
        </div>

        {dailyPlans.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="text-3xl mb-3">📋</div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No plan for today yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Click "Generate Plan" to create a study schedule based on your syllabus progress and deadlines.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {incompletePlans.map(plan => (
              <div key={plan.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                {/* Priority indicator */}
                <div className={`w-1.5 h-full min-h-[3rem] rounded-full flex-shrink-0 mt-0.5 ${
                  plan.priority === 1 ? 'bg-violet-500' :
                  plan.priority === 2 ? 'bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {plan.subject_name}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      · {plan.estimated_minutes} min
                    </span>
                    {plan.priority === 1 && (
                      <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full">Priority</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {plan.suggested_action}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleCompletePlan(plan.id)}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
                    >
                      ✓ Mark Complete
                    </button>
                    <button
                      onClick={() => handleDismissPlan(plan.id)}
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => setShowConfigModal({ subjectId: plan.subject_id, subjectName: plan.subject_name })}
                      className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium transition-colors ml-auto"
                    >
                      Start Session →
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {completedPlans.length > 0 && (
              <details className="group">
                <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors py-1">
                  {completedPlans.length} completed
                </summary>
                <div className="mt-2 space-y-2">
                  {completedPlans.map(plan => (
                    <div key={plan.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-start gap-3 opacity-60">
                      <div className="w-1.5 h-full min-h-[2rem] rounded-full flex-shrink-0 mt-0.5 bg-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-500 dark:text-slate-400 line-through">
                            {plan.subject_name}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">· {plan.estimated_minutes} min</span>
                        </div>
                        <p className="text-sm text-slate-400 dark:text-slate-500 line-through">{plan.suggested_action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
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
          onClose={() => setShowConfigModal(null)}
        />
      )}
    </div>
  )
}
