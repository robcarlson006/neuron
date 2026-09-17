import { evaluateAndSaveSessionMemory } from '../../electron/ipc/tutorHandlers'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { getTopicsRetention } from '../../src/lib/memory/topicSrsEngine'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createTestDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
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

describe('Tutor Session Topic-SRS Integration', () => {
  let db: any
  let userId: number
  let subjectId: number
  let moduleId: number
  let topicId: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Test User')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Chemistry', 'active')
    moduleId = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Thermodynamics', 1)
    topicId = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Gibbs Free Energy', 1)
  })

  afterEach(() => {
    db.close()
  })

  test('evaluating a tutor session updates topic_spaced_memory with FSRS rating', async () => {
    // Create session and messages
    const sessionId = insert(
      db,
      'INSERT INTO tutor_sessions (subject_id, user_id, module_id, session_type, phase) VALUES (?, ?, ?, ?, ?)',
      subjectId, userId, moduleId, 'tutor', 'structured_qa'
    )
    insert(db, 'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)', sessionId, subjectId, 'Thermodynamics Session')

    insert(db, 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', sessionId, 'assistant', 'What is Gibbs Free Energy?')
    insert(db, 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', sessionId, 'user', 'Gibbs Free Energy determines spontaneity, delta G = delta H - T delta S.')

    // Evaluate session
    await evaluateAndSaveSessionMemory(db, sessionId, 'Great session on thermodynamics', {
      targetTopics: ['Gibbs Free Energy'],
      moduleId
    })

    const srsMap = getTopicsRetention(db, userId, subjectId, moduleId)
    const srsRecord = srsMap.get(topicId)

    expect(srsRecord).toBeDefined()
    expect(srsRecord?.topicTitle).toBe('Gibbs Free Energy')
    expect(srsRecord?.reps).toBeGreaterThanOrEqual(1)
    expect(srsRecord?.retrievability).toBeGreaterThan(0.85)
    expect(srsRecord?.retentionStatus).toBe('fresh')
  })
})
