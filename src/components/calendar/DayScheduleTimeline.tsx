import React, { useState } from 'react'
import type { CalendarEvent, CalendarEventType } from '../../types'

export interface ScheduleGap {
  startTime: string
  endTime: string
  durationMinutes: number
}

export interface DayScheduleTimelineProps {
  events: CalendarEvent[]
  selectedDate: string
  onSlotClick?: (startTime: string, durationMinutes: number) => void
  onEventClick?: (event: CalendarEvent) => void
  onDeleteEvent?: (eventId: number) => void
  onAddEventClick?: () => void
}

export const EVENT_TYPE_ICONS: Record<CalendarEventType, string> = {
  lecture: '🎓',
  seminar: '💡',
  lab: '🔬',
  workshop: '🛠️',
  study: '📖',
  personal: '🗓️'
}

/**
 * Calculates open gaps (>= 15 mins) between events on a specific day.
 */
export function calculateGaps(
  events: CalendarEvent[],
  dateStr: string,
  startHour: number = 8,
  endHour: number = 21
): ScheduleGap[] {
  // Filter events active on dateStr, excluding all-day
  const dayEvents = events
    .filter(e => {
      const eDate = e.start_time.split('T')[0]
      return eDate === dateStr && !e.all_day
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const pad = (n: number) => String(n).padStart(2, '0')
  const toMinutes = (timeStr: string): number => {
    const timePart = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr
    const [h, m] = timePart.split(':').map(Number)
    return h * 60 + (m || 0)
  }

  const toTimeString = (minutes: number): string => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${pad(h)}:${pad(m)}`
  }

  const dayStartMin = startHour * 60
  const dayEndMin = endHour * 60
  const gaps: ScheduleGap[] = []

  let cursor = dayStartMin

  for (const evt of dayEvents) {
    const evtStart = toMinutes(evt.start_time)
    const evtEnd = toMinutes(evt.end_time)

    if (evtStart > cursor && evtStart - cursor >= 15) {
      gaps.push({
        startTime: toTimeString(cursor),
        endTime: toTimeString(evtStart),
        durationMinutes: evtStart - cursor
      })
    }
    cursor = Math.max(cursor, evtEnd)
  }

  if (dayEndMin > cursor && dayEndMin - cursor >= 15) {
    gaps.push({
      startTime: toTimeString(cursor),
      endTime: toTimeString(dayEndMin),
      durationMinutes: dayEndMin - cursor
    })
  }

  return gaps
}

export default function DayScheduleTimeline({
  events,
  selectedDate,
  onSlotClick,
  onEventClick,
  onDeleteEvent,
  onAddEventClick
}: DayScheduleTimelineProps): React.JSX.Element {
  const [draggedDuration, setDraggedDuration] = useState<number | null>(null)

  const dayEvents = events.filter(e => {
    const eDate = e.start_time.split('T')[0]
    return eDate === selectedDate
  }).sort((a, b) => a.start_time.localeCompare(b.start_time))

  const allDayEvents = dayEvents.filter(e => e.all_day)
  const timedEvents = dayEvents.filter(e => !e.all_day)

  const earliestHour = timedEvents.length > 0
    ? Math.min(8, parseInt(timedEvents[0].start_time.split('T')[1].split(':')[0], 10))
    : 8
  const latestHour = timedEvents.length > 0
    ? Math.max(20, parseInt(timedEvents[timedEvents.length - 1].end_time.split('T')[1].split(':')[0], 10) + 1)
    : 20

  const gaps = calculateGaps(timedEvents, selectedDate, earliestHour, latestHour)

  // Merge events and gaps chronologically
  type TimelineItem =
    | { type: 'event'; data: CalendarEvent; startMin: number }
    | { type: 'gap'; data: ScheduleGap; startMin: number }

  const toMin = (t: string) => {
    const time = t.includes('T') ? t.split('T')[1] : t
    const [h, m] = time.split(':').map(Number)
    return h * 60 + (m || 0)
  }

  const items: TimelineItem[] = [
    ...timedEvents.map(e => ({ type: 'event' as const, data: e, startMin: toMin(e.start_time) })),
    ...gaps.map(g => ({ type: 'gap' as const, data: g, startMin: toMin(g.startTime) }))
  ].sort((a, b) => a.startMin - b.startMin)

  const formatTimeDisplay = (isoOrTime: string) => {
    const time = isoOrTime.includes('T') ? isoOrTime.split('T')[1] : isoOrTime
    const [hStr, mStr] = time.split(':')
    const h = parseInt(hStr, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayH = h % 12 || 12
    return `${displayH}:${mStr} ${ampm}`
  }

  const handleDropOnGap = (gap: ScheduleGap) => {
    if (draggedDuration && onSlotClick) {
      onSlotClick(gap.startTime, Math.min(draggedDuration, gap.durationMinutes))
      setDraggedDuration(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Optional Drag-and-Drop Time-Boxing Toolbar */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Study Blocks:
          </span>
          <div className="flex items-center gap-1.5">
            {[15, 30, 45, 60].map(mins => (
              <div
                key={mins}
                draggable
                onDragStart={() => setDraggedDuration(mins)}
                onDragEnd={() => setDraggedDuration(null)}
                onClick={() => {
                  if (gaps.length > 0 && onSlotClick) {
                    onSlotClick(gaps[0].startTime, mins)
                  }
                }}
                className="cursor-grab active:cursor-grabbing px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 rounded-lg border border-violet-200 dark:border-violet-700/50 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all shadow-2xs select-none"
                title="Drag into any free study window or click to schedule"
              >
                +{mins}m
              </div>
            ))}
          </div>
        </div>

        {onAddEventClick && (
          <button
            onClick={onAddEventClick}
            className="text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline flex items-center gap-1"
          >
            <span>+</span> Add Event
          </button>
        )}
      </div>

      {/* All-Day Events */}
      {allDayEvents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            All Day
          </p>
          {allDayEvents.map(evt => (
            <div
              key={evt.id}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span>{EVENT_TYPE_ICONS[evt.event_type] || '🗓️'}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{evt.title}</span>
                {evt.subject_name && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                    {evt.subject_name}
                  </span>
                )}
              </div>
              {onDeleteEvent && (
                <button
                  onClick={() => onDeleteEvent(evt.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Remove event"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timeline view */}
      {dayEvents.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
          <span className="text-2xl mb-2 block">🗓️</span>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No events scheduled for this day
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
            Sync with Google Calendar or add lectures, labs, and personal study commitments.
          </p>
          {onSlotClick && (
            <button
              onClick={() => onSlotClick('09:00', 30)}
              className="btn-primary text-xs py-1.5 px-3 mt-4"
            >
              Start a Focus Block
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, idx) => {
            if (item.type === 'event') {
              const evt = item.data
              return (
                <div
                  key={`evt-${evt.id}-${idx}`}
                  onClick={() => onEventClick && onEventClick(evt)}
                  className="relative p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 transition-all shadow-2xs group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {EVENT_TYPE_ICONS[evt.event_type] || '🗓️'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {evt.title}
                          </h4>
                          {evt.subject_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                              {evt.subject_name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatTimeDisplay(evt.start_time)} – {formatTimeDisplay(evt.end_time)}
                          {evt.location ? ` · ${evt.location}` : ''}
                        </p>
                        {evt.description && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">
                            {evt.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {onDeleteEvent && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onDeleteEvent(evt.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1 transition-opacity text-xs"
                        title="Delete event"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            } else {
              const gap = item.data
              return (
                <div
                  key={`gap-${gap.startTime}-${gap.endTime}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDropOnGap(gap)}
                  className="p-2.5 rounded-xl border border-dashed border-emerald-300/70 dark:border-emerald-700/50 bg-emerald-50/40 dark:bg-emerald-950/10 flex items-center justify-between gap-3 transition-colors hover:bg-emerald-50/80 dark:hover:bg-emerald-950/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        {gap.durationMinutes}m Free Window
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 ml-1.5">
                        ({formatTimeDisplay(gap.startTime)} – {formatTimeDisplay(gap.endTime)})
                      </span>
                    </div>
                  </div>

                  {onSlotClick && (
                    <button
                      onClick={() => onSlotClick(gap.startTime, Math.min(30, gap.durationMinutes))}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs flex-shrink-0"
                    >
                      + Focus Block
                    </button>
                  )}
                </div>
              )
            }
          })}
        </div>
      )}
    </div>
  )
}
