import { DB_SCHEMA } from '../../src/lib/db'
import { CalendarRepo } from '../../electron/ipc/calendarHandlers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('CalendarRepo & Context Detection', () => {
  let db: any
  let repo: CalendarRepo

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON;')
    const statements = DB_SCHEMA.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
    for (const stmt of statements) {
      db.exec(stmt + ';')
    }

    db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
    db.prepare("INSERT INTO subjects (id, user_id, name) VALUES (1, 1, 'Physics')").run()
    repo = new CalendarRepo(db)
  })

  afterEach(() => {
    db.close()
  })

  test('creates, gets, and deletes calendar sources', () => {
    const source = repo.saveSource({
      userId: 1,
      name: 'Google Calendar Feed',
      type: 'ical',
      url: 'https://calendar.google.com/feed.ics',
      color: '#10b981'
    })

    expect(source.id).toBeDefined()
    expect(source.name).toBe('Google Calendar Feed')

    const sources = repo.getSources(1)
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('https://calendar.google.com/feed.ics')

    const deleted = repo.deleteSource(source.id)
    expect(deleted).toBe(true)
    expect(repo.getSources(1)).toHaveLength(0)
  })

  test('creates, queries by date range, and deletes events', () => {
    const evt = repo.saveEvent(1, {
      title: 'Physics 101 Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      all_day: 0,
      subject_id: 1,
      event_type: 'lecture'
    })

    expect(evt.id).toBeDefined()
    expect(evt.subject_name).toBe('Physics')

    const events = repo.getEvents(1, '2026-09-06T00:00:00', '2026-09-06T23:59:59')
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Physics 101 Lecture')

    const deleted = repo.deleteEvent(evt.id)
    expect(deleted).toBe(true)
    expect(repo.getEvents(1)).toHaveLength(0)
  })

  test('detects pre-event context when within 60 min before start', () => {
    repo.saveEvent(1, {
      title: 'Physics 101 Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      all_day: 0,
      subject_id: 1,
      event_type: 'lecture'
    })

    const referenceTime = new Date('2026-09-06T09:30:00')
    const context = repo.detectCurrentContext(1, referenceTime)
    expect(context).not.toBeNull()
    expect(context?.type).toBe('pre_event')
    expect(context?.event.title).toBe('Physics 101 Lecture')
    expect(context?.minutesUntilStart).toBe(30)
  })

  test('detects post-event context when within 60 min after end', () => {
    repo.saveEvent(1, {
      title: 'Physics 101 Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      all_day: 0,
      subject_id: 1,
      event_type: 'lecture'
    })

    const referenceTime = new Date('2026-09-06T11:15:00')
    const context = repo.detectCurrentContext(1, referenceTime)
    expect(context).not.toBeNull()
    expect(context?.type).toBe('post_event')
    expect(context?.event.title).toBe('Physics 101 Lecture')
    expect(context?.minutesSinceEnd).toBe(15)
  })

  test('returns null when outside ±60 min window', () => {
    repo.saveEvent(1, {
      title: 'Physics 101 Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      all_day: 0,
      subject_id: 1,
      event_type: 'lecture'
    })

    // 2 hours before
    const beforeContext = repo.detectCurrentContext(1, new Date('2026-09-06T08:00:00'))
    expect(beforeContext).toBeNull()

    // 2 hours after
    const afterContext = repo.detectCurrentContext(1, new Date('2026-09-06T13:00:00'))
    expect(afterContext).toBeNull()
  })

  test('persists study block metadata and protects synced events', () => {
    const block = repo.saveEvent(1, {
      title: 'Focus block',
      start_time: '2026-09-06T14:00:00',
      end_time: '2026-09-06T14:45:00',
      all_day: 0,
      subject_id: 1,
      event_type: 'study',
      focus_minutes: 45,
      focus_action: 'tutor'
    })
    expect(block.study_status).toBe('planned')
    expect(block.focus_action).toBe('tutor')
    const completed = repo.updateStudyStatus(1, block.id, 'completed')
    expect(completed.study_status).toBe('completed')
    db.prepare("INSERT INTO calendar_sources (id, user_id, name, type) VALUES (9, 1, 'Imported', 'ical')").run()
    db.prepare('UPDATE calendar_events SET source_id = 9 WHERE id = ?').run(block.id)
    expect(() => repo.saveEvent(1, { ...block, title: 'Should not edit' })).toThrow(/read-only/i)
  })

  test('rejects invalid event time ranges', () => {
    expect(() => repo.saveEvent(1, {
      title: 'Invalid',
      start_time: '2026-09-06T11:00:00',
      end_time: '2026-09-06T10:00:00',
      event_type: 'lecture'
    })).toThrow(/after its start time/i)
  })
})
