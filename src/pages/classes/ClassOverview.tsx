import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import CurriculumView from '../../components/classes/CurriculumView'
import SessionConfigModal from '../../components/tutor/SessionConfigModal'
import CurriculumProgressBar from '../../components/classes/CurriculumProgressBar'
import type { SyllabusModule, ModuleTopic, Subject, Material } from '../../types'

type PageState = 'loading' | 'ready' | 'error'

export default function ClassOverview(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const subjectId = Number(id)
  const navigate = useNavigate()
  const { user, subjects, addToast } = useAppStore()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [subject, setSubject] = useState<Subject | null>(null)
  const [modules, setModules] = useState<(SyllabusModule & { topics?: ModuleTopic[] })[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loadingCards, setLoadingCards] = useState<Record<number, boolean>>({})
  const [, setStudyLog] = useState<Record<number, boolean>>({})
  const [showConfigModal, setShowConfigModal] = useState<{ subjectId: number; subjectName: string } | null>(null)

  useEffect(() => {
    if (subjectId && user) {
      loadClassData()
    }
  }, [subjectId, user])

  async function loadClassData(): Promise<void> {
    setPageState('loading')
    try {
      // Get subject from store or fetch directly
      const found = subjects.find(s => s.id === subjectId)
      if (!found) throw new Error('Class not found')
      setSubject(found)

      // Load modules with topics
      const mods = await window.electronAPI.syllabusListModules(subjectId) as (SyllabusModule & { topic_count?: number })[]
      const modsWithTopics: (SyllabusModule & { topics?: ModuleTopic[] })[] = []
      for (const mod of mods) {
        const topics = await window.electronAPI.syllabusListTopics(mod.id) as ModuleTopic[]
        modsWithTopics.push({ ...mod, topics })
      }
      setModules(modsWithTopics)

      // Load materials
      const mats = await window.electronAPI.getMaterials(subjectId) as Material[]
      setMaterials(mats)

      // Load study log for topics
      try {
        const log: Record<number, boolean> = {}
        for (const mod of modsWithTopics) {
          if (mod.topics) {
            for (const topic of mod.topics) {
              // We'll use concept_mastery as a proxy for whether a topic has been studied
              const mastery = await window.electronAPI.getConceptMastery(user!.id, subjectId)
              // For now, just check if topic title appears in concept mastery
              const hasMastery = Array.isArray(mastery) && mastery.some(
                (m: { concept: string }) => m.concept === topic.title
              )
              if (hasMastery) log[topic.id] = true
            }
          }
        }
        setStudyLog(log)
      } catch { /* ignore */ }

      setPageState('ready')
    } catch (err) {
      console.error('Error loading class data:', err)
      setPageState('error')
    }
  }

  // ── Actions ──

  function handleStartTutor(_moduleId: number): void {
    if (subject) setShowConfigModal({ subjectId, subjectName: subject.name })
  }

  async function handleGenerateCards(moduleId: number): Promise<void> {
    setLoadingCards(prev => ({ ...prev, [moduleId]: true }))
    try {
      const result = await window.electronAPI.cardsGenerateFromModule(subjectId, moduleId)
      if (result.success) {
        addToast({ type: 'success', title: 'Cards Generated', message: `${result.count} cards created from ${result.module_name || 'module'}.` })
      } else {
        addToast({ type: 'error', title: 'Generation Failed', message: result.error || 'Unknown error' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addToast({ type: 'error', title: 'Generation Failed', message: msg })
    } finally {
      setLoadingCards(prev => ({ ...prev, [moduleId]: false }))
    }
  }

  async function handleToggleTopic(topicId: number, studied: boolean): Promise<void> {
    setStudyLog(prev => ({ ...prev, [topicId]: studied }))
    // In a future iteration, save study log to DB via module_topic_study_log
  }

  // ── Render ──

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading class...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'error' || !subject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-slate-400 mb-2">Class not found</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-emerald-600 hover:underline"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const activeMaterials = materials.filter(m =>
    m.content_text && m.content_text.length > 0
  )
  const completedModules = modules.filter(m => m.status === 'completed').length

  return (
    <div className="p-8 max-w-4xl mx-auto page-enter">
      {/* Class Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
                {subject.name}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                {subject.subject_type === 'book' ? '📖 Book' : '🏫 Class'}
              </span>
              {subject.syllabus_generated ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                  Syllabus Ready
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300">
                  No Syllabus
                </span>
              )}
            </div>
            {subject.course_code && (
              <p className="text-sm text-slate-400">{subject.course_code}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => subject && setShowConfigModal({ subjectId, subjectName: subject.name })}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              🎓 Start Learning
            </button>
            <button
              onClick={() => navigate(`/study/${subjectId}`)}
              className="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium rounded-lg transition-colors"
            >
              🃏 Study Cards
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <CurriculumProgressBar completed={completedModules} total={modules.length} />
        </div>
      </div>

      {/* Curriculum Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Curriculum
          </h2>
          {modules.length > 0 && (
            <span className="text-xs text-slate-400">
              {completedModules}/{modules.length} modules completed
            </span>
          )}
        </div>

        <CurriculumView
          modules={modules}
          onStartTutor={handleStartTutor}
          onGenerateCards={handleGenerateCards}
          onToggleTopic={handleToggleTopic}
          loadingCards={loadingCards}
        />



        {subject.syllabus_generated === 1 && (
          <div className="mt-4 text-center">
            <button
              onClick={async () => {
                const ok = confirm(
                  'Regenerate the entire syllabus from ALL materials?\n\n' +
                  'This rebuilds every module from scratch. Existing completion progress on ' +
                  'modules with matching titles will be preserved, but topics may be reordered ' +
                  'or renamed by the AI.\n\nContinue?'
                )
                if (!ok) return
                try {
                  const result = await window.electronAPI.syllabusGenerateFromMaterials(subjectId)
                  if (result?.length) {
                    addToast({ type: 'success', title: 'Syllabus Regenerated', message: `${result.length} modules generated.` })
                    loadClassData()
                  }
                } catch {
                  addToast({ type: 'error', title: 'Generation Failed', message: 'Ensure materials are uploaded first.' })
                }
              }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg transition-colors"
            >
              Regenerate syllabus from materials
            </button>
          </div>
        )}
      </div>

      {/* Materials Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Materials
          </h2>
          <span className="text-xs text-slate-400">{activeMaterials.length} files</span>
        </div>

        {activeMaterials.length > 0 ? (
          <div className="space-y-1.5">
            {activeMaterials.map(mat => (
              <div
                key={mat.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
              >
                <span className="text-sm">📄</span>
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">
                  {mat.filename}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 uppercase">
                  {mat.file_type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-400">No materials uploaded yet</p>
          </div>
        )}
      </div>

      {/* Session Config Modal */}
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
