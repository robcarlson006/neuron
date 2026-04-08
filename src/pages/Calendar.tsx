import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import CalendarView from '../components/CalendarView'
import type { Deadline, DeadlineType } from '../types'

interface DayInfo {
  date: string
  cardsDue: number
  deadlines: Deadline[]
}

const DEADLINE_TYPES: { value: DeadlineType; label: string; affects: boolean; description: string }[] = [
  { value: 'exam',         label: 'Exam',              affects: true,  description: 'Major / final exam' },
  { value: 'test',         label: 'Test',              affects: true,  description: 'In-class test' },
  { value: 'quiz',         label: 'Quiz',              affects: true,  description: 'Short quiz' },
  { value: 'assignment',   label: 'Assignment',        affects: true,  description: 'Homework or project due' },
  { value: 'presentation', label: 'Presentation',      affects: true,  description: 'Oral or visual presentation' },
  { value: 'personal',     label: 'Personal reminder', affects: false, description: 'Doesn\'t affect study plan' },
]

const DEADLINE_TYPE_ICONS: Record<DeadlineType, string> = {
  exam: '📝',
  test: '✏️',
  quiz: '❓',
  assignment: '📋',
  presentation: '🎤',
  personal: '🗓️',
}

export default function Calendar(): React.JSX.Element {
  const { user, subjects } = useAppStore()
  const [daysInfo, setDaysInfo] = useState<DayInfo[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedInfo, setSelectedInfo] = useState<DayInfo | null>(null)
  const [allDeadlines, setAllDeadlines] = useState<Deadline[]>([])
  const [showAddDeadline, setShowAddDeadline] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSubjectId, setNewSubjectId] = useState<number>(subjects[0]?.id || 0)
  const [newDeadlineType, setNewDeadlineType] = useState<DeadlineType>('exam')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadCalendarData()
  }, [user])

  async function loadCalendarData(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const deadlines = await window.electronAPI.getDeadlines() as Deadline[]
      setAllDeadlines(deadlines)

      const schedules = await window.electronAPI.getAllSchedules(user.id)
      const deadlineMap = new Map<string, Deadline[]>()
      deadlines.forEach(d => {
        const key = d.deadline_date
        if (!deadlineMap.has(key)) deadlineMap.set(key, [])
        deadlineMap.get(key)!.push(d)
      })

      const dueDateMap = new Map<string, number>()
      schedules.forEach(s => {
        const key = s.due_date
        dueDateMap.set(key, (dueDateMap.get(key) || 0) + 1)
      })

      const days: DayInfo[] = []
      const start = new Date()
      start.setDate(start.getDate() - 30)
      for (let i = 0; i < 120; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        if (dueDateMap.has(dateStr) || deadlineMap.has(dateStr)) {
          days.push({
            date: dateStr,
            cardsDue: dueDateMap.get(dateStr) || 0,
            deadlines: deadlineMap.get(dateStr) || []
          })
        }
      }
      setDaysInfo(days)
    } catch (err) {
      console.error('Calendar load error:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleDayClick(date: string): void {
    setSelectedDate(date)
    const info = daysInfo.find(d => d.date === date)
    setSelectedInfo(info || { date, cardsDue: 0, deadlines: [] })
    setShowAddDeadline(false)
  }

  async function handleAddDeadline(): Promise<void> {
    if (!selectedDate || !newLabel.trim() || !newSubjectId) return
    const d = await window.electronAPI.saveDeadline({
      subject_id: newSubjectId,
      label: newLabel.trim(),
      deadline_date: selectedDate,
      deadline_type: newDeadlineType
    })
    setAllDeadlines(prev => [...prev, d as Deadline])
    setDaysInfo(prev => {
      const existing = prev.find(dd => dd.date === selectedDate)
      if (existing) {
        return prev.map(dd =>
          dd.date === selectedDate
            ? { ...dd, deadlines: [...dd.deadlines, d as Deadline] }
            : dd
        )
      }
      return [...prev, { date: selectedDate, cardsDue: 0, deadlines: [d as Deadline] }]
    })
    setSelectedInfo(prev =>
      prev ? { ...prev, deadlines: [...prev.deadlines, d as Deadline] } : null
    )
    setNewLabel('')
    setNewDeadlineType('exam')
    setShowAddDeadline(false)
    loadCalendarData()
  }

  async function handleDeleteDeadline(id: number): Promise<void> {
    await window.electronAPI.deleteDeadline(id)
    setAllDeadlines(prev => prev.filter(d => d.id !== id))
    setSelectedInfo(prev =>
      prev ? { ...prev, deadlines: prev.deadlines.filter(d => d.id !== id) } : null
    )
    loadCalendarData()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Calendar</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          View scheduled reviews and upcoming deadlines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CalendarView
            daysInfo={daysInfo}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />
        </div>

        {/* Day detail panel */}
        <div className="space-y-4">
          {selectedDate && selectedInfo ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric'
                })}
              </h3>

              <div className="space-y-2.5 mt-4">
                {selectedInfo.cardsDue > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">
                      {selectedInfo.cardsDue} cards due
                    </span>
                  </div>
                )}

                {selectedInfo.deadlines.map(d => {
                  const typeInfo = DEADLINE_TYPES.find(t => t.value === d.deadline_type)
                  return (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base flex-shrink-0">{DEADLINE_TYPE_ICONS[d.deadline_type] || '🗓️'}</span>
                        <div className="min-w-0">
                          <span className="text-slate-700 dark:text-slate-300 block truncate">{d.label}</span>
                          {typeInfo && (
                            <span className={`text-xs ${typeInfo.affects ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                              {typeInfo.affects ? `${typeInfo.label} · affects study plan` : 'Personal reminder'}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDeadline(d.id)}
                        className="text-slate-300 hover:text-red-400 text-xs flex-shrink-0 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                {selectedInfo.cardsDue === 0 && selectedInfo.deadlines.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Nothing scheduled</p>
                )}
              </div>

              <button
                onClick={() => setShowAddDeadline(v => !v)}
                className="w-full mt-4 text-sm text-violet-600 dark:text-violet-400 hover:underline"
              >
                {showAddDeadline ? '− Cancel' : '+ Add deadline for this day'}
              </button>

              {showAddDeadline && (
                <div className="mt-3 space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                      Deadline type
                    </label>
                    <select
                      className="input text-sm"
                      value={newDeadlineType}
                      onChange={e => setNewDeadlineType(e.target.value as DeadlineType)}
                    >
                      {DEADLINE_TYPES.map(t => (
                        <option key={t.value} value={t.value}>
                          {DEADLINE_TYPE_ICONS[t.value]} {t.label} — {t.description}
                        </option>
                      ))}
                    </select>
                    {newDeadlineType !== 'personal' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Reviews will be spaced more tightly as this deadline approaches.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder={newDeadlineType === 'personal' ? 'e.g. Study group meeting' : 'e.g. Midterm Exam'}
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                      Subject
                    </label>
                    <select
                      className="input text-sm"
                      value={newSubjectId}
                      onChange={e => setNewSubjectId(Number(e.target.value))}
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setShowAddDeadline(false)} className="btn-secondary flex-1 text-sm py-1.5">Cancel</button>
                    <button onClick={handleAddDeadline} disabled={!newLabel.trim()} className="btn-primary flex-1 text-sm py-1.5">Add</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 text-center py-8">
              <p className="text-slate-400 dark:text-slate-500 text-sm">
                Click a day to see details or add a deadline
              </p>
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 text-sm">
              Upcoming Deadlines
            </h3>
            {allDeadlines.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No deadlines set</p>
            ) : (
              <div className="space-y-2.5">
                {allDeadlines
                  .filter(d => d.deadline_date >= new Date().toISOString().split('T')[0])
                  .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))
                  .slice(0, 6)
                  .map(d => {
                    const days = Math.ceil(
                      (new Date(d.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                    const subj = subjects.find(s => s.id === d.subject_id)
                    const typeInfo = DEADLINE_TYPES.find(t => t.value === d.deadline_type)
                    return (
                      <div key={d.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-sm flex-shrink-0 mt-0.5">{DEADLINE_TYPE_ICONS[d.deadline_type] || '🗓️'}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{d.label}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {subj?.name}
                              {typeInfo && ` · ${typeInfo.label}`}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-medium whitespace-nowrap flex-shrink-0 ${
                          days <= 3 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-slate-400'
                        }`}>
                          {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
