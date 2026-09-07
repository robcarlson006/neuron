import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createTestDb(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  for (const m of MIGRATIONS_SQL) {
    try { db.exec(m) } catch { /* already applied */ }
  }

  return db
}

describe('Topic Mastery & Task Dismissal Persistence', () => {
  let db: any

  beforeEach(() => {
    db = createTestDb()

    // Insert dummy user and subject
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(1, 'Rob')
    db.prepare('INSERT INTO subjects (id, user_id, name) VALUES (?, ?, ?)').run(10, 1, 'Economics Understanding the Wider Economy')
    db.prepare('INSERT INTO subjects (id, user_id, name) VALUES (?, ?, ?)').run(20, 1, 'NBA CBA Study')
  })

  afterEach(() => {
    db.close()
  })

  test('daily_plans table has is_dismissed column and defaults to 0', () => {
    db.prepare(`
      INSERT INTO daily_plans (user_id, plan_date, subject_id, suggested_action, is_completed)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, '2026-09-07', 10, 'Review AD curve shifts', 0)

    const plan = db.prepare('SELECT * FROM daily_plans WHERE id = 1').get() as any
    expect(plan).toBeDefined()
    expect(plan.is_dismissed).toBe(0)
    expect(plan.is_completed).toBe(0)
  })

  test('dismissing completed plan sets is_dismissed = 1 and preserves is_completed = 1 for stats', () => {
    // Insert 2 plans, complete both
    db.prepare(`
      INSERT INTO daily_plans (id, user_id, plan_date, subject_id, suggested_action, is_completed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 1, '2026-09-07', 10, 'Review AD curve shifts', 1)

    db.prepare(`
      INSERT INTO daily_plans (id, user_id, plan_date, subject_id, suggested_action, is_completed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(2, 1, '2026-09-07', 10, 'Macroeconomics Flashcards', 1)

    // Dismiss plan 1
    db.prepare('UPDATE daily_plans SET is_dismissed = 1 WHERE id = ?').run(1)

    // Active plans query excludes dismissed
    const activePlans = db.prepare(`
      SELECT * FROM daily_plans
      WHERE user_id = ? AND plan_date = ? AND (is_dismissed = 0 OR is_dismissed IS NULL)
    `).all(1, '2026-09-07')
    expect(activePlans.length).toBe(1)
    expect((activePlans[0] as any).id).toBe(2)

    // Analytics completed count still counts both completed plans
    const completedCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM daily_plans WHERE user_id = ? AND is_completed = 1
    `).get(1) as { count: number }
    expect(completedCountRow.count).toBe(2)
  })

  test('subject mastery 1-100 score calculations accurately aggregate topic masteries', () => {
    // Subject 10 has 3 concepts
    db.prepare(`
      INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 10, 'AD Curve', 0.90, 5)

    db.prepare(`
      INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 10, 'Fiscal Multipliers', 0.80, 4)

    db.prepare(`
      INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 10, 'Monetary Transmission', 0.70, 3)

    const concepts = db.prepare('SELECT * FROM concept_mastery WHERE user_id = ? AND subject_id = ?').all(1, 10) as any[]
    const topicScores = concepts.map(c => Math.round(c.mastery_prob * 100))
    expect(topicScores).toEqual([90, 80, 70])

    const avgSubjectScore = Math.round(topicScores.reduce((a: number, b: number) => a + b, 0) / topicScores.length)
    expect(avgSubjectScore).toBe(80)
    expect(avgSubjectScore).toBeGreaterThanOrEqual(1)
    expect(avgSubjectScore).toBeLessThanOrEqual(100)
  })
})
