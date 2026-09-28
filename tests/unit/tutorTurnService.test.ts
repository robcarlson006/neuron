import Database from 'better-sqlite3'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { TutorTurnService } from '../../electron/services/tutorTurnService'

function database(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const statement of DB_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) db.exec(statement)
  for (const statement of MIGRATIONS_SQL) {
    try { db.exec(statement) } catch (error) {
      if (!String(error).includes('duplicate column name')) throw error
    }
  }
  return db
}

const canOpenDatabase = (() => {
  try {
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
})()

function scalar(db: Database.Database, sql: string, ...params: unknown[]): any {
  return db.prepare(sql).get(...params) as any
}

describe(canOpenDatabase ? 'TutorTurnService' : 'TutorTurnService (native SQLite unavailable)', () => {
  if (!canOpenDatabase) {
    it.skip('requires a better-sqlite3 binary matching the host architecture', () => undefined)
    return
  }
  it('queues an existing user message idempotently and persists one assistant pair', () => {
    const db = database()
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Test')
    const userId = Number(scalar(db, 'SELECT id FROM users').id)
    db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').run(userId, 'Biology')
    const subjectId = Number(scalar(db, 'SELECT id FROM subjects').id)
    db.prepare("INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase) VALUES (?, ?, 'tutor', 'structured_qa')").run(subjectId, userId)
    const sessionId = Number(scalar(db, 'SELECT id FROM tutor_sessions').id)
    db.prepare("INSERT INTO tutor_messages (id, session_id, role, content, content_type, created_at) VALUES ('user-1', ?, 'user', 'Explain osmosis', 'text', datetime('now'))").run(sessionId)

    const service = new TutorTurnService(db)
    const queued = service.queueExistingUserTurn({ requestId: 'request-1', sessionId, message: 'Explain osmosis' })
    service.queueExistingUserTurn({ requestId: 'request-1', sessionId, message: 'Explain osmosis' })
    service.markStreaming('request-1')
    const completed = service.complete('request-1', 'Water moves down its water potential gradient.')

    expect(queued.status).toBe('queued')
    expect(completed.turn.status).toBe('complete')
    expect(completed.assistantMessage.id).toBe(completed.turn.assistant_message_id)
    expect(scalar(db, 'SELECT COUNT(*) AS count FROM tutor_turns').count).toBe(1)
    expect(scalar(db, "SELECT COUNT(*) AS count FROM tutor_messages WHERE session_id = ? AND role = 'assistant'", sessionId).count).toBe(1)
    db.close()
  })

  it('stores partial output and marks cancelled turns without losing the user message', () => {
    const db = database()
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Test')
    const userId = Number(scalar(db, 'SELECT id FROM users').id)
    db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').run(userId, 'Biology')
    const subjectId = Number(scalar(db, 'SELECT id FROM subjects').id)
    db.prepare("INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase) VALUES (?, ?, 'tutor', 'structured_qa')").run(subjectId, userId)
    const sessionId = Number(scalar(db, 'SELECT id FROM tutor_sessions').id)
    db.prepare("INSERT INTO tutor_messages (id, session_id, role, content, content_type, created_at) VALUES ('user-2', ?, 'user', 'Continue', 'text', datetime('now'))").run(sessionId)
    const service = new TutorTurnService(db)
    service.queueExistingUserTurn({ requestId: 'request-2', sessionId, message: 'Continue' })
    service.markStreaming('request-2')
    const turn = service.terminate('request-2', 'cancelled', 'Partial answer')
    expect(turn?.status).toBe('cancelled')
    expect(turn?.terminal_reason).toBe('cancelled')
    expect(scalar(db, "SELECT COUNT(*) AS count FROM tutor_messages WHERE session_id = ? AND role = 'user'", sessionId).count).toBe(1)
    expect(scalar(db, "SELECT COUNT(*) AS count FROM tutor_messages WHERE session_id = ? AND role = 'assistant'", sessionId).count).toBe(1)
    db.close()
  })
})
