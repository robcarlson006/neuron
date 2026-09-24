import { getSubjectCurriculumTopics, buildTopicFocusBlock } from '../../electron/ipc/tutorHandlers'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { QuickReviewTopic } from '../../src/types'

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

describe('Quick Review Tutor Protocol & Curriculum Traversal', () => {
  let db: any
  let userId: number
  let subjectId: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Test User')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'AP Biology', 'active')
  })

  afterEach(() => {
    db.close()
  })

  describe('getSubjectCurriculumTopics', () => {
    test('returns empty array when subject has no modules', () => {
      const topics = getSubjectCurriculumTopics(db, subjectId)
      expect(topics).toEqual([])
    })

    test('extracts topics across multiple modules ordered by module and topic sort_order', () => {
      const mod1 = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Module 1: Chemistry of Life', 1)
      const mod2 = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Module 2: Cell Structure', 2)

      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod1, 'Water Properties', 1)
      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod1, 'Macromolecules', 2)

      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod2, 'Cell Organelles', 1)
      insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', mod2, 'Membrane Transport', 2)

      const topics = getSubjectCurriculumTopics(db, subjectId)
      expect(topics).toHaveLength(4)
      expect(topics[0].title).toBe('Water Properties')
      expect(topics[0].module_title).toBe('Module 1: Chemistry of Life')
      expect(topics[1].title).toBe('Macromolecules')
      expect(topics[2].title).toBe('Cell Organelles')
      expect(topics[2].module_title).toBe('Module 2: Cell Structure')
      expect(topics[3].title).toBe('Membrane Transport')
    })

    test('falls back to module title with negative ID if module has no child topics', () => {
      const mod1 = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Overview Module', 1)

      const topics = getSubjectCurriculumTopics(db, subjectId)
      expect(topics).toHaveLength(1)
      expect(topics[0].id).toBe(-mod1)
      expect(topics[0].title).toBe('Overview Module')
      expect(topics[0].module_title).toBe('Overview Module')
    })
  })

  describe('buildTopicFocusBlock in Quick Review Mode', () => {
    test('generates comprehensive Quick Review instructions with sequential roadmap and directives', () => {
      const mockTopics: QuickReviewTopic[] = [
        { id: 101, module_id: 1, module_title: 'Unit 1', title: 'Photosynthesis', sort_order: 1 },
        { id: 102, module_id: 1, module_title: 'Unit 1', title: 'Cellular Respiration', sort_order: 2 },
        { id: 103, module_id: 2, module_title: 'Unit 2', title: 'ATP Synthase Kinetics', sort_order: 1 }
      ]

      const block = buildTopicFocusBlock({
        isQuickReview: true,
        quickReviewTopics: mockTopics
      })

      // Protocol identifier
      expect(block).toContain('⚡ QUICK REVIEW PROTOCOL (FULL SUBJECT RAPID RECALL & MASTERY):')
      expect(block).toContain('3 topics total')

      // Roadmap presence
      expect(block).toContain('1. [Unit 1] Photosynthesis')
      expect(block).toContain('2. [Unit 1] Cellular Respiration')
      expect(block).toContain('3. [Unit 2] ATP Synthase Kinetics')

      // Core pedagogical directives
      expect(block).toContain('1 TO 3 CORE QUESTIONS PER TOPIC (MAXIMUM 3)')
      expect(block).toContain('NEVER ask more than 3 questions on any single topic')
      expect(block).toContain('QUESTION TYPE ADAPTIVITY')
      expect(block).toContain('Math / Calculation / Formulaic')
      expect(block).toContain('Socratic question or two-tier diagnostic counterfactual probe')
      expect(block).toContain('active recall retrieval question')
      expect(block).toContain('STRICT SEQUENTIAL PROGRESSION')
      expect(block).toContain('📍 **Topic [X]/3: [Topic Title]** (Question [1, 2, or 3])')
    })

    test('falls back gracefully to targetTopics array if quickReviewTopics is not provided', () => {
      const block = buildTopicFocusBlock({
        isQuickReview: true,
        targetTopics: ['Mitochondria', 'Chloroplasts']
      })

      expect(block).toContain('⚡ QUICK REVIEW PROTOCOL')
      expect(block).toContain('2 topics total')
      expect(block).toContain('1. Mitochondria')
      expect(block).toContain('2. Chloroplasts')
    })
  })

  describe('Topic progression regex detection', () => {
    const topicPattern = /(?:📍\s*)?\*?\*?Topic\s+(\d+)\s*(?:\/|\s+of\s+)\s*(\d+)/i

    test('detects formatted topic headers with emoji and question markers', () => {
      const msg = '📍 **Topic 2/15: Glycolysis** (Question 1)\n\nWhat is the net yield of ATP and NADH per glucose molecule in glycolysis?'
      const match = msg.match(topicPattern)
      expect(match).not.toBeNull()
      expect(match![1]).toBe('2')
      expect(match![2]).toBe('15')
    })

    test('detects markdown bold and "of" variations', () => {
      const msg = '**Topic 4 of 20: Photosystems I & II**\nExplain how light photons excite electrons in P680.'
      const match = msg.match(topicPattern)
      expect(match).not.toBeNull()
      expect(match![1]).toBe('4')
      expect(match![2]).toBe('20')
    })

    test('ignores messages without topic markers', () => {
      const msg = 'That is completely correct! Great job calculating the Gibbs Free Energy.'
      const match = msg.match(topicPattern)
      expect(match).toBeNull()
    })
  })
})
