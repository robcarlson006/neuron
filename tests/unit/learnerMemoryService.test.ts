import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { LearnerMemoryService } from '../../src/lib/memory/learnerMemoryService'

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const statement of DB_SCHEMA.split(';').map(item => item.trim()).filter(Boolean)) db.exec(`${statement};`)
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* additive migration already present */ }
  }
  return db
}

describe('LearnerMemoryService', () => {
  it('records evidence-backed events, deduplicates memories, and consolidates sessions', () => {
    const db = createDatabase()
    const userId = Number(db.prepare('INSERT INTO users (name) VALUES (?)').run('Alex').lastInsertRowid)
    const subjectId = Number(db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(userId, 'Algorithms', 'active').lastInsertRowid)
    const materialId = Number(db.prepare('INSERT INTO materials (subject_id, filename, file_type, content_text) VALUES (?, ?, ?, ?)').run(subjectId, 'lecture.txt', 'text/plain', 'Invariant').lastInsertRowid)
    const sessionId = Number(db.prepare('INSERT INTO tutor_sessions (subject_id, user_id) VALUES (?, ?)').run(subjectId, userId).lastInsertRowid)
    const service = new LearnerMemoryService(db)
    const evidence = [{ materialId, chunkIndex: 2, sourceLabel: 'Lecture 2', text: 'Invariant', score: 0.9 }]

    const eventId = service.recordLearningEvent({
      userId, subjectId, sessionId, concept: 'binary search', outcome: 'partial', score: 0.5,
      confidence: 0.8, assistanceLevel: 'hint', evidence
    })
    expect(eventId).toBeGreaterThan(0)

    const memoryId = service.upsertMemory({
      userId, subjectId, memoryType: 'semantic_fact', memoryKey: 'Binary Search',
      value: { needs: 'invariant practice' }, confidence: 0.7, sourceSessionId: sessionId, evidence
    })
    const sameMemoryId = service.upsertMemory({
      userId, subjectId, memoryType: 'semantic_fact', memoryKey: 'binary search',
      value: { needs: 'varied examples' }, confidence: 0.8, sourceSessionId: sessionId
    })

    expect(sameMemoryId).toBe(memoryId)
    expect(db.prepare('SELECT COUNT(*) AS count FROM learner_memory_items').get().count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_evidence_links WHERE memory_id = ?').get(memoryId).count).toBe(1)
    expect(service.retrieveForTurn(userId, subjectId, 'Explain binary search')).toHaveLength(1)

    service.consolidateSession(sessionId)
    const summary = db.prepare('SELECT summary, open_loops_json FROM session_summaries WHERE session_id = ?').get(sessionId)
    expect(summary.summary).toContain('binary search')
    expect(JSON.parse(summary.open_loops_json)).toEqual(['binary search'])
    db.close()
  })

  it('does not retrieve resolved memories as active learner context', () => {
    const db = createDatabase()
    const userId = Number(db.prepare('INSERT INTO users (name) VALUES (?)').run('Alex').lastInsertRowid)
    const subjectId = Number(db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(userId, 'Math', 'active').lastInsertRowid)
    const service = new LearnerMemoryService(db)
    const id = service.upsertMemory({ userId, subjectId, memoryType: 'semantic_fact', memoryKey: 'old fact', value: { old: true }, confidence: 0.9 })
    service.resolveConflict(id, 'resolved')
    expect(service.retrieveForTurn(userId, subjectId, 'old fact')).toHaveLength(0)
    db.close()
  })

  it('persists adaptive state from a turn and is idempotent on retries', () => {
    const db = createDatabase()
    const userId = Number(db.prepare('INSERT INTO users (name) VALUES (?)').run('Alex').lastInsertRowid)
    const subjectId = Number(db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(userId, 'Math', 'active').lastInsertRowid)
    const sessionId = Number(db.prepare('INSERT INTO tutor_sessions (subject_id, user_id) VALUES (?, ?)').run(subjectId, userId).lastInsertRowid)
    const service = new LearnerMemoryService(db)
    const assessment = {
      sessionId,
      studentMessageId: 'student-1',
      concept: 'derivatives',
      outcome: 'correct' as const,
      score: 1,
      confidence: 0.9,
      assistanceLevel: 'none' as const,
      taskType: 'application',
      idempotencyKey: `${sessionId}:student-1`
    }
    const first = service.recordTutorAssessment(assessment)
    const retry = service.recordTutorAssessment(assessment)
    expect(first.duplicate).toBe(false)
    expect(first.state?.observations).toBe(1)
    expect(retry.duplicate).toBe(true)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tutor_turn_assessments').get().count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count).toBe(1)
    db.close()
  })
})
