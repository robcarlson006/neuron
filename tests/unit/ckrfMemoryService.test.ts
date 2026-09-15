import { DB_SCHEMA } from '../../src/lib/db'
import {
  getDecayedTopicRating,
  recordTopicAssessment,
  recordMisconception,
  recordConceptSuccess,
  recordEpisodicMemory,
  buildCKRFMemoryBlock
} from '../../src/lib/memory/ckrfMemoryService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function setupTestDb(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  // Seed user and subject
  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
  db.prepare("INSERT INTO subjects (id, user_id, name) VALUES (1, 1, 'Macroeconomics')").run()

  return db
}

describe('CKRF Memory Service', () => {
  let db: any

  beforeEach(() => {
    db = setupTestDb()
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('initializes default Glicko-2 rating profile for an unstudied topic', () => {
    const res = getDecayedTopicRating(db, 1, 1, 'Monetary Policy')
    expect(res.isNew).toBe(true)
    expect(res.profile.rating).toBe(1500)
    expect(res.profile.ratingDeviation).toBe(350)
    expect(res.band).toBe('Competent')
  })

  it('records an assessment outcome and persists Glicko-2 rating', () => {
    const profile = recordTopicAssessment(db, 1, 1, 'Monetary Policy', {
      itemDifficulty: 3,
      score: 1.0
    })

    expect(profile.rating).toBeGreaterThan(1500)
    expect(profile.ratingDeviation).toBeLessThan(350)

    // Second check: reading back from DB returns the updated rating
    const saved = getDecayedTopicRating(db, 1, 1, 'Monetary Policy')
    expect(saved.isNew).toBe(false)
    expect(saved.profile.rating).toBe(profile.rating)
    expect(saved.observationsCount).toBe(1)
  })

  it('tracks misconceptions through active -> inoculating -> resolved lifecycle', () => {
    // 1. Record misconception
    recordMisconception(db, 1, 1, {
      concept: 'Open Market Operations',
      misconceptionKey: 'omo_bond_price_inversion',
      misconceptionTitle: 'Inverted bond purchase effect',
      description: 'Student thought buying bonds decreases the money supply'
    })

    const row1 = db.prepare(`
      SELECT * FROM student_misconceptions WHERE misconception_key = 'omo_bond_price_inversion'
    `).get()
    expect(row1.remediation_status).toBe('active')
    expect(row1.occurrence_count).toBe(1)
    expect(row1.consecutive_successes).toBe(0)

    // 2. First success -> status becomes 'inoculating'
    recordConceptSuccess(db, 1, 1, 'Open Market Operations')
    const row2 = db.prepare(`
      SELECT * FROM student_misconceptions WHERE misconception_key = 'omo_bond_price_inversion'
    `).get()
    expect(row2.remediation_status).toBe('inoculating')
    expect(row2.consecutive_successes).toBe(1)

    // 3. Second success -> remains inoculating
    recordConceptSuccess(db, 1, 1, 'Open Market Operations')
    const row3 = db.prepare(`
      SELECT * FROM student_misconceptions WHERE misconception_key = 'omo_bond_price_inversion'
    `).get()
    expect(row3.consecutive_successes).toBe(2)
    expect(row3.remediation_status).toBe('inoculating')

    // 4. Third success -> transitions to 'resolved'
    recordConceptSuccess(db, 1, 1, 'Open Market Operations')
    const row4 = db.prepare(`
      SELECT * FROM student_misconceptions WHERE misconception_key = 'omo_bond_price_inversion'
    `).get()
    expect(row4.consecutive_successes).toBe(3)
    expect(row4.remediation_status).toBe('resolved')
    expect(row4.resolved_at).not.toBeNull()
  })

  it('persists and retrieves episodic learning memories', () => {
    recordEpisodicMemory(db, {
      userId: 1,
      subjectId: 1,
      topic: 'Reserve Requirements',
      memoryType: 'breakthrough',
      importanceScore: 9,
      summary: 'Student understood fractional reserve banking using the bucket analogy',
      effectiveIntervention: 'Bucket water flow analogy'
    })

    const saved = db.prepare(`
      SELECT * FROM episodic_learning_memories WHERE topic = 'Reserve Requirements'
    `).get()

    expect(saved).toBeDefined()
    expect(saved.memory_type).toBe('breakthrough')
    expect(saved.importance_score).toBe(9)
    expect(saved.effective_intervention).toBe('Bucket water flow analogy')
  })

  it('builds a rich CKRF prompt context block for the Socratic Tutor', () => {
    // Seed a rating
    recordTopicAssessment(db, 1, 1, 'Inflation', {
      itemDifficulty: 4,
      score: 1.0
    })

    // Seed an active misconception
    recordMisconception(db, 1, 1, {
      concept: 'Inflation',
      misconceptionKey: 'inflation_nominal_real',
      misconceptionTitle: 'Confused real vs nominal rates',
      description: 'Forgot to subtract inflation from nominal interest rate'
    })

    // Seed an episodic memory
    recordEpisodicMemory(db, {
      userId: 1,
      subjectId: 1,
      topic: 'Inflation',
      memoryType: 'analogy',
      importanceScore: 8,
      summary: 'Understood purchasing power erosion via grocery cart price changes',
      effectiveIntervention: 'Fixed grocery basket example'
    })

    const block = buildCKRFMemoryBlock(db, 1, 1)

    expect(block).toContain('COGNITIVE KNOWLEDGE & PSYCHOMETRIC RATINGS (GLICKO-2):')
    expect(block).toContain('Inflation: Rating')
    expect(block).toContain('ACTIVE DIAGNOSTIC MISCONCEPTIONS & INOCULATION LEDGER:')
    expect(block).toContain('Confused real vs nominal rates')
    expect(block).toContain('EPISODIC LEARNING MEMORY')
    expect(block).toContain('Fixed grocery basket example')
  })
})
