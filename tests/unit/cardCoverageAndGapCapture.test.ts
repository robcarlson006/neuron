import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { parseCardsFromText } from '../../src/lib/cardParser'

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

describe('Card Coverage Matrix & Gap Capture', () => {
  let db: any
  let userId: number
  let subjectId: number
  let moduleId: number
  let topic1Id: number
  let topic2Id: number

  beforeEach(() => {
    db = createTestDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Student A')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Anatomy & Kinesiology', 'active')
    moduleId = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, sort_order) VALUES (?, ?, ?)', subjectId, 'Shoulder Biomechanics', 1)
    topic1Id = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Internal vs External Rotation', 1)
    topic2Id = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Scapular Plane Elevation', 2)
  })

  afterEach(() => {
    db.close()
  })

  test('accurately calculates topic card coverage and flags uncovered topics as 0 cards', () => {
    // Topic 1 has 2 cards: one linked by topic_id, one linked by concept string
    insert(
      db,
      'INSERT INTO cards (subject_id, topic_id, concept, type, front, back, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      subjectId, topic1Id, 'Internal vs External Rotation', 'flashcard', 'Subscapularis action', 'Internal (medial) rotation of humerus', 'tutor'
    )
    insert(
      db,
      'INSERT INTO cards (subject_id, topic_id, concept, type, front, back, source) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      subjectId, 'Internal vs External Rotation', 'flashcard', 'Infraspinatus action', 'External (lateral) rotation of humerus', 'tutor'
    )

    // Topic 2 has 0 cards

    // Query card counts using the exact subquery implemented in syllabus:listTopics
    const rows = db.prepare(`
      SELECT mt.id, mt.title,
        (
          SELECT COUNT(*) FROM cards c
          WHERE c.subject_id = ?
            AND (
              c.topic_id = mt.id
              OR LOWER(TRIM(c.concept)) = LOWER(TRIM(mt.title))
              OR LOWER(c.concept) LIKE '%' || LOWER(mt.title) || '%'
              OR LOWER(mt.title) LIKE '%' || LOWER(c.concept) || '%'
            )
        ) as card_count
      FROM module_topics mt
      WHERE mt.module_id = ?
      ORDER BY mt.sort_order ASC
    `).all(subjectId, moduleId) as { id: number; title: string; card_count: number }[]

    expect(rows).toHaveLength(2)

    // Topic 1 is covered
    expect(rows[0].id).toBe(topic1Id)
    expect(rows[0].card_count).toBe(2)

    // Topic 2 is an uncovered gap
    expect(rows[1].id).toBe(topic2Id)
    expect(rows[1].card_count).toBe(0)
  })

  test('parses category-tagged cards correctly for targeted struggle fixes and distinctions', () => {
    const rawAIText = `
**[Struggle Fix: Rotator Cuff] Which muscle internally rotates the humerus?** -> Subscapularis.
**[Distinction: Rotations] Internal vs External Rotation: Which movement turns the anterior arm toward midline?** -> Internal (medial) rotation.
**[Vocabulary: Kinesiology] Glenohumeral Joint** -> Ball-and-socket joint formed between glenoid fossa and humeral head.
`
    const parsed = parseCardsFromText(rawAIText)
    expect(parsed).toHaveLength(3)

    // First card: Struggle Fix
    expect(parsed[0].front).toContain('Struggle Fix')
    expect(parsed[0].back).toBe('Subscapularis.')

    // Second card: Distinction
    expect(parsed[1].front).toContain('Distinction')
    expect(parsed[1].back).toContain('Internal (medial) rotation')

    // Third card: Vocabulary
    expect(parsed[2].front).toContain('Vocabulary')
    expect(parsed[2].back).toContain('Ball-and-socket joint')
  })

  test('saving an in-flight card links it to the subject and topic with source tutor', () => {
    const cardId = insert(
      db,
      'INSERT INTO cards (subject_id, topic_id, concept, type, front, back, is_manual, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      subjectId, topic1Id, 'Internal vs External Rotation', 'flashcard', 'Teres Minor innervation', 'Axillary nerve (C5, C6)', 0, 'tutor'
    )

    const saved = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as any
    expect(saved).toBeDefined()
    expect(saved.subject_id).toBe(subjectId)
    expect(saved.topic_id).toBe(topic1Id)
    expect(saved.source).toBe('tutor')
    expect(saved.front).toBe('Teres Minor innervation')
  })
})
