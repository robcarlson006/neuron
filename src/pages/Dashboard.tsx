import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import SubjectCard from '../components/SubjectCard'
import type { SubjectWithStats, Deadline, CardSchedule } from '../types'

const FLASHCARD_SECONDS = 20
const ACTIVE_RECALL_SECONDS = 60

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export default function Dashboard(): React.JSX.Element {
  const { user, subjects, setSubjects, addSubject, removeSubject } = useAppStore()
  const navigate = useNavigate()
  const [subjectStats, setSubjectStats] = useState<SubjectWithStats[]>([])
  const [totalDueToday, setTotalDueToday] = useState(0)
  const [flashcardsDue, setFlashcardsDue] = useState(0)
  const [recallDue, setRecallDue] = useState(0)
  const [estimatedMinutes, setEstimatedMinutes] = useState(0)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddSubject, setShowAddSubject] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectCode, setNewSubjectCode] = useState('')
  const [newSubjectStatus, setNewSubjectStatus] = useState<'active' | 'ongoing'>('active')
  const [addingSubject, setAddingSubject] = useState(false)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user, subjects.length])

  async function loadDashboard(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const allDue = await window.electronAPI.getDueCards(user.id)
      setTotalDueToday(allDue.length)

      const fc = allDue.filter((c: { type: string }) => c.type === 'flashcard').length
      const rc = allDue.filter((c: { type: string }) => c.type === 'active_recall').length
      setFlashcardsDue(fc)
      setRecallDue(rc)

      const totalSeconds = fc * FLASHCARD_SECONDS + rc * ACTIVE_RECALL_SECONDS
      setEstimatedMinutes(Math.ceil(totalSeconds / 60))

      const streakData = await window.electronAPI.getStreakData(user.id)
      let currentStreak = 0
      const today = new Date().toISOString().split('T')[0]
      let checkDate = today
      for (const d of streakData) {
        if (d.date === checkDate) {
          currentStreak++
          const prev = new Date(checkDate)
          prev.setDate(prev.getDate() - 1)
          checkDate = prev.toISOString().split('T')[0]
        } else {
          break
        }
      }
      setStreak(currentStreak)

      const deadlines = await window.electronAPI.getDeadlines()
      const stats: SubjectWithStats[] = await Promise.all(
        subjects.map(async (subject) => {
          const cards = await window.electronAPI.getCards(subject.id)
          const schedules = await window.electronAPI.getAllSchedules(user.id, subject.id) as CardSchedule[]
          const dueCards = allDue.filter((c: { subject_id: number }) => c.subject_id === subject.id)

          const masteredCount = schedules.filter(s => s.interval >= 21).length
          const masteryPercent = schedules.length > 0 ? (masteredCount / schedules.length) * 100 : 0

          const subjectDeadlines = (deadlines as Deadline[]).filter(d => d.subject_id === subject.id)
          const nextDeadline = subjectDeadlines.sort(
            (a, b) => new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime()
          )[0]

          return {
            subject,
            masteryPercent,
            cardsDue: dueCards.length,
            nextDeadline,
            totalCards: cards.length
          }
        })
      )
      setSubjectStats(stats)
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteSubject(subjectId: number): Promise<void> {
    try {
      await window.electronAPI.deleteSubject(subjectId)
      removeSubject(subjectId)
    } catch (err) {
      console.error('Delete subject error:', err)
    }
  }

  async function handleAddSubject(): Promise<void> {
    if (!user || !newSubjectName.trim()) return
    setAddingSubject(true)
    try {
      const subject = await window.electronAPI.saveSubject({
        user_id: user.id,
        name: newSubjectName.trim(),
        course_code: newSubjectCode.trim() || undefined,
        status: newSubjectStatus
      })
      addSubject(subject)
      setNewSubjectName('')
      setNewSubjectCode('')
      setShowAddSubject(false)
    } catch (err) {
      console.error('Add subject error:', err)
    } finally {
      setAddingSubject(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const activeSubjectStats = subjectStats.filter(s => s.subject.status !== 'archived')
  const ongoingSubjectStats = subjectStats.filter(s => s.subject.status === 'ongoing')
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-8 max-w-6xl page-enter">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Good {getTimeOfDay()}, {firstName} 👋
            </h1>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-100 dark:border-amber-800">
                🔥 {streak} day streak
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowAddSubject(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <span className="text-base leading-none">+</span>
          Add Subject
        </button>
      </div>

      {/* Today's Plan Banner */}
      <div className="mb-8">
        {totalDueToday > 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-4xl font-bold text-slate-900 dark:text-slate-50">{totalDueToday}</span>
                  <span className="text-lg text-slate-500 dark:text-slate-400">cards due today</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {flashcardsDue > 0 && (
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                      {flashcardsDue} flashcards
                    </span>
                  )}
                  {recallDue > 0 && (
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      {recallDue} active recall
                    </span>
                  )}
                  {estimatedMinutes > 0 && (
                    <span className="text-slate-400 dark:text-slate-500">
                      ~{estimatedMinutes} min
                    </span>
                  )}
                </div>
              </div>
              <StudyMenu baseRoute="/study" />
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 p-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="text-2xl mb-1">🎉</div>
                <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                  You're all caught up!
                </h3>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  No cards are due today. Great work staying on top of your studies!
                </p>
              </div>
              <StudyMenu baseRoute="/study" />
            </div>
          </div>
        )}
      </div>

      {/* Long-term Retention section */}
      {ongoingSubjectStats.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Long-term Retention</h2>
            <span className="badge-blue">{ongoingSubjectStats.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ongoingSubjectStats.map(stats => (
              <SubjectCard key={stats.subject.id} data={stats} onDelete={handleDeleteSubject} />
            ))}
          </div>
        </div>
      )}

      {/* All Subjects */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Your Subjects</h2>
          {activeSubjectStats.length > 0 && (
            <span className="badge-slate">{activeSubjectStats.length}</span>
          )}
        </div>

        {activeSubjectStats.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4C4 3.44772 4.44772 3 5 3H11C11.5523 3 12 3.44772 12 4V20C12 20.5523 11.5523 21 11 21H5C4.44772 21 4 20.5523 4 20V4Z" fill="currentColor" className="text-slate-300 dark:text-slate-600" />
                <path d="M12 7C12 6.44772 12.4477 6 13 6H19C19.5523 6 20 6.44772 20 7V19C20 19.5523 19.5523 20 19 20H13C12.4477 20 12 19.5523 12 19V7Z" fill="currentColor" className="text-slate-400 dark:text-slate-500" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">No subjects yet</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-5">
              Add a subject and upload study materials to get started
            </p>
            <button
              onClick={() => setShowAddSubject(true)}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Add Your First Subject
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSubjectStats.map(stats => (
              <SubjectCard key={stats.subject.id} data={stats} onDelete={handleDeleteSubject} />
            ))}
          </div>
        )}
      </div>

      {/* Add Subject Modal */}
      {showAddSubject && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">Add New Subject</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Create a subject to organize your study cards.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Subject Name *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. World History"
                  value={newSubjectName}
                  onChange={e => setNewSubjectName(e.target.value)}
                  autoFocus
                  data-testid="subject-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Course Code (optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. HIS-101"
                  value={newSubjectCode}
                  onChange={e => setNewSubjectCode(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Status
                </label>
                <select
                  className="input"
                  value={newSubjectStatus}
                  onChange={e => setNewSubjectStatus(e.target.value as 'active' | 'ongoing')}
                >
                  <option value="active">Active — currently studying</option>
                  <option value="ongoing">Ongoing — long-term retention</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddSubject(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubject}
                disabled={!newSubjectName.trim() || addingSubject}
                className="btn-primary flex-1"
                data-testid="save-subject"
              >
                {addingSubject ? 'Adding...' : 'Add Subject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StudyMenu({ baseRoute }: { baseRoute: string }): React.JSX.Element {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const options = [
    { label: 'Flashcards', desc: 'Review your flashcard decks', route: `${baseRoute}?type=flashcard`, dot: 'bg-violet-500' },
    { label: 'Active Recall', desc: 'Open-ended recall questions', route: `${baseRoute}?type=active_recall`, dot: 'bg-indigo-500' },
    { label: 'Multiple Choice', desc: 'Practice with answer options', route: `${baseRoute}?mode=mc`, dot: 'bg-blue-500' },
  ]

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
      >
        Study Now
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-50">
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={() => { setOpen(false); navigate(opt.route) }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3"
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${opt.dot}`} />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{opt.label}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
