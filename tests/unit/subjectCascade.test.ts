/**
 * Subject (topic) cascade-delete regression tests.
 *
 * The production DB runs under better-sqlite3 in Electron main, which cannot be
 * loaded in Jest. As in dbSchema.test.ts, these tests exercise the real schema
 * against Node's built-in `node:sqlite` (DatabaseSync) with `foreign_keys = ON`,
 * so any missing/out-of-order delete in `deleteSubjectCascade` surfaces as a
 * "FOREIGN KEY constraint failed" error.
 *
 * The guard test at the bottom is the "never happens again" protection: it
 * enumerates every NO-ACTION foreign key to subjects/cards/materials in the
 * schema and asserts the cascade helper covers exactly that set.
 */
import {
  DB_SCHEMA,
  MIGRATIONS_SQL,
  deleteSubjectCascade,
  SUBJECT_CASCADE_COVERED_TABLES
} from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createFreshDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  // Replicate electron/main.ts initDatabase() migration order.
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

/** Insert one row and return its lastInsertRowid. */
function insert(db: any, sql: string, ...params: unknown[]): number {
  const result = db.prepare(sql).run(...params)
  return Number(result.lastInsertRowid)
}

/** Seed a subject plus rows in every table that references it (directly or
 * transitively). Mirrors the FK graph that the cascade must clean. */
function seedSubjectWithEverything(db: any): number {
  const userId = insert(db, 'INSERT INTO users (name, created_at) VALUES (?, ?)', 'Alice', '2026-01-01T00:00:00Z')
  const subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Economics', 'archived')

  // Materials + embeddings (embeddings → materials)
  const materialId = insert(db, 'INSERT INTO materials (subject_id, filename, file_type) VALUES (?, ?, ?)', subjectId, 'notes.pdf', 'pdf')
  insert(db, 'INSERT INTO embeddings (material_id, chunk_index, chunk_text) VALUES (?, ?, ?)', materialId, 0, 'chunk')

  // Folders + notes (cards → both)
  const folderId = insert(db, 'INSERT INTO card_folders (subject_id, name) VALUES (?, ?)', subjectId, 'Ch1')
  const noteId = insert(db, 'INSERT INTO card_notes (subject_id, note_type) VALUES (?, ?)', subjectId, 'basic')

  // Cards (→ materials, folders, notes, subjects)
  const cardId = insert(
    db,
    'INSERT INTO cards (subject_id, material_id, type, front, back, folder_id, note_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    subjectId, materialId, 'flashcard', 'Q', 'A', folderId, noteId
  )

  // Card children (→ cards)
  insert(db, 'INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date) VALUES (?, ?, ?, ?, ?, ?)', cardId, userId, 1, 0, 2.5, '2026-01-01')
  insert(db, 'INSERT INTO review_log (card_id, user_id, quality, was_correct) VALUES (?, ?, ?, ?)', cardId, userId, 5, 1)
  insert(db, 'INSERT INTO mc_review_log (card_id, user_id, was_correct) VALUES (?, ?, ?)', cardId, userId, 1)
  insert(db, 'INSERT INTO review_undo_log (user_id, card_id, previous_schedule_json) VALUES (?, ?, ?)', userId, cardId, '{}')

  // Subject-scoped tables (→ subjects)
  insert(db, 'INSERT INTO deadlines (subject_id, label, deadline_date) VALUES (?, ?, ?)', subjectId, 'Exam', '2026-05-01')
  insert(db, 'INSERT INTO diagnostics (subject_id, user_id, summary_json) VALUES (?, ?, ?)', subjectId, userId, '{}')
  insert(db, 'INSERT INTO concept_mastery (user_id, subject_id, concept) VALUES (?, ?, ?)', userId, subjectId, 'General')
  insert(db, 'INSERT INTO published_decks (subject_id, user_id, public_slug, title, card_count) VALUES (?, ?, ?, ?, ?)', subjectId, userId, 'economics-1', 'Economics', 1)

  // Study group membership (study_group_subjects → subjects + study_groups)
  const groupId = insert(db, 'INSERT INTO study_groups (name, created_by) VALUES (?, ?)', 'Study Group', userId)
  insert(db, 'INSERT INTO study_group_subjects (group_id, subject_id) VALUES (?, ?)', groupId, subjectId)

  // CASCADE tables — auto-cleaned when the subject row is deleted.
  insert(db, 'INSERT INTO conversations (subject_id, title) VALUES (?, ?)', subjectId, 'Chat')
  insert(db, 'INSERT INTO syllabus_modules (subject_id, title) VALUES (?, ?)', subjectId, 'Module 1')
  insert(db, 'INSERT INTO daily_plans (user_id, plan_date, subject_id, suggested_action) VALUES (?, ?, ?, ?)', userId, '2026-01-01', subjectId, 'Review flashcards')

  return subjectId
}

describe('deleteSubjectCascade', () => {
  it('deletes a subject with rows in every dependent table without FK errors', () => {
    const db = createFreshDatabase()
    const subjectId = seedSubjectWithEverything(db)

    // The bug: before concept_mastery was covered, this threw
    // "FOREIGN KEY constraint failed" and left the subject in place.
    expect(() => deleteSubjectCascade(db, subjectId)).not.toThrow()

    expect(db.prepare('SELECT COUNT(*) AS c FROM subjects WHERE id = ?').get(subjectId).c).toBe(0)

    // Every table cleaned by the cascade must now be empty of this subject.
    for (const table of SUBJECT_CASCADE_COVERED_TABLES) {
      const col = table === 'embeddings' ? 'material_id' : ['card_schedule', 'review_log', 'mc_review_log', 'review_undo_log'].includes(table) ? 'card_id' : 'subject_id'
      const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = ?`).get(subjectId).c
      expect(count).toBe(0)
    }

    // CASCADE tables are removed automatically by SQLite.
    expect(db.prepare('SELECT COUNT(*) AS c FROM conversations WHERE subject_id = ?').get(subjectId).c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM syllabus_modules WHERE subject_id = ?').get(subjectId).c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM daily_plans WHERE subject_id = ?').get(subjectId).c).toBe(0)

    db.close()
  })

  it('deletes a subject that has only a concept_mastery row (the reported bug)', () => {
    const db = createFreshDatabase()
    const userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Bob')
    const subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)', userId, 'Economics Understanding the Wider Economy', 'archived')
    insert(db, 'INSERT INTO concept_mastery (user_id, subject_id, concept) VALUES (?, ?, ?)', userId, subjectId, 'General')

    expect(() => deleteSubjectCascade(db, subjectId)).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS c FROM subjects WHERE id = ?').get(subjectId).c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM concept_mastery WHERE subject_id = ?').get(subjectId).c).toBe(0)
    db.close()
  })
})

describe('subject cascade covers every NO-ACTION foreign key', () => {
  it('SUBJECT_CASCADE_COVERED_TABLES matches the schema FK graph', () => {
    const db = createFreshDatabase()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    const referencing = new Set<string>()
    for (const { name } of tables) {
      const fks = db.prepare(`PRAGMA foreign_key_list(${name})`).all() as Array<{ table: string; on_delete: string }>
      for (const fk of fks) {
        if (
          (fk.on_delete ?? '').toUpperCase() === 'NO ACTION' &&
          ['subjects', 'cards', 'materials'].includes(fk.table)
        ) {
          referencing.add(name)
        }
      }
    }

    const covered = new Set(SUBJECT_CASCADE_COVERED_TABLES)
    expect([...referencing].sort()).toEqual([...covered].sort())
    db.close()
  })
})
