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

  test('evaluating with targetTopicIds restores decaying 83% topic to 100% and returns updatedTopics', async () => {
    // Seed topic with decayed retention (<0.85)
    const pastDate = new Date(Date.now() - 5 * 86400000).toISOString()
    insert(
      db,
      `INSERT INTO topic_spaced_memory 
        (topic_id, user_id, subject_id, stability, difficulty, retrievability, reps, lapses, last_studied_at, next_review_due, status)
       VALUES (?, ?, ?, 2.0, 5.0, 0.70, 2, 0, ?, ?, 'fading')`,
      topicId, userId, subjectId, pastDate, new Date().toISOString().split('T')[0]
    )

    // Pre-check: topic is fading and retrievability is ~83%
    const initialMap = getTopicsRetention(db, userId, subjectId, moduleId)
    expect(initialMap.get(topicId)?.retrievability).toBeLessThan(0.85)

    // Create drill session
    const sessionId = insert(
      db,
      'INSERT INTO tutor_sessions (subject_id, user_id, module_id, session_type, phase) VALUES (?, ?, ?, ?, ?)',
      subjectId, userId, moduleId, 'tutor', 'structured_qa'
    )
    insert(db, 'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)', sessionId, subjectId, 'Gibbs Free Energy Drill')
    insert(db, 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', sessionId, 'assistant', 'Explain Gibbs Free Energy in equilibrium.')
    insert(db, 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', sessionId, 'user', 'At equilibrium delta G is zero and K equals Q.')

    // End drill passing targetTopicIds (as sent by our updated TutorSession)
    const evalResult = await evaluateAndSaveSessionMemory(db, sessionId, 'Excellent recall on equilibrium', {
      targetTopicIds: [topicId],
      moduleId
    })

    expect(evalResult).toBeDefined()
    expect(evalResult?.updatedTopics).toBeDefined()
    expect(evalResult?.updatedTopics?.length).toBeGreaterThanOrEqual(1)

    // Post-check: topic retention is restored to 1.0 (fresh)
    const updatedMap = getTopicsRetention(db, userId, subjectId, moduleId)
    const updatedRecord = updatedMap.get(topicId)

    expect(updatedRecord).toBeDefined()
    expect(updatedRecord?.retrievability).toBe(1.0)
    expect(updatedRecord?.retentionStatus).toBe('fresh')
    expect(updatedRecord?.reps).toBe(3)
  })

  test('getTopDueMaintenanceTopics returns all due topics when limit is omitted', async () => {
    const { getTopDueMaintenanceTopics } = await import('../../src/lib/memory/topicSrsEngine')

    // Create 10 decaying topics
    const today = new Date().toISOString().split('T')[0]
    for (let i = 2; i <= 11; i++) {
      const tId = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, `Topic ${i}`, i)
      insert(
        db,
        `INSERT INTO topic_spaced_memory 
          (topic_id, user_id, subject_id, stability, difficulty, retrievability, reps, lapses, last_studied_at, next_review_due, status)
         VALUES (?, ?, ?, 2.0, 5.0, 0.70, 1, 0, ?, ?, 'fading')`,
        tId, userId, subjectId, '2026-09-01T12:00:00.000Z', today
      )
    }

    // Unlimited query should return all 10 topics
    const allDue = getTopDueMaintenanceTopics(db, userId)
    expect(allDue.length).toBe(10)

    // Specific limit should restrict to that count
    const top3 = getTopDueMaintenanceTopics(db, userId, 3)
    expect(top3.length).toBe(3)
  })
})
