/**
 * Database schema definitions - used by the main process
 * The renderer process never imports better-sqlite3 directly
 */

export const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ongoing', 'archived')),
    course_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content_text TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    material_id INTEGER,
    type TEXT NOT NULL CHECK (type IN ('flashcard', 'active_recall')),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    folder_id INTEGER,
    concept TEXT,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (material_id) REFERENCES materials(id),
    FOREIGN KEY (folder_id) REFERENCES card_folders(id)
  );

  CREATE TABLE IF NOT EXISTS card_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    repetitions INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    due_date TEXT NOT NULL,
    last_reviewed_at TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    quality INTEGER NOT NULL,
    was_correct INTEGER NOT NULL DEFAULT 0,
    user_answer TEXT,
    ai_feedback TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    deadline_date TEXT NOT NULL,
    deadline_type TEXT NOT NULL DEFAULT 'personal',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS diagnostics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ran_at TEXT NOT NULL DEFAULT (datetime('now')),
    summary_json TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mc_review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    was_correct INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (card_id) REFERENCES cards(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS card_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS concept_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    concept TEXT NOT NULL,
    mastery_prob REAL NOT NULL DEFAULT 0.3,
    observations INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, subject_id, concept),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE VIEW IF NOT EXISTS review_daily AS
    SELECT
      user_id,
      DATE(reviewed_at) AS date,
      COUNT(*) AS reviews,
      SUM(was_correct) AS correct,
      COUNT(*) - SUM(was_correct) AS incorrect,
      AVG(response_time_ms) AS avg_response_ms
    FROM review_log
    GROUP BY user_id, DATE(reviewed_at);

  CREATE TABLE IF NOT EXISTS card_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'basic' CHECK (note_type IN ('basic', 'cloze')),
    fields_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_levels (
    user_id INTEGER PRIMARY KEY,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS daily_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quest_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    progress INTEGER NOT NULL DEFAULT 0,
    xp_reward INTEGER NOT NULL DEFAULT 50,
    completed INTEGER NOT NULL DEFAULT 0,
    quest_date TEXT NOT NULL,
    UNIQUE(user_id, quest_key, quest_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS review_undo_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_id INTEGER NOT NULL,
    review_log_id INTEGER,
    previous_schedule_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (card_id) REFERENCES cards(id)
  );

  CREATE TABLE IF NOT EXISTS export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    export_type TEXT NOT NULL CHECK (export_type IN ('json', 'csv', 'apkg')),
    file_name TEXT NOT NULL,
    exported_at TEXT NOT NULL DEFAULT (datetime('now')),
    stats_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS import_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    import_type TEXT NOT NULL CHECK (import_type IN ('json', 'csv', 'apkg', 'anki_csv')),
    file_name TEXT,
    cards_imported INTEGER NOT NULL DEFAULT 0,
    source_name TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    focus_mode INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS published_decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    public_slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    card_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 0.0,
    is_published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS study_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    invite_code TEXT UNIQUE,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS study_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS study_group_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    UNIQUE(group_id, subject_id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS plugin_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    endpoint_type TEXT NOT NULL CHECK (endpoint_type IN ('mcp', 'http', 'anki_connect')),
    config_json TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS focus_mode_settings (
    user_id INTEGER PRIMARY KEY,
    focus_minutes INTEGER NOT NULL DEFAULT 25,
    break_minutes INTEGER NOT NULL DEFAULT 5,
    block_notifications INTEGER NOT NULL DEFAULT 1,
    show_fullscreen INTEGER NOT NULL DEFAULT 0,
    auto_start_break INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding BLOB,
    model TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (material_id) REFERENCES materials(id)
  );
  CREATE INDEX IF NOT EXISTS idx_embeddings_material ON embeddings(material_id);

  -- AI Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    model TEXT NOT NULL DEFAULT 'deepseek-chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text', 'diagram', 'code')),
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_subject ON conversations(subject_id);

  -- Syllabus / AI Tutor tables
  CREATE TABLE IF NOT EXISTS syllabus_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    week_number INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
    hours_estimated REAL DEFAULT 1.0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS module_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    mastery_target REAL DEFAULT 0.8,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (module_id) REFERENCES syllabus_modules(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS module_topic_study_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    studied_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (topic_id, user_id),
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tutor_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    user_id INTEGER,
    session_type TEXT NOT NULL DEFAULT 'tutor' CHECK(session_type IN ('tutor','general','quiz')),
    phase TEXT NOT NULL DEFAULT 'structured_qa' CHECK(phase IN ('structured_qa','socratic','summary','complete')),
    module_id INTEGER,
    summary TEXT,
    cards_generated INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS daily_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_date TEXT NOT NULL,
    subject_id INTEGER NOT NULL,
    module_id INTEGER,
    suggested_action TEXT NOT NULL,
    estimated_minutes INTEGER DEFAULT 30,
    priority INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tutor_topic_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    mastery_level TEXT NOT NULL DEFAULT 'developing' CHECK(mastery_level IN ('struggling', 'developing', 'good', 'mastered')),
    strengths TEXT,
    struggles TEXT,
    session_id INTEGER,
    last_studied_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, subject_id, topic),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tutor_session_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    strengths_json TEXT NOT NULL DEFAULT '[]',
    struggles_json TEXT NOT NULL DEFAULT '[]',
    topics_covered_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
`

export const MIGRATIONS_SQL = [
  "ALTER TABLE cards ADD COLUMN note_id INTEGER REFERENCES card_notes(id)",
  "ALTER TABLE cards ADD COLUMN cloze_ordinal INTEGER DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN tags TEXT DEFAULT ''",
  "ALTER TABLE cards ADD COLUMN image_url TEXT DEFAULT ''",
  "ALTER TABLE cards ADD COLUMN media_json TEXT DEFAULT '{}'",
  "ALTER TABLE cards ADD COLUMN source TEXT DEFAULT ''",
  "ALTER TABLE card_schedule ADD COLUMN last_quality INTEGER",
  "ALTER TABLE card_schedule ADD COLUMN last_review_json TEXT",
  "ALTER TABLE review_log ADD COLUMN response_time_ms INTEGER",
  "ALTER TABLE tutor_sessions ADD COLUMN duration_minutes INTEGER",
  "ALTER TABLE tutor_sessions ADD COLUMN depth_level INTEGER DEFAULT 3",
  "ALTER TABLE tutor_sessions ADD COLUMN never_studied INTEGER DEFAULT 0",
  "ALTER TABLE materials ADD COLUMN file_size INTEGER",
  "ALTER TABLE materials ADD COLUMN file_path TEXT",
  "ALTER TABLE materials ADD COLUMN tags TEXT DEFAULT ''",
  "ALTER TABLE subjects ADD COLUMN time_commitment_minutes INTEGER DEFAULT 60",
  // V3: Class metadata
  "ALTER TABLE subjects ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'class' CHECK(subject_type IN ('class', 'book'))",
  "ALTER TABLE subjects ADD COLUMN total_pages INTEGER",
  "ALTER TABLE subjects ADD COLUMN total_chapters INTEGER",
  "ALTER TABLE subjects ADD COLUMN syllabus_generated INTEGER NOT NULL DEFAULT 0",
  // V3: Extended syllabus fields
  "ALTER TABLE syllabus_modules ADD COLUMN chapter_number INTEGER",
  "ALTER TABLE syllabus_modules ADD COLUMN chapter_title TEXT",
  "ALTER TABLE syllabus_modules ADD COLUMN page_start INTEGER",
  "ALTER TABLE syllabus_modules ADD COLUMN page_end INTEGER",
  "ALTER TABLE syllabus_modules ADD COLUMN prerequisites TEXT",
  // V3: Material-module association
  "ALTER TABLE materials ADD COLUMN module_id INTEGER REFERENCES syllabus_modules(id)",
  "ALTER TABLE cards ADD COLUMN topic_id INTEGER",
  // V3: Incremental syllabus tracking — marks materials already folded into
  // the syllabus so updateFromMaterials only processes newly added ones.
  "ALTER TABLE materials ADD COLUMN syllabus_processed INTEGER NOT NULL DEFAULT 0",
  // V3.2: AI Tutor memory tables
  `CREATE TABLE IF NOT EXISTS tutor_topic_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    mastery_level TEXT NOT NULL DEFAULT 'developing' CHECK(mastery_level IN ('struggling', 'developing', 'good', 'mastered')),
    strengths TEXT,
    struggles TEXT,
    session_id INTEGER,
    last_studied_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, subject_id, topic),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tutor_session_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    strengths_json TEXT NOT NULL DEFAULT '[]',
    struggles_json TEXT NOT NULL DEFAULT '[]',
    topics_covered_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
]

export const MASTERED_INTERVAL = 21

/**
 * Subject (topic) cascade-delete support.
 *
 * `subjects` is referenced by many tables via foreign keys, most of which have
 * NO ACTION (no ON DELETE CASCADE). Deleting a subject therefore requires
 * deleting its dependent rows first, in dependency order, or SQLite aborts with
 * "FOREIGN KEY constraint failed" (because main.ts enables `foreign_keys = ON`).
 *
 * The bug this fixes: `deleteSubjectCascade` used to hand-list the tables to
 * clean, and a newly added table (e.g. `concept_mastery` in v1.8.0) was left
 * out, which silently broke deletion for every subject that had rows in it.
 * The table lists below are the single source of truth — the guard test in
 * `tests/unit/subjectCascade.test.ts` fails if a new NO-ACTION foreign key to
 * subjects/cards/materials is introduced without appearing here.
 */

/** Minimal database surface needed by `deleteSubjectCascade`. Satisfied by both
 * better-sqlite3 (Electron main process) and node:sqlite (Jest tests). */
export interface CascadeDB {
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}

/** Tables keyed by `card_id` that reference `cards(id)` with NO ACTION. Must be
 * removed before their cards. */
export const CARD_CHILD_TABLES = [
  'card_schedule',
  'review_log',
  'mc_review_log',
  'review_undo_log'
] as const

/** Tables keyed by `subject_id` that reference `subjects(id)` with NO ACTION,
 * excluding `cards` and `materials` which are deleted explicitly in dependency
 * order above (cards also reference card_folders/card_notes/materials, and
 * `embeddings` reference materials). */
export const SUBJECT_CHILD_TABLES = [
  'card_folders',
  'card_notes',
  'deadlines',
  'diagnostics',
  'concept_mastery',
  'published_decks',
  'study_group_subjects'
] as const

/** Every table `deleteSubjectCascade` removes rows from. Compared against the
 * live schema's NO-ACTION foreign keys by the guard test. */
export const SUBJECT_CASCADE_COVERED_TABLES: readonly string[] = [
  'cards',
  'materials',
  'embeddings',
  ...CARD_CHILD_TABLES,
  ...SUBJECT_CHILD_TABLES
]

/** Delete a subject and every row that transitively references it, leaf-first.
 * Tables with ON DELETE CASCADE (conversations, syllabus_modules, daily_plans,
 * tutor_sessions) are removed automatically when the subject row goes. */
export function deleteSubjectCascade(db: CascadeDB, subjectId: number): void {
  // 1. Rows keyed by the subject's cards, removed before the cards themselves.
  const cards = db.prepare('SELECT id FROM cards WHERE subject_id = ?').all(subjectId) as {
    id: number
  }[]
  const cardIds = cards.map((c) => c.id)
  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',')
    for (const table of CARD_CHILD_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE card_id IN (${placeholders})`).run(...cardIds)
    }
  }

  // 2. Cards — before card_folders / card_notes / materials they reference.
  db.prepare('DELETE FROM cards WHERE subject_id = ?').run(subjectId)

  // 3. Embeddings reference materials — remove before materials.
  db.prepare(
    'DELETE FROM embeddings WHERE material_id IN (SELECT id FROM materials WHERE subject_id = ?)'
  ).run(subjectId)

  // 4. Materials.
  db.prepare('DELETE FROM materials WHERE subject_id = ?').run(subjectId)

  // 5. Remaining subject-scoped tables.
  for (const table of SUBJECT_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE subject_id = ?`).run(subjectId)
  }

  // 6. The subject itself.
  db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId)
}
