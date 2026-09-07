import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import CalendarView from '../components/CalendarView'
import DayScheduleTimeline from '../components/calendar/DayScheduleTimeline'
import CalendarSyncModal from '../components/calendar/CalendarSyncModal'
import AddEventModal from '../components/calendar/AddEventModal'
import type { Deadline, DeadlineType, CalendarEvent, CalendarSource } from '../types'

interface DayInfo {
  date: string
  cardsDue: number
  deadlines: Deadline[]
  eventCount?: number
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
  const navigate = useNavigate()
  const { user, subjects } = useAppStore()
  const todayStr = new Date().toISOString().split('T')[0]

  const [daysInfo, setDaysInfo] = useState<DayInfo[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedInfo, setSelectedInfo] = useState<DayInfo | null>(null)
  const [allDeadlines, setAllDeadlines] = useState<Deadline[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])

  const [showSyncModal, setShowSyncModal] = useState(false)
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [showAddDeadline, setShowAddDeadline] = useState(false)

  const [newLabel, setNewLabel] = useState('')
  const [newSubjectId, setNewSubjectId] = useState<number>(subjects[0]?.id || 0)
  const [newDeadlineType, setNewDeadlineType] = useState<DeadlineType>('exam')
  const [loading, setLoading] = useState(true)
  const [rightTab, setRightTab] = useState<'timeline' | 'deadlines'>('timeline')

  useEffect(() => {
    if (user) loadCalendarData()
  }, [user])

  async function loadCalendarData(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      // 1. Fetch Deadlines
      const deadlines = (await window.electronAPI.getDeadlines()) as Deadline[]
      setAllDeadlines(deadlines)

      // 2. Fetch Card Due Schedules
      const schedules = await window.electronAPI.getAllSchedules(user.id)

      // 3. Fetch Calendar Events & Sources
      const fetchedEvents = await window.electronAPI.calendar.getEvents({ userId: user.id })
      setEvents(fetchedEvents)

      const fetchedSources = await window.electronAPI.calendar.getSources(user.id)
      setSources(fetchedSources)

      // Map deadlines
      const deadlineMap = new Map<string, Deadline[]>()
      deadlines.forEach(d => {
        const key = d.deadline_date
        if (!deadlineMap.has(key)) deadlineMap.set(key, [])
        deadlineMap.get(key)!.push(d)
      })

      // Map due cards
      const dueDateMap = new Map<string, number>()
      schedules.forEach(s => {
        const key = s.due_date
        dueDateMap.set(key, (dueDateMap.get(key) || 0) + 1)
      })

      // Map event counts
      const eventCountMap = new Map<string, number>()
      fetchedEvents.forEach(e => {
        const key = e.start_time.split('T')[0]
        eventCountMap.set(key, (eventCountMap.get(key) || 0) + 1)
      })

      // Generate 150 days window (-30 to +120)
      const days: DayInfo[] = []
      const start = new Date()
      start.setDate(start.getDate() - 30)

      for (let i = 0; i < 150; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        if (dueDateMap.has(dateStr) || deadlineMap.has(dateStr) || eventCountMap.has(dateStr)) {
          days.push({
            date: dateStr,
            cardsDue: dueDateMap.get(dateStr) || 0,
            deadlines: deadlineMap.get(dateStr) || [],
            eventCount: eventCountMap.get(dateStr) || 0
          })
        }
      }
      setDaysInfo(days)

      // Set current selected info
      const activeDate = selectedDate || todayStr
      const currentInfo = days.find(d => d.date === activeDate)
      setSelectedInfo(currentInfo || {
        date: activeDate,
        cardsDue: dueDateMap.get(activeDate) || 0,
        deadlines: deadlineMap.get(activeDate) || [],
        eventCount: eventCountMap.get(activeDate) || 0
      })
    } catch (err) {
      console.error('Calendar load error:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleDayClick(date: string): void {
    setSelectedDate(date)
    const info = daysInfo.find(d => d.date === date)
    setSelectedInfo(info || { date, cardsDue: 0, deadlines: [], eventCount: 0 })
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
    setNewLabel('')
    setNewDeadlineType('exam')
    setShowAddDeadline(false)
    loadCalendarData()
  }

  async function handleDeleteDeadline(id: number): Promise<void> {
    await window.electronAPI.deleteDeadline(id)
    setAllDeadlines(prev => prev.filter(d => d.id !== id))
    loadCalendarData()
  }

  async function handleDeleteEvent(eventId: number): Promise<void> {
    await window.electronAPI.calendar.deleteEvent(eventId)
    loadCalendarData()
  }

  function handleSlotFocusBlock(startTime: string, durationMinutes: number): void {
    // Navigate to Tutor Hub with pre-selected focus block minutes
    navigate(`/tutor?minutes=${durationMinutes}&start=${encodeURIComponent(startTime)}&date=${selectedDate}`)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Calendar & Schedule
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-sm">
            Keep track of classes, deadlines, and smart study windows.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowSyncModal(true)}
            className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
          >
            <span>🔄</span>
            {sources.length > 0 ? 'Sync Google Calendar' : 'Connect Google Calendar'}
          </button>
          <button
            onClick={() => setShowAddEventModal(true)}
            className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
          >
            <span>+</span> Add Event
          </button>
        </div>
      </div>

      {/* Main Grid: Month Calendar on Left, Detailed Timeline / Agenda on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Month Grid */}
        <div className="lg:col-span-7">
          <CalendarView
            daysInfo={daysInfo}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />

          {/* Upcoming deadlines card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-5 mt-6">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 text-sm flex items-center justify-between">
              <span>Upcoming Deadlines</span>
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                Next 30 days
              </span>
            </h3>
            {allDeadlines.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No upcoming deadlines set</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {allDeadlines
                  .filter(d => d.deadline_date >= todayStr)
                  .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))
                  .slice(0, 6)
                  .map(d => {
                    const days = Math.ceil(
                      (new Date(d.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                    const subj = subjects.find(s => s.id === d.subject_id)
                    const typeInfo = DEADLINE_TYPES.find(t => t.value === d.deadline_type)
                    return (
                      <div
                        key={d.id}
                        className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-start justify-between gap-2"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-base flex-shrink-0 mt-0.5">
                            {DEADLINE_TYPE_ICONS[d.deadline_type] || '🗓️'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {d.label}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              {subj?.name} {typeInfo ? `· ${typeInfo.label}` : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                            days <= 3
                              ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                              : days <= 7
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {days === 0 ? 'Today' : days === 1 ? 'Tmrw' : `${days}d`}
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Day Schedule Timeline & Day Details */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-5">
            {/* Day Header & Tab Switcher */}
            <div className="border-b border-slate-100 dark:border-slate-700/80 pb-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {selectedDate === todayStr ? 'Today' : 'Selected Date'}
                  </p>
                </div>

                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-xl text-xs font-medium">
                  <button
                    onClick={() => setRightTab('timeline')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      rightTab === 'timeline'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Schedule
                  </button>
                  <button
                    onClick={() => setRightTab('deadlines')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      rightTab === 'deadlines'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Tasks ({selectedInfo?.deadlines.length || 0})
                  </button>
                </div>
              </div>
            </div>

            {/* Tab: Schedule Timeline */}
            {rightTab === 'timeline' && (
              <DayScheduleTimeline
                events={events}
                selectedDate={selectedDate}
                onSlotClick={handleSlotFocusBlock}
                onDeleteEvent={handleDeleteEvent}
                onAddEventClick={() => setShowAddEventModal(true)}
              />
            )}

            {/* Tab: Tasks & Deadlines for this Day */}
            {rightTab === 'deadlines' && (
              <div className="space-y-4">
                {selectedInfo && selectedInfo.cardsDue > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="font-semibold text-amber-900 dark:text-amber-300">
                        {selectedInfo.cardsDue} Flashcards Due
                      </span>
                    </div>
                    <button
                      onClick={() => navigate('/study')}
                      className="btn-primary text-xs py-1 px-2.5"
                    >
                      Review
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Deadlines ({selectedInfo?.deadlines.length || 0})
                    </span>
                    <button
                      onClick={() => setShowAddDeadline(!showAddDeadline)}
                      className="text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
                    >
                      {showAddDeadline ? 'Cancel' : '+ Add Deadline'}
                    </button>
                  </div>

                  {showAddDeadline && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 space-y-3 mt-2 text-xs">
                      <div>
                        <label className="block text-slate-500 mb-1">Type</label>
                        <select
                          className="input text-xs w-full"
                          value={newDeadlineType}
                          onChange={e => setNewDeadlineType(e.target.value as DeadlineType)}
                        >
                          {DEADLINE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>
                              {DEADLINE_TYPE_ICONS[t.value]} {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 mb-1">Label</label>
                        <input
                          type="text"
                          className="input text-xs w-full"
                          placeholder="e.g. Midterm Exam"
                          value={newLabel}
                          onChange={e => setNewLabel(e.target.value)}
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 mb-1">Subject</label>
                        <select
                          className="input text-xs w-full"
                          value={newSubjectId}
                          onChange={e => setNewSubjectId(Number(e.target.value))}
                        >
                          {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setShowAddDeadline(false)}
                          className="btn-secondary flex-1 py-1.5"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddDeadline}
                          disabled={!newLabel.trim()}
                          className="btn-primary flex-1 py-1.5"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedInfo?.deadlines.length === 0 && !showAddDeadline && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                      No deadlines on this day
                    </p>
                  )}

                  {selectedInfo?.deadlines.map(d => {
                    const typeInfo = DEADLINE_TYPES.find(t => t.value === d.deadline_type)
                    return (
                      <div
                        key={d.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">
                            {DEADLINE_TYPE_ICONS[d.deadline_type] || '🗓️'}
                          </span>
                          <div className="min-w-0">
                            <span className="text-slate-800 dark:text-slate-200 font-medium block truncate">
                              {d.label}
                            </span>
                            {typeInfo && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {typeInfo.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteDeadline(d.id)}
                          className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CalendarSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSyncComplete={loadCalendarData}
        sources={sources}
      />

      <AddEventModal
        isOpen={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        onEventSaved={loadCalendarData}
        initialDate={selectedDate}
        subjects={subjects}
      />
    </div>
  )
}
