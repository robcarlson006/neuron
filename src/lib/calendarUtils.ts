import type { CalendarEvent, Deadline } from '../types'

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - result.getDay())
  return result
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function weekKeys(anchor: Date): string[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)))
}

export function visibleRange(anchor: Date, view: 'week' | 'month'): { startDate: string; endDate: string } {
  if (view === 'week') {
    const keys = weekKeys(anchor)
    return { startDate: keys[0], endDate: keys[keys.length - 1] + 'T23:59:59' }
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  return {
    startDate: toDateKey(addDays(first, -first.getDay())),
    endDate: toDateKey(addDays(last, 6 - last.getDay())) + 'T23:59:59'
  }
}

export function eventDateKey(event: CalendarEvent): string {
  return event.start_time.slice(0, 10)
}

export function eventMinutes(value: string): number {
  const time = value.includes('T') ? value.split('T')[1] : value
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

export function formatShortTime(value: string): string {
  const minutes = eventMinutes(value)
  const hours = Math.floor(minutes / 60)
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

export interface CalendarDaySummary {
  date: string
  events: CalendarEvent[]
  deadlines: Deadline[]
  cardsDue: number
  studyMinutes: number
}

export function buildDaySummary(
  date: string,
  events: CalendarEvent[],
  deadlines: Deadline[],
  cardsByDate: Map<string, number>
): CalendarDaySummary {
  const dayEvents = events.filter(event => eventDateKey(event) === date)
  return {
    date,
    events: dayEvents,
    deadlines: deadlines.filter(deadline => deadline.deadline_date === date),
    cardsDue: cardsByDate.get(date) || 0,
    studyMinutes: dayEvents
      .filter(event => event.event_type === 'study' && event.study_status !== 'skipped')
      .reduce((sum, event) => sum + (event.focus_minutes || Math.max(0, eventMinutes(event.end_time) - eventMinutes(event.start_time))), 0)
  }
}
