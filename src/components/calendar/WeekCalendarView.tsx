import React from 'react'
import type { CalendarEvent } from '../../types'
import { addDays, eventDateKey, eventMinutes, formatShortTime, startOfWeek, toDateKey } from '../../lib/calendarUtils'

interface WeekCalendarViewProps {
  anchorDate: Date
  events: CalendarEvent[]
  selectedDate: string
  onDateSelect: (date: string) => void
  onEventClick: (event: CalendarEvent) => void
  onSlotClick: (date: string, minutes: number, durationMinutes?: number) => void
}

const START_HOUR = 7
const END_HOUR = 22
const HOUR_HEIGHT = 64
const eventColor = (event: CalendarEvent): string => event.subject_color || (event.event_type === 'study' ? '#7c3aed' : '#64748b')

export default function WeekCalendarView({ anchorDate, events, selectedDate, onDateSelect, onEventClick, onSlotClick }: WeekCalendarViewProps): React.JSX.Element {
  const [draggedDuration, setDraggedDuration] = React.useState<number | null>(null)
  const weekStart = startOfWeek(anchorDate)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const dayHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <div className="grid grid-cols-[58px_repeat(7,minmax(100px,1fr))] border-b border-slate-200 dark:border-slate-800">
        <div />
        {days.map(day => {
          const key = toDateKey(day)
          const isSelected = key === selectedDate
          const isToday = key === toDateKey(new Date())
          return (
            <button key={key} onClick={() => onDateSelect(key)} className={`border-l border-slate-100 px-2 py-3 text-left transition-colors dark:border-slate-800 ${isSelected ? 'bg-violet-50 dark:bg-violet-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-violet-600 text-white' : isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>{day.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
        <span className="text-[11px] font-medium text-slate-500">Drag a study block into open time</span>
        <div className="flex gap-1.5">{[15, 30, 45, 60].map(duration => <button key={duration} draggable onDragStart={() => setDraggedDuration(duration)} onDragEnd={() => setDraggedDuration(null)} onClick={() => onSlotClick(selectedDate, 9 * 60, duration)} className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300">+{duration}m</button>)}</div>
      </div>
      <div className="grid grid-cols-[58px_repeat(7,minmax(100px,1fr))] overflow-x-auto">
        <div className="relative" style={{ height: dayHeight }}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
            <span key={index} className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400" style={{ top: index * HOUR_HEIGHT }}>{formatShortTime(`2000-01-01T${String(START_HOUR + index).padStart(2, '0')}:00`)}</span>
          ))}
        </div>
        {days.map(day => {
          const date = toDateKey(day)
          const dayEvents = events.filter(event => eventDateKey(event) === date && !event.all_day)
          return (
            <div key={date} className={`relative border-l border-slate-100 dark:border-slate-800 ${date === selectedDate ? 'bg-violet-50/30 dark:bg-violet-950/10' : ''}`} style={{ height: dayHeight }} onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault()
              if (draggedDuration) {
                const bounds = event.currentTarget.getBoundingClientRect()
                const minutes = START_HOUR * 60 + Math.max(0, Math.floor(((event.clientY - bounds.top) / HOUR_HEIGHT) * 60 / 15) * 15)
                onSlotClick(date, minutes, draggedDuration)
                setDraggedDuration(null)
              }
            }} onClick={event => {
              if (event.target === event.currentTarget) {
                const bounds = event.currentTarget.getBoundingClientRect()
                const minutes = START_HOUR * 60 + Math.max(0, Math.floor(((event.clientY - bounds.top) / HOUR_HEIGHT) * 60 / 15) * 15)
                onSlotClick(date, minutes, 45)
              }
            }}>
              {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => <div key={index} className="absolute inset-x-0 border-t border-slate-100/80 dark:border-slate-800/80" style={{ top: index * HOUR_HEIGHT }} />)}
              {dayEvents.map((item, index) => {
                const start = Math.max(START_HOUR * 60, eventMinutes(item.start_time))
                const end = Math.min(END_HOUR * 60, Math.max(start + 15, eventMinutes(item.end_time)))
                const duration = end - start
                const left = `${(index % 2) * 3}%`
                return (
                  <button key={item.id} onClick={event => { event.stopPropagation(); onEventClick(item) }} className={`absolute z-10 overflow-hidden rounded-lg border-l-4 px-2 py-1.5 text-left text-[11px] shadow-sm transition hover:brightness-95 ${item.event_type === 'study' ? 'bg-violet-100 dark:bg-violet-900/50' : 'bg-slate-100 dark:bg-slate-800'}`} style={{ top: ((start - START_HOUR * 60) / 60) * HOUR_HEIGHT + 2, height: Math.max(28, (duration / 60) * HOUR_HEIGHT - 4), left, width: index % 2 ? '94%' : '94%', borderLeftColor: eventColor(item) }}>
                    <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{item.title}</span>
                    <span className="block truncate text-slate-500 dark:text-slate-400">{formatShortTime(item.start_time)}{item.event_type === 'study' && item.study_status === 'completed' ? ' · Done' : ''}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
