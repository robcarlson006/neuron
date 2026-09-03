/**
 * Unit tests for topic completion and module completion status synchronization.
 */
import { syncModuleCompletionStatus } from '../../electron/ipc/tutorHandlers'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createTestDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0)
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
    try { db.exec(migration) } catch { /* column exists */ }
  }
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* column exists */ }
  }

  return db
}

function insert(db: any, sql: string, ...params: unknown[]): number {
  const result = db.prepare(sql).run(...params)
  return Number(result.lastInsertRowid)
}

describe('Topic & Module Completion Status Sync', () => {
  let db: any
  let userId: number
  let subjectId: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Test User')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Biology', 'active')
  })

  afterEach(() => {
    db.close()
  })

  it('updates only the targeted module status when its topics are completed', () => {
    // Create Module 1 with 2 topics
    const mod1Id = insert(db, `
      INSERT INTO syllabus_modules (subject_id, title, status, sort_order)
      VALUES (?, ?, ?, ?)
    `, subjectId, 'Module 1: Cellular Respiration', 'pending', 1)

    const topic1A = insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod1Id, 'Glycolysis', 1)

    const topic1B = insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod1Id, 'Krebs Cycle', 2)

    // Create Module 2 with 2 topics
    const mod2Id = insert(db, `
      INSERT INTO syllabus_modules (subject_id, title, status, sort_order)
      VALUES (?, ?, ?, ?)
    `, subjectId, 'Module 2: Photosynthesis', 'pending', 2)

    insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod2Id, 'Light Reactions', 1)

    insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod2Id, 'Calvin Cycle', 2)

    // Complete 1 topic in Module 1 -> status should be in_progress
    insert(db, `
      INSERT INTO module_topic_study_log (topic_id, user_id, studied_at)
      VALUES (?, ?, ?)
    `, topic1A, userId, new Date().toISOString())

    const status1A = syncModuleCompletionStatus(db, mod1Id, userId)
    expect(status1A).toBe('in_progress')

    // Verify Module 2 remains pending
    const mod2Before = db.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(mod2Id) as { status: string }
    expect(mod2Before.status).toBe('pending')

    // Complete second topic in Module 1 -> status should become completed
    insert(db, `
      INSERT INTO module_topic_study_log (topic_id, user_id, studied_at)
      VALUES (?, ?, ?)
    `, topic1B, userId, new Date().toISOString())

    const status1B = syncModuleCompletionStatus(db, mod1Id, userId)
    expect(status1B).toBe('completed')

    // Verify Module 2 status is still untouched and pending
    const mod2After = db.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(mod2Id) as { status: string }
    expect(mod2After.status).toBe('pending')
  })

  it('keeps empty module status unchanged and does not mark it complete', () => {
    const emptyModId = insert(db, `
      INSERT INTO syllabus_modules (subject_id, title, status, sort_order)
      VALUES (?, ?, ?, ?)
    `, subjectId, 'Module 3: Empty Module', 'pending', 3)

    const status = syncModuleCompletionStatus(db, emptyModId, userId)
    expect(status).toBe('pending')

    const modRecord = db.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(emptyModId) as { status: string }
    expect(modRecord.status).toBe('pending')
  })
})
