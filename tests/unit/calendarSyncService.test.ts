import {
  parseICalFeed,
  matchEventSubject,
  detectEventType
} from '../../electron/ipc/calendarSyncService'

describe('calendarSyncService', () => {
  const mockSubjects = [
    { id: 1, name: 'Macroeconomics', courseCode: 'ECON 201' },
    { id: 2, name: 'Organic Chemistry', courseCode: 'CHEM 220' },
    { id: 3, name: 'Cell Biology' }
  ]

  describe('matchEventSubject', () => {
    test('matches by course code', () => {
      expect(matchEventSubject('ECON 201 Lecture - Inflation', '', mockSubjects)).toBe(1)
      expect(matchEventSubject('CHEM 220 Lab', '', mockSubjects)).toBe(2)
    })

    test('matches by subject name keywords', () => {
      expect(matchEventSubject('Discussion on Macroeconomics', '', mockSubjects)).toBe(1)
      expect(matchEventSubject('Organic Chemistry Midterm Review', '', mockSubjects)).toBe(2)
      expect(matchEventSubject('Cell Biology Seminar', '', mockSubjects)).toBe(3)
    })

    test('returns undefined for non-subject events', () => {
      expect(matchEventSubject('Gym Workout with Sam', '', mockSubjects)).toBeUndefined()
      expect(matchEventSubject('Dentist Appointment', '', mockSubjects)).toBeUndefined()
    })
  })

  describe('detectEventType', () => {
    test('detects lecture, lab, seminar, workshop, and personal', () => {
      expect(detectEventType('Physics 101 Lecture', false)).toBe('lecture')
      expect(detectEventType('Chem 220 Lab Section', true)).toBe('lab')
      expect(detectEventType('Graduate Seminar in Economics', true)).toBe('seminar')
      expect(detectEventType('Math Recitation / Workshop', true)).toBe('workshop')
      expect(detectEventType('Coffee with Alex', false)).toBe('personal')
    })
  })

  describe('parseICalFeed', () => {
    test('parses single non-recurring VEVENT within window', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:single-event-1@google.com
DTSTART:20260906T130000Z
DTEND:20260906T140000Z
SUMMARY:Cell Biology Seminar
DESCRIPTION:Mitochondrial respiration
LOCATION:Science Center 101
END:VEVENT
END:VCALENDAR`

      const windowStart = new Date('2026-09-01T00:00:00Z')
      const windowEnd = new Date('2026-09-10T00:00:00Z')

      const events = parseICalFeed(ics, windowStart, windowEnd, mockSubjects)
      expect(events).toHaveLength(1)
      expect(events[0].title).toBe('Cell Biology Seminar')
      expect(events[0].subject_id).toBe(3)
      expect(events[0].event_type).toBe('seminar')
      expect(events[0].start_time).toContain('2026-09-06')
      expect(events[0].external_id).toBe('single-event-1@google.com')
    })

    test('expands recurring MWF lecture into multiple instances within window', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar//EN
BEGIN:VEVENT
UID:recurring-econ@google.com
DTSTART:20260901T090000Z
DTEND:20260901T100000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
SUMMARY:ECON 201: Macroeconomics Lecture
DESCRIPTION:Prof. Smith
LOCATION:Hall A
END:VEVENT
END:VCALENDAR`

      // 2026-09-01 is Tuesday.
      // Wed Sep 2, Fri Sep 4, Mon Sep 7, Wed Sep 9, Fri Sep 11
      const windowStart = new Date('2026-09-01T00:00:00Z')
      const windowEnd = new Date('2026-09-12T00:00:00Z')

      const events = parseICalFeed(ics, windowStart, windowEnd, mockSubjects)
      expect(events.length).toBeGreaterThanOrEqual(5)
      events.forEach((evt: any) => {
        expect(evt.subject_id).toBe(1)
        expect(evt.event_type).toBe('lecture')
        expect(evt.title).toBe('ECON 201: Macroeconomics Lecture')
      })
    })

    test('handles folded lines in ics format', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:folded-line-event@google.com
DTSTART:20260906T150000Z
DTEND:20260906T160000Z
SUMMARY:This is a very long event title that gets split ac
 ross multiple lines by ical folding
DESCRIPTION:Detailed description that also
  has leading spaces on continuation lines
END:VEVENT
END:VCALENDAR`

      const windowStart = new Date('2026-09-01T00:00:00Z')
      const windowEnd = new Date('2026-09-10T00:00:00Z')

      const events = parseICalFeed(ics, windowStart, windowEnd, mockSubjects)
      expect(events).toHaveLength(1)
      expect(events[0].title).toBe('This is a very long event title that gets split across multiple lines by ical folding')
    })
  })
})
