/**
 * Unit tests for the AI Tutor Learning Memory System & Gap Analysis Engine.
 */
import {
  computeGapAnalysis,
  buildHistoricalMemoryBlock,
  buildTopicFocusBlock,
  evaluateAndSaveSessionMemory
} from '../../electron/ipc/tutorHandlers'
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

describe('Tutor Memory & Gap Analysis Engine', () => {
  let db: any
  let userId: number
  let subjectId: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Alice')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Computer Science', 'active')
  })

  afterEach(() => {
    db.close()
  })

  describe('computeGapAnalysis', () => {
    it('detects uncovered syllabus modules when no study history exists', () => {
      insert(db, 'INSERT INTO syllabus_modules (subject_id, title, status, sort_order) VALUES (?, ?, ?, ?)', subjectId, 'Module 1: Pointers', 'pending', 1)
      insert(db, 'INSERT INTO syllabus_modules (subject_id, title, status, sort_order) VALUES (?, ?, ?, ?)', subjectId, 'Module 2: Recursion', 'pending', 2)

      const result = computeGapAnalysis(db, subjectId, userId)

      expect(result.uncoveredTopics.length).toBe(2)
      expect(result.uncoveredTopics[0].topic).toBe('Module 1: Pointers')
      expect(result.struggledTopics.length).toBe(0)
      expect(result.hasHistory).toBe(false)
      expect(result.recommendedFocus).toContain('Cover upcoming unstudied material')
    })

    it('identifies struggled concepts from tutor_topic_memories and prioritizes them', () => {
      // Create syllabus modules
      const mod1 = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, status, sort_order) VALUES (?, ?, ?, ?)', subjectId, 'Module 1: Data Structures', 'in_progress', 1)
      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod1, 'Binary Trees', 1)
      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod1, 'AVL Rotations', 2)

      // Add a struggled topic in memory
      insert(
        db,
        'INSERT INTO tutor_topic_memories (user_id, subject_id, topic, mastery_level, struggles, last_studied_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId, subjectId, 'AVL Rotations', 'struggling', 'Trouble with double rotation rules', '2026-08-20T10:00:00Z'
      )

      const result = computeGapAnalysis(db, subjectId, userId)

      expect(result.struggledTopics.length).toBe(1)
      expect(result.struggledTopics[0].topic).toBe('AVL Rotations')
      expect(result.struggledTopics[0].priority).toBe(1)
      expect(result.hasHistory).toBe(true)
      expect(result.recommendedTopics).toContain('AVL Rotations')
      expect(result.recommendedFocus).toContain('AVL Rotations (struggled previously)')
    })

    it('identifies low concept_mastery probability as a struggled gap', () => {
      insert(db, 'INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob) VALUES (?, ?, ?, ?)', userId, subjectId, 'Dynamic Programming', 0.25)

      const result = computeGapAnalysis(db, subjectId, userId)

      expect(result.struggledTopics.some(g => g.topic === 'Dynamic Programming')).toBe(true)
      expect(result.hasHistory).toBe(true)
    })
  })

  describe('Prompt Builders', () => {
    it('builds historical memory block with mastered and struggled concepts', () => {
      insert(
        db,
        'INSERT INTO tutor_topic_memories (user_id, subject_id, topic, mastery_level, strengths, struggles) VALUES (?, ?, ?, ?, ?, ?)',
        userId, subjectId, 'Hash Tables', 'mastered', 'Great grasp of collisions', null
      )
      insert(
        db,
        'INSERT INTO tutor_topic_memories (user_id, subject_id, topic, mastery_level, strengths, struggles) VALUES (?, ?, ?, ?, ?, ?)',
        userId, subjectId, 'Graph BFS', 'struggling', null, 'Queue tracking confusion'
      )

      const memoryBlock = buildHistoricalMemoryBlock(db, subjectId, userId)

      expect(memoryBlock).toContain('HISTORICAL LEARNING MEMORY')
      expect(memoryBlock).toContain('Hash Tables')
      expect(memoryBlock).toContain('Graph BFS')
    })

    it('builds topic focus block for fill in gaps mode', () => {
      const focusBlock = buildTopicFocusBlock({
        isFillGaps: true,
        gapTopics: ['Graph BFS', 'Tree Traversal']
      })

      expect(focusBlock).toContain('TARGETED GAP-FILLING FOCUS')
      expect(focusBlock).toContain('Graph BFS, Tree Traversal')
    })

    it('builds topic focus block for custom target topic', () => {
      const focusBlock = buildTopicFocusBlock({
        targetTopic: 'Dijkstra Algorithm'
      })

      expect(focusBlock).toContain('TARGET TOPIC FOCUS')
      expect(focusBlock).toContain('Dijkstra Algorithm')
    })
  })

  describe('evaluateAndSaveSessionMemory', () => {
    it('persists session evaluations and updates topic memories using fallback topic markers', async () => {
      const sessionId = insert(
        db,
        'INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase) VALUES (?, ?, ?, ?)',
        subjectId, userId, 'tutor', 'structured_qa'
      )

      // Ensure conversation row exists for messages FK
      insert(
        db,
        'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)',
        sessionId, subjectId, 'Tutor Session'
      )

      // Add sample messages with topic tag
      insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', '1', sessionId, 'user', 'Can you teach me binary search?')
      insert(db, 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)', '2', sessionId, 'assistant', 'Let us learn [TOPIC: Binary Search]. What is the time complexity?')

      const evaluation = await evaluateAndSaveSessionMemory(db, sessionId, 'Covered binary search basics.')

      expect(evaluation).not.toBeNull()
      expect(evaluation?.topics_covered).toContain('Binary Search')

      // Check saved evaluation record
      const evalRecord = db.prepare('SELECT * FROM tutor_session_evaluations WHERE session_id = ?').get(sessionId) as any
      expect(evalRecord).toBeDefined()
      expect(evalRecord.topics_covered_json).toContain('Binary Search')
    })
  })
})
