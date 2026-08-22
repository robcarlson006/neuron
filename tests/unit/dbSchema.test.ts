/**
 * Real SQLite schema/migration integrity tests.
 *
 * The production database is opened with `better-sqlite3` in the Electron main
 * process (built against Electron's ABI), so it cannot be loaded in Jest.
 * These tests exercise the same schema + migration sequence against Node 24's
 * built-in `node:sqlite` (DatabaseSync), which is ABI-independent, to verify
 * that a fresh database is created correctly and basic CRUD works.
 */
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createFreshDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  // Replicate electron/main.ts initDatabase() migration order.
  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
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
    try { db.exec(migration) } catch { /* already applied */ }
  }
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* column may already exist */ }
  }

  return db
}

function tableNames(db: any): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r: { name: string }) => r.name)
}

describe('Database schema (real SQLite)', () => {
  it('creates all core tables without error', () => {
    const db = createFreshDatabase()
    const tables = tableNames(db)
    for (const expected of ['users', 'subjects', 'materials', 'cards', 'card_schedule', 'review_log', 'card_folders', 'concept_mastery']) {
      expect(tables).toContain(expected)
    }
    db.close()
  })

  it('creates the review_daily view and it is queryable', () => {
    const db = createFreshDatabase()
    const rows = db.prepare('SELECT date, reviews, correct, incorrect, avg_response_ms FROM review_daily').all()
    expect(Array.isArray(rows)).toBe(true)
    db.close()
  })

  it('cards.folder_id references card_folders (not a nonexistent table)', () => {
    const db = createFreshDatabase()
    const fk = db.prepare('PRAGMA foreign_key_list(cards)').all() as Array<{ table: string }>
    expect(fk.some((f) => f.table === 'folders')).toBe(false)
    expect(fk.some((f) => f.table === 'card_folders')).toBe(true)
    db.close()
  })

  it('supports inserting a user, subject, card, schedule, and review', () => {
    const db = createFreshDatabase()
    const user = db.prepare("INSERT INTO users (name, created_at) VALUES (?, ?)").run('Alice', '2026-01-01T00:00:00Z')
    const userId = user.lastInsertRowid

    const subject = db.prepare("INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)").run(userId, 'History', 'active')
    const subjectId = subject.lastInsertRowid

    const card = db.prepare("INSERT INTO cards (subject_id, type, front, back) VALUES (?, ?, ?, ?)").run(subjectId, 'flashcard', 'Q', 'A')
    const cardId = card.lastInsertRowid

    db.prepare('INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cardId, userId, 1, 0, 2.5, '2026-01-01')

    db.prepare('INSERT INTO review_log (card_id, user_id, quality, was_correct) VALUES (?, ?, ?, ?)')
      .run(cardId, userId, 5, 1)

    const count = db.prepare('SELECT COUNT(*) AS c FROM cards').get() as { c: number }
    expect(count.c).toBe(1)

    const due = db.prepare('SELECT COUNT(*) AS c FROM cards c JOIN card_schedule cs ON cs.card_id = c.id WHERE cs.due_date <= ?').get('2026-01-01') as { c: number }
    expect(due.c).toBe(1)
    db.close()
  })

  it('assigns a card to a folder successfully (foreign_keys ON)', () => {
    const db = createFreshDatabase()
    const user = db.prepare('INSERT INTO users (name) VALUES (?)').run('Bob')
    const userId = user.lastInsertRowid
    const subject = db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(userId, 'Bio', 'active')
    const subjectId = subject.lastInsertRowid
    const folder = db.prepare('INSERT INTO card_folders (subject_id, name) VALUES (?, ?)').run(subjectId, 'Ch1')
    const folderId = folder.lastInsertRowid
    const card = db.prepare('INSERT INTO cards (subject_id, type, front, back, folder_id) VALUES (?, ?, ?, ?, ?)').run(subjectId, 'flashcard', 'Q', 'A', folderId)
    const cardId = card.lastInsertRowid

    const row = db.prepare('SELECT folder_id FROM cards WHERE id = ?').get(cardId) as { folder_id: number }
    expect(row.folder_id).toBe(folderId)
    db.close()
  })

  it('materials gains syllabus_processed and module_id via migrations (default unprocessed)', () => {
    const db = createFreshDatabase()
    const user = db.prepare('INSERT INTO users (name) VALUES (?)').run('Carol')
    const userId = user.lastInsertRowid
    const subject = db.prepare(
      'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)'
    ).run(userId, 'Physics', 'active')
    const subjectId = subject.lastInsertRowid
    db.prepare(
      'INSERT INTO materials (subject_id, filename, file_type, content_text) VALUES (?, ?, ?, ?)'
    ).run(subjectId, 'ch1.pdf', 'pdf', 'Newton laws...')

    const mat = db.prepare(
      'SELECT syllabus_processed, module_id FROM materials WHERE subject_id = ?'
    ).get(subjectId) as { syllabus_processed: number; module_id: number | null }

    expect(mat.syllabus_processed).toBe(0)
    expect(mat.module_id).toBeNull()
    db.close()
  })
})
