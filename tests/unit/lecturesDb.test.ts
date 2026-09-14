import { DB_SCHEMA, MIGRATIONS_SQL, createLecture, getLectureById, listLecturesBySubject, updateLectureStatus, deleteLecture } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createTestDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  const migrations = [
    "ALTER TABLE deadlines ADD COLUMN deadline_type TEXT NOT NULL DEFAULT 'personal'",
    'ALTER TABLE review_log ADD COLUMN response_time_ms INTEGER',
    'ALTER TABLE cards ADD COLUMN folder_id INTEGER REFERENCES card_folders(id)',
    'ALTER TABLE card_schedule ADD COLUMN stability REAL',
    'ALTER TABLE card_schedule ADD COLUMN difficulty REAL',
    'ALTER TABLE card_schedule ADD COLUMN state INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE card_schedule ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE cards ADD COLUMN concept TEXT'
  ]
  for (const migration of migrations) {
    try { db.exec(migration) } catch { /* already applied */ }
  }
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* column may already exist */ }
  }

  return db
}

describe('Lectures DB operations', () => {
  let db: any

  beforeEach(() => {
    db = createTestDatabase()
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Student')
    db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(1, 'Neuroscience 101', 'active')
  })

  afterEach(() => {
    db.close()
  })

  test('schema contains lectures table definition', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS lectures')
  })

  test('creates and retrieves a lecture', () => {
    const lecture = createLecture(db, {
      subject_id: 1,
      title: 'Action Potentials & Synaptic Transmission',
      audio_path: '/recordings/lecture_1_123456.webm',
      audio_mime_type: 'audio/webm',
      duration_seconds: 5400,
      file_size_bytes: 25000000,
      status: 'recording'
    })

    expect(lecture.id).toBeDefined()
    expect(lecture.title).toBe('Action Potentials & Synaptic Transmission')
    expect(lecture.status).toBe('recording')

    const fetched = getLectureById(db, lecture.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.duration_seconds).toBe(5400)
    expect(fetched?.file_size_bytes).toBe(25000000)

    // Update status and transcript
    updateLectureStatus(db, lecture.id, 'ready', {
      raw_transcript: 'Today we will discuss how action potentials propagate along axons...'
    })

    const updated = getLectureById(db, lecture.id)
    expect(updated?.status).toBe('ready')
    expect(updated?.raw_transcript).toContain('action potentials')

    // List by subject
    const list = listLecturesBySubject(db, 1)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(lecture.id)

    // Delete
    deleteLecture(db, lecture.id)
    expect(getLectureById(db, lecture.id)).toBeNull()
  })
})
