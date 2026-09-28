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

  test('a named target without assessment evidence does not update retention', async () => {
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
    expect(srsMap.get(topicId)).toBeUndefined()
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
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'question-1', sessionId, 'assistant', 'Explain Gibbs Free Energy in equilibrium.')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'answer-1', sessionId, 'user', 'At equilibrium delta G is zero and K equals Q.')

    // End drill passing targetTopicIds (as sent by our updated TutorSession)
    const evalResult = await evaluateAndSaveSessionMemory(db, sessionId, 'Excellent recall on equilibrium', {
      targetTopicIds: [topicId],
      moduleId,
      assessments: [{
        topic_id: topicId,
        question_message_id: 'question-1',
        answer_message_id: 'answer-1',
        outcome: 'correct',
        assistance_level: 'independent',
        confidence: 0.95
      }]
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

    // Re-running finalization cannot apply the same evidence twice.
    await evaluateAndSaveSessionMemory(db, sessionId, undefined, {
      targetTopicIds: [topicId],
      assessments: [{
        topic_id: topicId,
        question_message_id: 'question-1',
        answer_message_id: 'answer-1',
        outcome: 'correct',
        assistance_level: 'independent'
      }]
    })
    expect(getTopicsRetention(db, userId, subjectId, moduleId).get(topicId)?.reps).toBe(3)
  })

  test('assisted correct answers record coverage without advancing retention', async () => {
    const sessionId = insert(db, 'INSERT INTO tutor_sessions (subject_id, user_id, module_id, session_type, phase) VALUES (?, ?, ?, ?, ?)', subjectId, userId, moduleId, 'tutor', 'structured_qa')
    insert(db, 'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)', sessionId, subjectId, 'Assisted drill')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'question-assisted', sessionId, 'assistant', 'After that hint, what does negative delta G mean?')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'answer-assisted', sessionId, 'user', 'It means the process is spontaneous.')

    await evaluateAndSaveSessionMemory(db, sessionId, undefined, {
      targetTopicIds: [topicId],
      assessments: [{ topic_id: topicId, question_message_id: 'question-assisted', answer_message_id: 'answer-assisted', outcome: 'correct', assistance_level: 'hinted' }]
    })

    expect(getTopicsRetention(db, userId, subjectId, moduleId).get(topicId)).toBeUndefined()
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_topic_study_log WHERE topic_id = ?').get(topicId).count).toBe(1)
  })

  test('rejects topic IDs owned by another subject', async () => {
    const otherSubjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Physics', 'active')
    const otherModuleId = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', otherSubjectId, 'Mechanics', 1)
    const foreignTopicId = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', otherModuleId, 'Momentum', 1)
    const sessionId = insert(db, 'INSERT INTO tutor_sessions (subject_id, user_id, module_id, session_type, phase) VALUES (?, ?, ?, ?, ?)', subjectId, userId, moduleId, 'tutor', 'structured_qa')
    insert(db, 'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)', sessionId, subjectId, 'Chemistry drill')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'foreign-question', sessionId, 'assistant', 'What is momentum?')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'foreign-answer', sessionId, 'user', 'Mass times velocity.')

    const evaluation = await evaluateAndSaveSessionMemory(db, sessionId, undefined, {
      targetTopicIds: [foreignTopicId],
      assessments: [{ topic_id: foreignTopicId, question_message_id: 'foreign-question', answer_message_id: 'foreign-answer', outcome: 'correct', assistance_level: 'independent' }]
    })

    expect(evaluation?.assessment_status).toBe('unassessed')
    expect(db.prepare('SELECT COUNT(*) AS count FROM tutor_assessment_events').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM topic_spaced_memory').get().count).toBe(0)
  })

  test('rolls back evidence when a scheduling write fails', async () => {
    const sessionId = insert(db, 'INSERT INTO tutor_sessions (subject_id, user_id, module_id, session_type, phase) VALUES (?, ?, ?, ?, ?)', subjectId, userId, moduleId, 'tutor', 'structured_qa')
    insert(db, 'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)', sessionId, subjectId, 'Rollback drill')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'rollback-question', sessionId, 'assistant', 'What does negative delta G indicate?')
    insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', 'rollback-answer', sessionId, 'user', 'A spontaneous process.')
    db.exec("CREATE TRIGGER fail_topic_schedule BEFORE INSERT ON topic_spaced_memory BEGIN SELECT RAISE(ABORT, 'injected failure'); END")

    await expect(evaluateAndSaveSessionMemory(db, sessionId, undefined, {
      targetTopicIds: [topicId],
      assessments: [{ topic_id: topicId, question_message_id: 'rollback-question', answer_message_id: 'rollback-answer', outcome: 'correct', assistance_level: 'independent' }]
    })).rejects.toThrow('injected failure')

    expect(db.prepare('SELECT COUNT(*) AS count FROM tutor_assessment_events').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tutor_session_evaluations').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_topic_study_log').get().count).toBe(0)
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
