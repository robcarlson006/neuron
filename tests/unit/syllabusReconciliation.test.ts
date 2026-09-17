/**
 * Unit tests for intelligent syllabus reconciliation, progress preservation,
 * and gap detection.
 */
import { reconcileCurriculum } from '../../electron/ipc/syllabusHandlers'
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

describe('Syllabus Reconciliation & Progress Preservation', () => {
  let db: any
  let userId: number
  let subjectId: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Rob')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Biochemistry', 'active')
  })

  afterEach(() => {
    db.close()
  })

  it('preserves completed topic progress and study logs when syllabus is reorganized', () => {
    // 1. Setup initial syllabus: Module 1 with 2 topics
    const mod1Id = insert(db, `
      INSERT INTO syllabus_modules (subject_id, title, status, sort_order)
      VALUES (?, ?, ?, ?)
    `, subjectId, 'Module 1: Cellular Respiration', 'in_progress', 0)

    const topic1A = insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod1Id, 'Glycolysis', 0)

    const topic1B = insert(db, `
      INSERT INTO module_topics (module_id, title, sort_order)
      VALUES (?, ?, ?)
    `, mod1Id, 'Krebs Cycle', 1)

    // Mark topic1A as completed by student
    insert(db, `
      INSERT INTO module_topic_study_log (topic_id, user_id, studied_at)
      VALUES (?, ?, ?)
    `, topic1A, userId, '2026-09-01T10:00:00.000Z')

    // Link a practice problem to topic1A
    const problemId = insert(db, `
      INSERT INTO practice_problems (subject_id, module_id, topic_id, title, problem_text)
      VALUES (?, ?, ?, ?, ?)
    `, subjectId, mod1Id, topic1A, 'Glycolysis ATP Yield', 'Calculate net ATP from glycolysis.')

    // Link a card to topic1A
    const cardId = insert(db, `
      INSERT INTO cards (subject_id, topic_id, type, front, back)
      VALUES (?, ?, ?, ?, ?)
    `, subjectId, topic1A, 'flashcard', 'Net ATP of Glycolysis', '2 ATP')

    // 2. Simulate AI reconciliation when new materials are added:
    // Module 1 is renamed to "Bioenergetics & Respiration"
    // Topic 1A is renamed to "Glycolysis Pathway" (matched_previous_topic: "Glycolysis")
    // Topic 1B is deepened with new content (coverage_delta: "deepened")
    // A brand new topic "Regulation of PFK-1" is added
    // A brand new Module 2 "Photosynthesis" is added
    const newCurriculum = [
      {
        title: 'Bioenergetics & Respiration',
        description: 'Comprehensive energetics',
        hours_estimated: 3,
        topics: [
          {
            title: 'Glycolysis Pathway',
            description: '10 enzymatic steps',
            matched_previous_topic: 'Glycolysis',
            coverage_delta: 'identical' as const
          },
          {
            title: 'Krebs Cycle & Citric Acid',
            description: 'Mitochondrial matrix reactions',
            matched_previous_topic: 'Krebs Cycle',
            coverage_delta: 'deepened' as const
          },
          {
            title: 'Regulation of PFK-1',
            description: 'Allosteric modulation',
            matched_previous_topic: null,
            coverage_delta: 'new_prerequisite' as const
          }
        ]
      },
      {
        title: 'Photosynthesis',
        description: 'Plant energetics',
        hours_estimated: 2,
        topics: [
          {
            title: 'Light Reactions',
            description: 'Photophosphorylation',
            matched_previous_topic: null,
            coverage_delta: 'new_topic' as const
          }
        ]
      }
    ]

    const result = reconcileCurriculum(db, subjectId, newCurriculum, userId)

    // Verify reconciliation counts
    expect(result.preserved_completed_count).toBe(1)
    expect(result.updated_topic_count).toBe(1)
    expect(result.gap_topic_count).toBe(2) // 1 in mod1 + 1 in mod2

    // 3. Verify topic1A ID was preserved in-place:
    const updatedTopic1A = db.prepare('SELECT * FROM module_topics WHERE id = ?').get(topic1A) as any
    expect(updatedTopic1A).toBeDefined()
    expect(updatedTopic1A.title).toBe('Glycolysis Pathway')
    expect(updatedTopic1A.has_new_material).toBe(0)
    expect(updatedTopic1A.is_gap).toBe(0)

    // Verify study log was NOT wiped or cascade-deleted
    const studyLog = db.prepare('SELECT * FROM module_topic_study_log WHERE topic_id = ? AND user_id = ?').get(topic1A, userId) as any
    expect(studyLog).toBeDefined()
    expect(studyLog.studied_at).toBe('2026-09-01T10:00:00.000Z')

    // Verify practice problem link was NOT severed
    const problem = db.prepare('SELECT topic_id FROM practice_problems WHERE id = ?').get(problemId) as any
    expect(problem.topic_id).toBe(topic1A)

    // Verify card link was NOT severed
    const card = db.prepare('SELECT topic_id FROM cards WHERE id = ?').get(cardId) as any
    expect(card.topic_id).toBe(topic1A)

    // 4. Verify Topic 1B (Krebs Cycle) has new material flag
    const updatedTopic1B = db.prepare('SELECT * FROM module_topics WHERE id = ?').get(topic1B) as any
    expect(updatedTopic1B).toBeDefined()
    expect(updatedTopic1B.title).toBe('Krebs Cycle & Citric Acid')
    expect(updatedTopic1B.has_new_material).toBe(1)
    expect(updatedTopic1B.is_gap).toBe(0)

    // 5. Verify newly added topics have is_gap = 1
    const pfkTopic = db.prepare('SELECT * FROM module_topics WHERE title = ?').get('Regulation of PFK-1') as any
    expect(pfkTopic).toBeDefined()
    expect(pfkTopic.is_gap).toBe(1)
    expect(pfkTopic.has_new_material).toBe(0)

    const lightTopic = db.prepare('SELECT * FROM module_topics WHERE title = ?').get('Light Reactions') as any
    expect(lightTopic).toBeDefined()
    expect(lightTopic.is_gap).toBe(1)

    // 6. Verify module statuses:
    // Module 1 now has 3 topics: 1 completed (Glycolysis), 2 pending (Krebs, PFK-1) -> status is in_progress
    const mod1After = db.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(mod1Id) as any
    expect(mod1After.status).toBe('in_progress')
  })

  it('keeps module marked as completed when all reconciled topics were previously completed', () => {
    // Setup Module 1 with 2 topics, both completed
    const modId = insert(db, `
      INSERT INTO syllabus_modules (subject_id, title, status, sort_order)
      VALUES (?, ?, ?, ?)
    `, subjectId, 'Calculus Basics', 'completed', 0)

    const top1 = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', modId, 'Limits', 0)
    const top2 = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', modId, 'Derivatives', 1)

    insert(db, 'INSERT INTO module_topic_study_log (topic_id, user_id) VALUES (?, ?)', top1, userId)
    insert(db, 'INSERT INTO module_topic_study_log (topic_id, user_id) VALUES (?, ?)', top2, userId)

    // Reconcile with reorganized curriculum covering the same 2 topics
    const newCurriculum = [
      {
        title: 'Differential Calculus',
        hours_estimated: 2,
        topics: [
          { title: 'Limits and Continuity', matched_previous_topic: 'Limits', coverage_delta: 'identical' as const },
          { title: 'Derivatives and Rules', matched_previous_topic: 'Derivatives', coverage_delta: 'identical' as const }
        ]
      }
    ]

    reconcileCurriculum(db, subjectId, newCurriculum, userId)

    const modAfter = db.prepare('SELECT status FROM syllabus_modules WHERE subject_id = ?').get(subjectId) as any
    expect(modAfter.status).toBe('completed')
  })
})
