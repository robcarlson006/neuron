import { DB_SCHEMA } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('Calendar Database Schema', () => {
  let db: any

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON;')
    const statements = DB_SCHEMA.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
    for (const stmt of statements) {
      db.exec(stmt + ';')
    }
  })

  afterEach(() => {
    db.close()
  })

  test('creates calendar_sources and calendar_events tables', () => {
    const sourceTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_sources'").get()
    const eventsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_events'").get()
    expect(sourceTable).toBeDefined()
    expect(eventsTable).toBeDefined()
  })

  test('inserts and retrieves calendar source and event with cascade delete', () => {
    db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
    db.prepare("INSERT INTO subjects (id, user_id, name) VALUES (10, 1, 'Macroeconomics')").run()

    db.prepare(`
      INSERT INTO calendar_sources (id, user_id, name, type, url, color)
      VALUES (100, 1, 'Google Calendar', 'ical', 'https://calendar.google.com/test.ics', '#8b5cf6')
    `).run()

    db.prepare(`
      INSERT INTO calendar_events (id, user_id, source_id, external_id, title, start_time, end_time, subject_id, event_type)
      VALUES (200, 1, 100, 'ext-1', 'Econ Lecture', '2026-09-06T10:00:00', '2026-09-06T11:00:00', 10, 'lecture')
    `).run()

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = 200').get() as any
    expect(event.title).toBe('Econ Lecture')
    expect(event.subject_id).toBe(10)

    // Verify cascade delete on calendar_events when source is removed
    db.prepare('DELETE FROM calendar_sources WHERE id = 100').run()
    const deletedEvent = db.prepare('SELECT * FROM calendar_events WHERE id = 200').get()
    expect(deletedEvent).toBeUndefined()
  })

  test('sets subject_id to null when subject is deleted', () => {
    db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
    db.prepare("INSERT INTO subjects (id, user_id, name) VALUES (10, 1, 'Macroeconomics')").run()
    db.prepare(`
      INSERT INTO calendar_events (id, user_id, title, start_time, end_time, subject_id, event_type)
      VALUES (300, 1, 'Independent Seminar', '2026-09-06T14:00:00', '2026-09-06T15:00:00', 10, 'seminar')
    `).run()

    db.prepare('DELETE FROM subjects WHERE id = 10').run()
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = 300').get() as any
    expect(event).toBeDefined()
    expect(event.subject_id).toBeNull()
  })
})
