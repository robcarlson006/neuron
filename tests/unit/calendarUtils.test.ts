import type { CalendarEvent, Deadline } from '../../src/types'
import { buildDaySummary, eventMinutes, startOfWeek, toDateKey, visibleRange, weekKeys } from '../../src/lib/calendarUtils'

describe('calendar utilities', () => {
  test('builds a Sunday-starting week and buffered range', () => {
    const anchor = new Date(2026, 9, 2)
    expect(toDateKey(startOfWeek(anchor))).toBe('2026-09-27')
    expect(weekKeys(anchor)).toHaveLength(7)
    expect(visibleRange(anchor, 'week')).toEqual({ startDate: '2026-09-27', endDate: '2026-10-03T23:59:59' })
  })

  test('handles local event times and combines academic signals', () => {
    const event: CalendarEvent = {
      id: 1, user_id: 1, title: 'Focus', start_time: '2026-10-02T10:00:00', end_time: '2026-10-02T10:45:00', all_day: 0,
      event_type: 'study', study_status: 'planned', focus_minutes: 45, created_at: '', updated_at: ''
    }
    const deadline: Deadline = { id: 1, subject_id: 1, label: 'Exam', deadline_date: '2026-10-02', deadline_type: 'exam', created_at: '' }
    const summary = buildDaySummary('2026-10-02', [event], [deadline], new Map([['2026-10-02', 4]]))
    expect(eventMinutes(event.end_time) - eventMinutes(event.start_time)).toBe(45)
    expect(summary.cardsDue).toBe(4)
    expect(summary.deadlines).toHaveLength(1)
    expect(summary.studyMinutes).toBe(45)
  })
})
