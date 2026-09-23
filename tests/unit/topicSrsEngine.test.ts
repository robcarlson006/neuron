import {
  computeTopicRetrievability,
  classifyRetentionStatus,
  updateTopicSrsState,
  getTopicsRetention,
  getSubjectRetentionSummary
} from '../../src/lib/memory/topicSrsEngine'
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

  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* column exists */ }
  }

  return db
}

function insert(db: any, sql: string, ...params: unknown[]): number {
  const result = db.prepare(sql).run(...params)
  return Number(result.lastInsertRowid)
}

describe('Topic-SRS Engine', () => {
  let db: any
  let userId: number
  let subjectId: number
  let moduleId: number
  let topic1Id: number
  let topic2Id: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Test User')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Neuroscience', 'active')
    moduleId = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Action Potentials', 1)
    topic1Id = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Resting Potential', 1)
    topic2Id = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Voltage-Gated Na+ Channels', 2)
  })

  afterEach(() => {
    db.close()
  })

  test('computeTopicRetrievability decays over time', () => {
    const now = '2026-09-17T12:00:00.000Z'
    // Immediate: ~1.0
    expect(computeTopicRetrievability(3.0, now, now)).toBeCloseTo(1.0, 1)

    // After 3 days (stability = 3 days), retrievability hits target ~0.90
    const threeDaysLater = '2026-09-20T12:00:00.000Z'
    const r3 = computeTopicRetrievability(3.0, now, threeDaysLater)
    expect(r3).toBeGreaterThan(0.88)
    expect(r3).toBeLessThan(0.92)

    // After 15 days, retrievability decays substantially
    const fifteenDaysLater = '2026-09-02T12:00:00.000Z'
    const r15 = computeTopicRetrievability(3.0, fifteenDaysLater, now)
    expect(r15).toBeLessThan(0.70)
  })

  test('classifyRetentionStatus categorizes fresh, fading, overdue correctly', () => {
    const today = '2026-09-17'
    expect(classifyRetentionStatus(0.95, '2026-09-25', today)).toBe('fresh')
    expect(classifyRetentionStatus(0.75, '2026-09-25', today)).toBe('fading')
    expect(classifyRetentionStatus(0.50, '2026-09-25', today)).toBe('overdue')
    expect(classifyRetentionStatus(0.90, '2026-09-16', today)).toBe('overdue') // past due date
  })

  test('updateTopicSrsState creates and updates FSRS state', () => {
    const initial = updateTopicSrsState(db, userId, subjectId, topic1Id, 3, '2026-09-17T12:00:00.000Z')
    expect(initial.topicId).toBe(topic1Id)
    expect(initial.reps).toBe(1)
    expect(initial.stability).toBeGreaterThan(1.0)
    expect(initial.retrievability).toBeCloseTo(1.0, 1)

    // Second review with Good (3) increases stability
    const second = updateTopicSrsState(db, userId, subjectId, topic1Id, 3, '2026-09-20T12:00:00.000Z')
    expect(second.reps).toBe(2)
    expect(second.stability).toBeGreaterThan(initial.stability)

    // Check that study log was updated
    const log = db.prepare('SELECT * FROM module_topic_study_log WHERE topic_id = ?').get(topic1Id)
    expect(log).toBeDefined()
  })

  test('getTopicsRetention and getSubjectRetentionSummary report decaying metrics', () => {
    // Topic 1 was studied today
    updateTopicSrsState(db, userId, subjectId, topic1Id, 3, '2026-09-17T12:00:00.000Z')

    // Topic 2 was studied 20 days ago (decayed)
    updateTopicSrsState(db, userId, subjectId, topic2Id, 3, '2026-08-25T12:00:00.000Z')

    const summary = getSubjectRetentionSummary(db, userId, subjectId)
    expect(summary.completedTopics).toBe(2)
    expect(summary.totalTopics).toBe(2)
    expect(summary.dueTopics.length).toBeGreaterThanOrEqual(1)
    expect(summary.dueTopics[0].topicId).toBe(topic2Id)
    expect(summary.dueTopics[0].estimatedMinutes).toBeGreaterThanOrEqual(15)
  })

  test('computeEstimatedMinutesForRetention scales based on decay', () => {
    const { computeEstimatedMinutesForRetention } = require('../../src/lib/memory/topicSrsEngine')
    expect(computeEstimatedMinutesForRetention(0.95)).toBe(10)
    expect(computeEstimatedMinutesForRetention(0.85)).toBe(10)
    expect(computeEstimatedMinutesForRetention(0.70)).toBeGreaterThanOrEqual(15)
    expect(computeEstimatedMinutesForRetention(0.30)).toBeGreaterThanOrEqual(20)
    expect(computeEstimatedMinutesForRetention(0.05)).toBeLessThanOrEqual(30)
  })
})
