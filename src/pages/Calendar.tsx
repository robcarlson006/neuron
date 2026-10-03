import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import CalendarView from '../components/CalendarView'
import WeekCalendarView from '../components/calendar/WeekCalendarView'
import CalendarSyncModal from '../components/calendar/CalendarSyncModal'
import AddEventModal from '../components/calendar/AddEventModal'
import type { CalendarEvent, CalendarEventType, CalendarSource, Deadline, DeadlineType } from '../types'
import { addDays, buildDaySummary, eventDateKey, eventMinutes, startOfWeek, toDateKey, weekKeys } from '../lib/calendarUtils'

const DEADLINE_TYPES: { value: DeadlineType; label: string }[] = [
  { value: 'exam', label: 'Exam' }, { value: 'test', label: 'Test' }, { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' }, { value: 'presentation', label: 'Presentation' }, { value: 'personal', label: 'Personal reminder' }
]
const EVENT_COLORS: Record<CalendarEventType, string> = { lecture: '#2563eb', seminar: '#0d9488', lab: '#d97706', workshop: '#db2777', study: '#7c3aed', personal: '#64748b' }
const formatDateLabel = (date: string): string => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export default function Calendar(): React.JSX.Element {
  const navigate = useNavigate()
  const { user, subjects, addToast } = useAppStore()
  const today = toDateKey(new Date())
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [cardsByDate, setCardsByDate] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [subjectFilter, setSubjectFilter] = useState<number | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<number | 'all'>('all')
  const [showSync, setShowSync] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState<CalendarEventType>('lecture')
  const [addStart, setAddStart] = useState('10:00')
  const [addDuration, setAddDuration] = useState(45)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [showDeadline, setShowDeadline] = useState(false)
  const [deadlineLabel, setDeadlineLabel] = useState('')
  const [deadlineType, setDeadlineType] = useState<DeadlineType>('exam')
  const [deadlineSubject, setDeadlineSubject] = useState<number>(subjects[0]?.id || 0)

  const range = useMemo(() => {
    const base = startOfWeek(anchorDate)
    return { startDate: toDateKey(addDays(base, -35)), endDate: toDateKey(addDays(base, 41)) + 'T23:59:59' }
  }, [anchorDate])

  async function loadCalendarData(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const [fetchedEvents, fetchedSources, fetchedDeadlines, schedules] = await Promise.all([
        window.electronAPI.calendar.getEvents({ userId: user.id, startDate: range.startDate, endDate: range.endDate }),
        window.electronAPI.calendar.getSources(user.id), window.electronAPI.getDeadlines(), window.electronAPI.getAllSchedules(user.id)
      ])
      setEvents(fetchedEvents); setSources(fetchedSources); setDeadlines(fetchedDeadlines)
      const counts = new Map<string, number>(); schedules.forEach(schedule => counts.set(schedule.due_date, (counts.get(schedule.due_date) || 0) + 1)); setCardsByDate(counts)
    } catch (error) {
      console.error('Calendar load error:', error); addToast({ type: 'error', title: 'Calendar unavailable', message: 'Could not load your schedule. Try again.' })
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadCalendarData() }, [user, range.startDate, range.endDate])

  function changePeriod(direction: number): void {
    const next = new Date(anchorDate); if (view === 'week') next.setDate(next.getDate() + direction * 7); else next.setMonth(next.getMonth() + direction)
    setAnchorDate(next); setSelectedDate(toDateKey(view === 'week' ? startOfWeek(next) : new Date(next.getFullYear(), next.getMonth(), 1)))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key.toLowerCase() === 't') { setAnchorDate(new Date()); setSelectedDate(today) }
      if (event.key.toLowerCase() === 'w') setView('week'); if (event.key.toLowerCase() === 'm') setView('month')
      if (event.key.toLowerCase() === 'n') { setAddType('study'); setShowAdd(true) }
      if (event.key === 'ArrowLeft') changePeriod(-1); if (event.key === 'ArrowRight') changePeriod(1)
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  })

  function openSlot(date: string, minutes: number, durationMinutes = 45): void {
    setSelectedDate(date); setAddType('study'); setAddStart(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`); setAddDuration(durationMinutes); setShowAdd(true)
  }

  const visibleEvents = useMemo(() => events.filter(event => (subjectFilter === 'all' || event.subject_id === subjectFilter) && (sourceFilter === 'all' || event.source_id === sourceFilter)), [events, subjectFilter, sourceFilter])
  const summary = useMemo(() => buildDaySummary(selectedDate, visibleEvents, deadlines, cardsByDate), [selectedDate, visibleEvents, deadlines, cardsByDate])
  const availableMinutes = Math.max(0, 15 * 60 - summary.events.filter(event => !event.all_day).reduce((total, event) => total + Math.max(0, eventMinutes(event.end_time) - eventMinutes(event.start_time)), 0))
  const weekDayKeys = weekKeys(anchorDate)
  const monthGridStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  monthGridStart.setDate(monthGridStart.getDate() - monthGridStart.getDay())
  const monthInfo = useMemo(() => Array.from({ length: 42 }, (_, index) => buildDaySummary(toDateKey(addDays(monthGridStart, index)), visibleEvents, deadlines, cardsByDate)), [monthGridStart.getTime(), visibleEvents, deadlines, cardsByDate])
  const nextDeadline = deadlines.filter(item => item.deadline_date >= today).sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))[0]

  async function updateStudyStatus(event: CalendarEvent, status: 'planned' | 'completed' | 'skipped'): Promise<void> {
    if (!user) return
    try { const updated = await window.electronAPI.calendar.updateStudyStatus(user.id, event.id, status); setEvents(previous => previous.map(item => item.id === updated.id ? updated : item)); setSelectedEvent(updated) }
    catch (error: any) { addToast({ type: 'error', title: 'Could not update block', message: error.message || 'Try again.' }) }
  }
  async function deleteEvent(event: CalendarEvent): Promise<void> {
    if (!user || event.source_id || !window.confirm(`Remove “${event.title}”?`)) return
    await window.electronAPI.calendar.deleteEvent(user.id, event.id); setSelectedEvent(null); await loadCalendarData()
  }
  async function addDeadline(): Promise<void> {
    if (!deadlineLabel.trim() || !deadlineSubject) return
    await window.electronAPI.saveDeadline({ subject_id: deadlineSubject, label: deadlineLabel.trim(), deadline_date: selectedDate, deadline_type: deadlineType }); setDeadlineLabel(''); setShowDeadline(false); await loadCalendarData()
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>

  return <div className="min-h-full space-y-5 overflow-y-auto p-5 lg:p-8">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-violet-600 dark:text-violet-400">Study command center</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Plan the week you can actually finish.</h1><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Classes set the rhythm. Neuron keeps due work, deadlines, and focused study in the same line of sight.</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={() => { setAnchorDate(new Date()); setSelectedDate(today) }} className="btn-secondary text-xs">Today <span className="text-[10px] text-slate-400">T</span></button><button onClick={() => setShowSync(true)} className="btn-secondary text-xs">{sources.length ? 'Sync calendars' : 'Connect calendar'}</button><button onClick={() => { setAddType('study'); setShowAdd(true) }} className="btn-primary text-xs">+ Plan study time</button></div></header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="border-l-4 border-amber-400 bg-amber-50/70 p-4 dark:bg-amber-950/20"><p className="text-xs text-amber-700 dark:text-amber-300">Due today</p><p className="mt-1 text-2xl font-semibold text-amber-950 dark:text-amber-100">{cardsByDate.get(today) || 0}</p><button onClick={() => navigate('/study')} className="mt-2 text-xs font-medium text-amber-700 underline dark:text-amber-300">Open review queue</button></div><div className="border-l-4 border-red-400 bg-red-50/70 p-4 dark:bg-red-950/20"><p className="text-xs text-red-700 dark:text-red-300">Next deadline</p><p className="mt-1 truncate text-base font-semibold text-red-950 dark:text-red-100">{nextDeadline?.label || 'Nothing due yet'}</p><p className="mt-1 text-xs text-red-700 dark:text-red-300">{nextDeadline ? nextDeadline.deadline_date : 'Add an exam or assignment'}</p></div><div className="border-l-4 border-violet-500 bg-violet-50/70 p-4 dark:bg-violet-950/20"><p className="text-xs text-violet-700 dark:text-violet-300">Planned this day</p><p className="mt-1 text-2xl font-semibold text-violet-950 dark:text-violet-100">{summary.studyMinutes}<span className="ml-1 text-sm font-normal">min</span></p><p className="mt-1 text-xs text-violet-700 dark:text-violet-300">{summary.events.filter(event => event.event_type === 'study').length} focus block(s)</p></div><div className="border-l-4 border-emerald-500 bg-emerald-50/70 p-4 dark:bg-emerald-950/20"><p className="text-xs text-emerald-700 dark:text-emerald-300">Open study time</p><p className="mt-1 text-2xl font-semibold text-emerald-950 dark:text-emerald-100">{Math.floor(availableMinutes / 60)}<span className="ml-1 text-sm font-normal">h</span> {availableMinutes % 60}<span className="ml-1 text-sm font-normal">m</span></p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{formatDateLabel(selectedDate)}</p></div></section>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-2"><button aria-label="Previous period" onClick={() => changePeriod(-1)} className="btn-secondary px-3">←</button><h2 className="min-w-[230px] text-center text-lg font-semibold text-slate-900 dark:text-white">{view === 'week' ? `${new Date(`${weekDayKeys[0]}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(`${weekDayKeys[6]}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2><button aria-label="Next period" onClick={() => changePeriod(1)} className="btn-secondary px-3">→</button></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Filter by subject" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="input w-auto text-xs"><option value="all">All subjects</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><select aria-label="Filter by source" value={sourceFilter} onChange={event => setSourceFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="input w-auto text-xs"><option value="all">All calendars</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700"><button onClick={() => setView('week')} className={`rounded-md px-3 py-1.5 text-xs ${view === 'week' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>Week <span className="text-[10px] opacity-60">W</span></button><button onClick={() => setView('month')} className={`rounded-md px-3 py-1.5 text-xs ${view === 'month' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>Month <span className="text-[10px] opacity-60">M</span></button></div></div></div>

    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_330px]"><div className="min-w-0">{view === 'week' ? <WeekCalendarView anchorDate={anchorDate} events={visibleEvents} selectedDate={selectedDate} onDateSelect={setSelectedDate} onEventClick={setSelectedEvent} onSlotClick={openSlot} /> : <CalendarView daysInfo={monthInfo} onDayClick={setSelectedDate} selectedDate={selectedDate} />}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500 dark:text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Class</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />Study block</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Cards due</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Deadline</span></div></div>

      <aside className="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-violet-600 dark:text-violet-400">Selected day</p><h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{formatDateLabel(selectedDate)}</h2></div><button onClick={() => { setAddType('study'); setShowAdd(true) }} className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400">+ Add</button></div><div className="mt-5 space-y-4"><div><p className="mb-2 text-xs font-semibold text-slate-400">SCHEDULE</p>{summary.events.length === 0 ? <p className="text-sm text-slate-500">No events yet. Click an empty slot to plan study time.</p> : <div className="space-y-2">{summary.events.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)).map(event => <button key={event.id} onClick={() => setSelectedEvent(event)} className="flex w-full items-center gap-3 border-l-4 bg-slate-50 p-3 text-left dark:bg-slate-800/70" style={{ borderLeftColor: EVENT_COLORS[event.event_type] }}><span className="min-w-[62px] text-[11px] text-slate-500">{event.all_day ? 'All day' : event.start_time.slice(11, 16)}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{event.title}</span>{event.event_type === 'study' && event.study_status === 'completed' && <span className="text-emerald-600">✓</span>}</button>)}</div>}</div><div><p className="mb-2 text-xs font-semibold text-slate-400">DEADLINES & REVIEW</p><div className="space-y-2">{summary.deadlines.map(deadline => <div key={deadline.id} className="flex items-center justify-between gap-2 bg-red-50 p-3 text-sm dark:bg-red-950/20"><span className="truncate font-medium text-red-900 dark:text-red-100">{deadline.label}</span><span className="text-[10px] text-red-600">{deadline.deadline_type}</span></div>)}{summary.cardsDue > 0 && <button onClick={() => navigate('/study')} className="flex w-full items-center justify-between bg-amber-50 p-3 text-left text-sm dark:bg-amber-950/20"><span className="font-medium text-amber-900 dark:text-amber-100">{summary.cardsDue} cards due</span><span className="text-xs font-semibold text-amber-700">Review →</span></button>}{summary.deadlines.length === 0 && summary.cardsDue === 0 && <p className="text-sm text-slate-500">No review pressure on this day.</p>}</div><button onClick={() => setShowDeadline(true)} className="mt-2 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400">+ Add deadline</button></div><div className="border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs font-semibold text-slate-400">OPEN CAPACITY</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{Math.floor(availableMinutes / 60)}h {availableMinutes % 60}m</p><p className="mt-1 text-xs text-slate-500">Tap an empty slot to turn capacity into a Focus Block.</p><button onClick={() => { setAddType('study'); setShowAdd(true) }} className="btn-primary mt-3 w-full text-xs">Plan focused study</button></div></div></aside>
    </div>

    {showDeadline && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={event => { event.preventDefault(); void addDeadline() }} className="w-full max-w-md space-y-4 bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold dark:text-white">Add deadline</h2><button type="button" onClick={() => setShowDeadline(false)} className="text-slate-400">✕</button></div><input className="input" value={deadlineLabel} onChange={event => setDeadlineLabel(event.target.value)} placeholder="e.g. Midterm exam" autoFocus /><div className="grid grid-cols-2 gap-3"><select className="input" value={deadlineType} onChange={event => setDeadlineType(event.target.value as DeadlineType)}>{DEADLINE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select><select className="input" value={deadlineSubject} onChange={event => setDeadlineSubject(Number(event.target.value))}>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowDeadline(false)} className="btn-secondary text-xs">Cancel</button><button type="submit" className="btn-primary text-xs">Save deadline</button></div></form></div>}
    {selectedEvent && <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={() => setSelectedEvent(null)}><div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={event => event.stopPropagation()}><button onClick={() => setSelectedEvent(null)} className="float-right text-slate-400">✕</button><p className="text-xs font-medium text-violet-600 dark:text-violet-400">{selectedEvent.source_id ? 'Synced calendar event' : selectedEvent.event_type === 'study' ? 'Study block' : 'Local event'}</p><h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{selectedEvent.title}</h2><p className="mt-2 text-sm text-slate-500">{selectedEvent.start_time.slice(0, 10)} · {selectedEvent.all_day ? 'All day' : `${selectedEvent.start_time.slice(11, 16)} – ${selectedEvent.end_time.slice(11, 16)}`}</p>{selectedEvent.location && <p className="mt-2 text-sm text-slate-500">{selectedEvent.location}</p>}{selectedEvent.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{selectedEvent.description}</p>}{selectedEvent.event_type === 'study' && <div className="mt-6 space-y-2"><button onClick={() => navigate(`/tutor?minutes=${selectedEvent.focus_minutes || 30}&start=${encodeURIComponent(selectedEvent.start_time.slice(11, 16))}&date=${eventDateKey(selectedEvent)}`)} className="btn-primary w-full text-sm">Start Focus Block</button><div className="grid grid-cols-2 gap-2"><button onClick={() => void updateStudyStatus(selectedEvent, selectedEvent.study_status === 'completed' ? 'planned' : 'completed')} className="btn-secondary text-xs">{selectedEvent.study_status === 'completed' ? 'Mark planned' : 'Mark complete'}</button><button onClick={() => void updateStudyStatus(selectedEvent, 'skipped')} className="btn-secondary text-xs">Skip block</button></div></div>}{!selectedEvent.source_id && <div className="mt-6 flex gap-2"><button onClick={() => { setEditingEvent(selectedEvent); setSelectedEvent(null); setAddType(selectedEvent.event_type); setShowAdd(true) }} className="btn-secondary flex-1 text-xs">Edit</button><button onClick={() => void deleteEvent(selectedEvent)} className="btn-danger flex-1 text-xs">Remove</button></div>}</div></div>}
    <CalendarSyncModal isOpen={showSync} onClose={() => setShowSync(false)} onSyncComplete={loadCalendarData} sources={sources} /><AddEventModal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditingEvent(null) }} onEventSaved={loadCalendarData} initialDate={selectedDate} initialType={addType} initialStartTime={addStart} initialDurationMinutes={addDuration} eventToEdit={editingEvent} subjects={subjects} />
  </div>
}
