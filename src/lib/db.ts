/**
 * Database schema definitions - used by the main process
 * The renderer process never imports better-sqlite3 directly
 */

import type { Lecture, LectureStatus, CreateLectureParams, UpdateLectureParams } from '../types'

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
    subject_icon TEXT NOT NULL DEFAULT 'book-open',
    color TEXT DEFAULT '#8b5cf6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    linked_folder_path TEXT DEFAULT NULL,
    folder_last_synced_at TEXT DEFAULT NULL,
    folder_sync_status TEXT DEFAULT 'idle' CHECK (folder_sync_status IN ('idle', 'syncing', 'error')),
    curriculum_revision INTEGER NOT NULL DEFAULT 0,
    curriculum_schema_version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content_text TEXT,
    file_path TEXT DEFAULT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    file_mtime INTEGER DEFAULT NULL,
    file_size INTEGER DEFAULT NULL,
    file_sha256 TEXT DEFAULT NULL,
    relative_path TEXT DEFAULT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS subject_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL UNIQUE,
    body TEXT NOT NULL DEFAULT '',
    links_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS document_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    material_id INTEGER,
    lecture_id INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('highlight', 'comment', 'cue', 'question', 'summary')),
    parent_id INTEGER,
    color TEXT,
    body TEXT NOT NULL DEFAULT '',
    selected_text TEXT,
    locator_json TEXT,
    source_snapshot TEXT,
    source_hash TEXT,
    locator_status TEXT NOT NULL DEFAULT 'resolved' CHECK (locator_status IN ('resolved', 'needs_review')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    CHECK (material_id IS NOT NULL OR lecture_id IS NOT NULL),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES document_annotations(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_document_annotations_material
    ON document_annotations (material_id, deleted_at, updated_at);
  CREATE INDEX IF NOT EXISTS idx_document_annotations_lecture
    ON document_annotations (lecture_id, deleted_at, updated_at);
  CREATE INDEX IF NOT EXISTS idx_document_annotations_subject
    ON document_annotations (subject_id, deleted_at, updated_at);

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

  CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    material_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    heading_path TEXT NOT NULL DEFAULT '',
    chunk_type TEXT NOT NULL DEFAULT 'general_block',
    text TEXT NOT NULL,
    char_start INTEGER NOT NULL DEFAULT 0,
    char_end INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    previous_chunk_id TEXT,
    next_chunk_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    UNIQUE (material_id, chunk_index)
  );
  CREATE INDEX IF NOT EXISTS idx_document_chunks_material ON document_chunks(material_id, chunk_index);
  CREATE INDEX IF NOT EXISTS idx_document_chunks_hash ON document_chunks(content_hash);

  CREATE TABLE IF NOT EXISTS retrieval_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    material_id INTEGER,
    query TEXT NOT NULL,
    selected_json TEXT NOT NULL DEFAULT '[]',
    candidate_count INTEGER NOT NULL DEFAULT 0,
    retrieval_mode TEXT NOT NULL DEFAULT 'hybrid',
    index_version TEXT NOT NULL DEFAULT 'v1',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_retrieval_events_scope ON retrieval_events(subject_id, created_at DESC);

  -- AI Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    model TEXT NOT NULL DEFAULT 'deepseek-flash',
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
    has_new_material INTEGER NOT NULL DEFAULT 0,
    is_gap INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (module_id) REFERENCES syllabus_modules(id) ON DELETE CASCADE
  );

  -- Additive, source-grounded curriculum graph. Legacy syllabus tables remain
  -- the learner-facing read model during migration.
  CREATE TABLE IF NOT EXISTS curriculum_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_number INTEGER NOT NULL,
    parent_revision_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','applied','superseded','rejected')),
    source_hashes_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    applied_at TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_revision_id) REFERENCES curriculum_revisions(id) ON DELETE SET NULL,
    UNIQUE(subject_id, revision_number)
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_revisions_subject ON curriculum_revisions(subject_id, revision_number DESC);

  CREATE TABLE IF NOT EXISTS curriculum_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    chunk_id TEXT,
    content_hash TEXT NOT NULL,
    section TEXT,
    page INTEGER,
    slide INTEGER,
    start_offset INTEGER,
    end_offset INTEGER,
    quote TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_evidence_revision ON curriculum_evidence(revision_id, material_id);

  CREATE TABLE IF NOT EXISTS curriculum_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_id INTEGER NOT NULL,
    topic_id INTEGER,
    outcome_key TEXT NOT NULL,
    statement TEXT NOT NULL,
    bloom_level TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE SET NULL,
    UNIQUE(revision_id, outcome_key)
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_outcomes_revision ON curriculum_outcomes(revision_id, sort_order, id);

  CREATE TABLE IF NOT EXISTS curriculum_prerequisites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_id INTEGER NOT NULL,
    prerequisite_outcome_id INTEGER NOT NULL,
    dependent_outcome_id INTEGER NOT NULL,
    relation TEXT NOT NULL DEFAULT 'requires' CHECK(relation IN ('requires','recommended')),
    rationale TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE,
    FOREIGN KEY (dependent_outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE,
    CHECK(prerequisite_outcome_id <> dependent_outcome_id),
    UNIQUE(revision_id, prerequisite_outcome_id, dependent_outcome_id)
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_prerequisites_revision ON curriculum_prerequisites(revision_id);

  CREATE TABLE IF NOT EXISTS curriculum_practice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_id INTEGER NOT NULL,
    outcome_id INTEGER,
    kind TEXT NOT NULL CHECK(kind IN ('worked_example','independent','retrieval','transfer','repair')),
    prompt TEXT,
    instructions TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL DEFAULT 15,
    retrieval_delay_days INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_practice_outcome ON curriculum_practice(outcome_id, sort_order, id);

  CREATE TABLE IF NOT EXISTS curriculum_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    revision_id INTEGER NOT NULL,
    outcome_id INTEGER,
    criterion TEXT NOT NULL,
    evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('assessment','teach_back','practice','tutor','manual')),
    target_score REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_mastery_outcome ON curriculum_mastery(outcome_id);

  CREATE TABLE IF NOT EXISTS curriculum_generation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    requested_revision INTEGER NOT NULL,
    resulting_revision INTEGER,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    source_hashes_json TEXT NOT NULL DEFAULT '[]',
    output_hash TEXT,
    status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','applied','rejected','failed','stale')),
    validation_score REAL,
    repair_attempt INTEGER NOT NULL DEFAULT 0,
    error_details_json TEXT NOT NULL DEFAULT '[]',
    change_summary_json TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_ms INTEGER,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (resulting_revision) REFERENCES curriculum_revisions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_generation_runs_subject ON curriculum_generation_runs(subject_id, started_at DESC);

  CREATE TABLE IF NOT EXISTS manual_syllabus_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS manual_syllabus_materials (
    week_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (week_id, material_id),
    FOREIGN KEY (week_id) REFERENCES manual_syllabus_weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
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
    title TEXT,
    last_message_at INTEGER,
    is_pinned INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS tutor_session_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    topic_id INTEGER,
    topic_label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    gap_evidence_json TEXT NOT NULL DEFAULT '[]',
    recommended_minutes INTEGER,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tutor_session_targets_session ON tutor_session_targets(session_id, sort_order, id);

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
    action_type TEXT DEFAULT 'custom',
    learning_objective TEXT,
    target_topic TEXT,
    is_dismissed INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS calendar_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ical', 'manual', 'google_oauth')),
    url TEXT,
    color TEXT DEFAULT '#8b5cf6',
    google_account_id INTEGER,
    google_calendar_id TEXT,
    sync_token TEXT,
    provider_metadata_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS google_calendar_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    encrypted_refresh_token TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'reauthorize_required', 'error')),
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_google_calendar_accounts_user ON google_calendar_accounts(user_id);

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_id INTEGER,
    external_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    recurrence_rule TEXT,
    subject_id INTEGER,
    event_type TEXT NOT NULL DEFAULT 'lecture' CHECK(event_type IN ('lecture', 'seminar', 'lab', 'workshop', 'study', 'personal')),
    study_status TEXT NOT NULL DEFAULT 'planned' CHECK(study_status IN ('planned', 'completed', 'skipped')),
    focus_minutes INTEGER,
    focus_action TEXT CHECK(focus_action IS NULL OR focus_action IN ('review', 'tutor', 'practice', 'reading', 'custom')),
    daily_plan_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time
    ON calendar_events (user_id, start_time, end_time);

  CREATE TABLE IF NOT EXISTS lectures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    audio_mime_type TEXT NOT NULL DEFAULT 'audio/webm',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'recorded', 'transcribing', 'ready', 'failed')),
    raw_transcript TEXT,
    error_message TEXT,
    material_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_lectures_subject
    ON lectures (subject_id);

  CREATE TABLE IF NOT EXISTS practice_problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    module_id INTEGER,
    topic_id INTEGER,
    material_id INTEGER,
    title TEXT NOT NULL,
    problem_text TEXT NOT NULL,
    solution_steps TEXT,
    final_answer TEXT,
    difficulty INTEGER DEFAULT 2,
    principles_json TEXT DEFAULT '[]',
    is_ai_generated INTEGER DEFAULT 0,
    parent_problem_id INTEGER,
    stimulus TEXT,
    stem_lead_in TEXT,
    options_json TEXT,
    correct_key TEXT,
    blooms_revised TEXT,
    webbs_dok TEXT,
    discipline_paradigm TEXT,
    subgoals_json TEXT,
    item_validation_json TEXT,
    quality_score REAL,
    cover_test_passed INTEGER,
    verification_status TEXT NOT NULL DEFAULT 'legacy_unverified',
    verification_json TEXT,
    solution_steps_json TEXT,
    source_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES syllabus_modules(id) ON DELETE SET NULL,
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE SET NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_practice_problems_subject ON practice_problems (subject_id);
  CREATE INDEX IF NOT EXISTS idx_practice_problems_module ON practice_problems (module_id);
  CREATE INDEX IF NOT EXISTS idx_practice_problems_topic ON practice_problems (topic_id);

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    module_id INTEGER,
    topic_id INTEGER,
    total_problems INTEGER NOT NULL,
    completed_problems INTEGER DEFAULT 0,
    correct_problems INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    summary TEXT,
    mode TEXT NOT NULL DEFAULT 'standard' CHECK(mode IN ('standard', 'guided')),
    guided_phase TEXT,
    guided_state_json TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_practice_sessions_subject ON practice_sessions (subject_id);

  CREATE TABLE IF NOT EXISTS practice_problem_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    problem_id INTEGER NOT NULL,
    user_answer TEXT,
    is_correct INTEGER DEFAULT 0,
    tutor_conversation_id INTEGER,
    feedback TEXT,
    time_spent_seconds INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    evaluation_json TEXT,
    assistance_level TEXT NOT NULL DEFAULT 'none' CHECK(assistance_level IN ('none', 'hint', 'worked_example', 'direct_answer', 'unassessed')),
    self_explanation TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    transfer_result TEXT,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (problem_id) REFERENCES practice_problems(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_practice_attempts_session ON practice_problem_attempts (session_id);

  CREATE TABLE IF NOT EXISTS practice_guidance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    problem_id INTEGER NOT NULL,
    phase TEXT NOT NULL,
    subgoal_index INTEGER NOT NULL DEFAULT 0,
    learner_response TEXT,
    hint_level INTEGER NOT NULL DEFAULT 0,
    evaluation_json TEXT,
    assistance_level TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (problem_id) REFERENCES practice_problems(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_practice_guidance_session ON practice_guidance_events(session_id, id);

  -- V5.0: Cognitive Knowledge & Rating Fabric (CKRF)
  CREATE TABLE IF NOT EXISTS topic_competency_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1500.0,
    rating_deviation REAL NOT NULL DEFAULT 350.0,
    volatility REAL NOT NULL DEFAULT 0.06,
    highest_rating REAL NOT NULL DEFAULT 1500.0,
    lowest_rating REAL NOT NULL DEFAULT 1500.0,
    observations_count INTEGER NOT NULL DEFAULT 0,
    last_assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    decayed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, subject_id, topic),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_topic_ratings_user_subject ON topic_competency_ratings(user_id, subject_id);

  CREATE TABLE IF NOT EXISTS episodic_learning_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('breakthrough', 'struggle', 'analogy', 'pedagogical_profile')),
    importance_score INTEGER NOT NULL DEFAULT 5,
    summary TEXT NOT NULL,
    context_snippet TEXT,
    effective_intervention TEXT,
    session_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episodic_memories_lookup ON episodic_learning_memories(user_id, subject_id, topic);

  CREATE TABLE IF NOT EXISTS student_misconceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    concept TEXT NOT NULL,
    misconception_key TEXT NOT NULL,
    misconception_title TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation_status TEXT NOT NULL DEFAULT 'active' CHECK(remediation_status IN ('active', 'inoculating', 'resolved')),
    consecutive_successes INTEGER DEFAULT 0,
    occurrence_count INTEGER DEFAULT 1,
    first_observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    UNIQUE(user_id, subject_id, misconception_key),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_misconceptions_status ON student_misconceptions(user_id, subject_id, remediation_status);

  CREATE TABLE IF NOT EXISTS concept_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    prerequisite_concept TEXT NOT NULL,
    target_concept TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    UNIQUE(subject_id, prerequisite_concept, target_concept),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_concept_deps_subject ON concept_dependencies(subject_id);

  -- V5.2: Topic Spaced Repetition (Topic-SRS) Memory
  CREATE TABLE IF NOT EXISTS topic_spaced_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    stability REAL NOT NULL DEFAULT 2.0,
    difficulty REAL NOT NULL DEFAULT 5.0,
    retrievability REAL NOT NULL DEFAULT 1.0,
    reps INTEGER NOT NULL DEFAULT 1,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_studied_at TEXT NOT NULL DEFAULT (datetime('now')),
    next_review_due TEXT NOT NULL DEFAULT (date('now', '+2 days')),
    status TEXT NOT NULL DEFAULT 'fresh' CHECK(status IN ('fresh', 'fading', 'overdue')),
    UNIQUE (topic_id, user_id),
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_topic_srs_user_subject ON topic_spaced_memory(user_id, subject_id);
  CREATE INDEX IF NOT EXISTS idx_topic_srs_due ON topic_spaced_memory(user_id, next_review_due);

  CREATE TABLE IF NOT EXISTS learning_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    session_id INTEGER,
    message_id TEXT,
    concept TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('correct', 'partial', 'incorrect', 'unassessed')),
    score REAL,
    confidence REAL NOT NULL DEFAULT 0.5,
    assistance_level TEXT NOT NULL DEFAULT 'none',
    evidence_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_learning_events_lookup ON learning_events(user_id, subject_id, concept, created_at DESC);

  CREATE TABLE IF NOT EXISTS learner_memory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('semantic_fact', 'episodic', 'teaching_preference', 'source_fact', 'session_state')),
    memory_key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'uncertain', 'superseded', 'resolved')),
    source_session_id INTEGER,
    last_verified_at TEXT,
    supersedes_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (supersedes_id) REFERENCES learner_memory_items(id) ON DELETE SET NULL,
    UNIQUE (user_id, subject_id, memory_type, memory_key, status)
  );
  CREATE INDEX IF NOT EXISTS idx_learner_memory_lookup ON learner_memory_items(user_id, subject_id, status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS memory_evidence_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id INTEGER NOT NULL,
    message_id TEXT,
    learning_event_id INTEGER,
    material_id INTEGER,
    chunk_index INTEGER,
    relation TEXT NOT NULL DEFAULT 'supports',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (memory_id) REFERENCES learner_memory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE SET NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memory_evidence_memory ON memory_evidence_links(memory_id);

  CREATE TABLE IF NOT EXISTS session_summaries (
    session_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    summary TEXT NOT NULL,
    open_loops_json TEXT NOT NULL DEFAULT '[]',
    concepts_json TEXT NOT NULL DEFAULT '[]',
    source_version TEXT NOT NULL DEFAULT 'v1',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );
`

export const MIGRATIONS_SQL = [
  `CREATE TABLE IF NOT EXISTS manual_syllabus_weeks (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS manual_syllabus_materials (week_id INTEGER NOT NULL, material_id INTEGER NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (week_id, material_id), FOREIGN KEY (week_id) REFERENCES manual_syllabus_weeks(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS document_chunks (id TEXT PRIMARY KEY, material_id INTEGER NOT NULL, chunk_index INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', heading_path TEXT NOT NULL DEFAULT '', chunk_type TEXT NOT NULL DEFAULT 'general_block', text TEXT NOT NULL, char_start INTEGER NOT NULL DEFAULT 0, char_end INTEGER NOT NULL DEFAULT 0, token_count INTEGER NOT NULL DEFAULT 0, content_hash TEXT NOT NULL, previous_chunk_id TEXT, next_chunk_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE, UNIQUE (material_id, chunk_index))`,
  "CREATE INDEX IF NOT EXISTS idx_document_chunks_material ON document_chunks(material_id, chunk_index)",
  "CREATE INDEX IF NOT EXISTS idx_document_chunks_hash ON document_chunks(content_hash)",
  `CREATE TABLE IF NOT EXISTS retrieval_events (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, material_id INTEGER, query TEXT NOT NULL, selected_json TEXT NOT NULL DEFAULT '[]', candidate_count INTEGER NOT NULL DEFAULT 0, retrieval_mode TEXT NOT NULL DEFAULT 'hybrid', index_version TEXT NOT NULL DEFAULT 'v1', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE)`,
  "CREATE INDEX IF NOT EXISTS idx_retrieval_events_scope ON retrieval_events(subject_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS learning_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, session_id INTEGER, message_id TEXT, concept TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('correct', 'partial', 'incorrect', 'unassessed')), score REAL, confidence REAL NOT NULL DEFAULT 0.5, assistance_level TEXT NOT NULL DEFAULT 'none', evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_learning_events_lookup ON learning_events(user_id, subject_id, concept, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS learner_memory_items (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, memory_type TEXT NOT NULL CHECK(memory_type IN ('semantic_fact', 'episodic', 'teaching_preference', 'source_fact', 'session_state')), memory_key TEXT NOT NULL, value_json TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0.5, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'uncertain', 'superseded', 'resolved')), source_session_id INTEGER, last_verified_at TEXT, supersedes_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY (source_session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL, FOREIGN KEY (supersedes_id) REFERENCES learner_memory_items(id) ON DELETE SET NULL, UNIQUE (user_id, subject_id, memory_type, memory_key, status))`,
  "CREATE INDEX IF NOT EXISTS idx_learner_memory_lookup ON learner_memory_items(user_id, subject_id, status, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS memory_evidence_links (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id INTEGER NOT NULL, message_id TEXT, learning_event_id INTEGER, material_id INTEGER, chunk_index INTEGER, relation TEXT NOT NULL DEFAULT 'supports', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (memory_id) REFERENCES learner_memory_items(id) ON DELETE CASCADE, FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE SET NULL, FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_memory_evidence_memory ON memory_evidence_links(memory_id)",
  `CREATE TABLE IF NOT EXISTS session_summaries (session_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, summary TEXT NOT NULL, open_loops_json TEXT NOT NULL DEFAULT '[]', concepts_json TEXT NOT NULL DEFAULT '[]', source_version TEXT NOT NULL DEFAULT 'v1', updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`,
  "ALTER TABLE session_summaries ADD COLUMN unresolved_misconceptions_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE session_summaries ADD COLUMN next_retrieval_targets_json TEXT NOT NULL DEFAULT '[]'",
  "CREATE TABLE IF NOT EXISTS subject_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL UNIQUE, body TEXT NOT NULL DEFAULT '', links_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)",
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
  "ALTER TABLE tutor_sessions ADD COLUMN difficulty_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(difficulty_mode IN ('fixed','adaptive'))",
  "ALTER TABLE tutor_sessions ADD COLUMN adaptive_score REAL",
  "ALTER TABLE tutor_sessions ADD COLUMN adaptive_uncertainty REAL",
  "ALTER TABLE tutor_sessions ADD COLUMN adaptive_reason TEXT",
  `CREATE TABLE IF NOT EXISTS adaptive_concept_states (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, concept TEXT NOT NULL, score REAL NOT NULL DEFAULT 30, uncertainty REAL NOT NULL DEFAULT 0.85, observations INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0, partial_count INTEGER NOT NULL DEFAULT 0, incorrect_count INTEGER NOT NULL DEFAULT 0, last_outcome TEXT NOT NULL DEFAULT 'unassessed', last_assistance TEXT NOT NULL DEFAULT 'unassessed', last_task_type TEXT, retention REAL, misconception_risk REAL, last_assessed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, subject_id, concept), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`,
  "CREATE INDEX IF NOT EXISTS idx_adaptive_concept_states_lookup ON adaptive_concept_states(user_id, subject_id, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS tutor_task_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, concept TEXT NOT NULL, task_type TEXT NOT NULL, task_key TEXT NOT NULL, difficulty REAL NOT NULL DEFAULT 50, observations INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(subject_id, task_key), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS tutor_turn_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, student_message_id TEXT, tutor_message_id TEXT, concept TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('correct','partial','incorrect','unassessed')), score REAL, confidence REAL NOT NULL DEFAULT 0.5, assistance_level TEXT NOT NULL DEFAULT 'unassessed', task_type TEXT, task_difficulty REAL, evidence_span TEXT, misconception TEXT, followed_scaffold INTEGER, changed_goal INTEGER, source_evidence_json TEXT NOT NULL DEFAULT '[]', idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE)`,
  "CREATE INDEX IF NOT EXISTS idx_tutor_turn_assessments_session ON tutor_turn_assessments(session_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS tutor_teach_back_gates (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, topic_id INTEGER, concept TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','needs_revision','passed','incomplete')), attempt_count INTEGER NOT NULL DEFAULT 0, feedback TEXT, required_assessment_id INTEGER, passed_assessment_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(session_id, concept), FOREIGN KEY(session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE, FOREIGN KEY(topic_id) REFERENCES module_topics(id) ON DELETE SET NULL, FOREIGN KEY(required_assessment_id) REFERENCES tutor_turn_assessments(id) ON DELETE SET NULL, FOREIGN KEY(passed_assessment_id) REFERENCES tutor_turn_assessments(id) ON DELETE SET NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_tutor_teach_back_gates_active ON tutor_teach_back_gates(session_id, status, updated_at DESC)",
  "ALTER TABLE materials ADD COLUMN file_size INTEGER",
  "ALTER TABLE materials ADD COLUMN file_path TEXT",
  "ALTER TABLE materials ADD COLUMN tags TEXT DEFAULT ''",
  "ALTER TABLE subjects ADD COLUMN time_commitment_minutes INTEGER DEFAULT 60",
  "ALTER TABLE subjects ADD COLUMN subject_icon TEXT NOT NULL DEFAULT 'book-open'",
  "ALTER TABLE subjects ADD COLUMN color TEXT DEFAULT '#8b5cf6'",
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
  // V3.3: Focus Block plan enhancements
  "ALTER TABLE daily_plans ADD COLUMN action_type TEXT DEFAULT 'custom'",
  "ALTER TABLE daily_plans ADD COLUMN learning_objective TEXT",
  "ALTER TABLE daily_plans ADD COLUMN target_topic TEXT",
  "ALTER TABLE daily_plans ADD COLUMN is_dismissed INTEGER DEFAULT 0",
  // V3.4: Calendar Sources & Events
  "CREATE TABLE IF NOT EXISTS calendar_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('ical', 'manual', 'google_oauth')), url TEXT, color TEXT DEFAULT '#8b5cf6', google_account_id INTEGER, google_calendar_id TEXT, sync_token TEXT, provider_metadata_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, last_synced_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS google_calendar_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, encrypted_refresh_token TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'reauthorize_required', 'error')), last_synced_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_google_calendar_accounts_user ON google_calendar_accounts(user_id)",
  "CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_id INTEGER, external_id TEXT, title TEXT NOT NULL, description TEXT, location TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, recurrence_rule TEXT, subject_id INTEGER, event_type TEXT NOT NULL DEFAULT 'lecture' CHECK(event_type IN ('lecture', 'seminar', 'lab', 'workshop', 'study', 'personal')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE, FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time ON calendar_events (user_id, start_time, end_time)",
  // V4.4: Persistent calendar study blocks
  "ALTER TABLE calendar_events ADD COLUMN study_status TEXT NOT NULL DEFAULT 'planned' CHECK(study_status IN ('planned', 'completed', 'skipped'))",
  "ALTER TABLE calendar_events ADD COLUMN focus_minutes INTEGER",
  "ALTER TABLE calendar_events ADD COLUMN focus_action TEXT",
  "ALTER TABLE calendar_events ADD COLUMN daily_plan_id INTEGER",
  "ALTER TABLE calendar_sources ADD COLUMN google_account_id INTEGER",
  "ALTER TABLE calendar_sources ADD COLUMN google_calendar_id TEXT",
  "ALTER TABLE calendar_sources ADD COLUMN sync_token TEXT",
  "ALTER TABLE calendar_sources ADD COLUMN provider_metadata_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE calendar_sources ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
  // V4.2: Linked class folders
  "ALTER TABLE subjects ADD COLUMN linked_folder_path TEXT DEFAULT NULL",
  "ALTER TABLE subjects ADD COLUMN folder_last_synced_at TEXT DEFAULT NULL",
  "ALTER TABLE subjects ADD COLUMN folder_sync_status TEXT DEFAULT 'idle'",
  "ALTER TABLE materials ADD COLUMN file_mtime INTEGER DEFAULT NULL",
  "ALTER TABLE materials ADD COLUMN file_size INTEGER DEFAULT NULL",
  "ALTER TABLE materials ADD COLUMN file_sha256 TEXT DEFAULT NULL",
  "ALTER TABLE materials ADD COLUMN relative_path TEXT DEFAULT NULL",
  "ALTER TABLE materials ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
  `UPDATE materials SET sort_order = (
    SELECT COUNT(*) FROM materials newer
    WHERE newer.subject_id = materials.subject_id
      AND (newer.uploaded_at > materials.uploaded_at
        OR (newer.uploaded_at = materials.uploaded_at AND newer.id > materials.id))
  ) WHERE sort_order = 0
    AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'materials_sort_order_migrated')`,
  "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('materials_sort_order_migrated', 'v1')",
  // V4.3: Lecture audio recording & notes
  "CREATE TABLE IF NOT EXISTS lectures (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, title TEXT NOT NULL, audio_path TEXT NOT NULL, audio_mime_type TEXT NOT NULL DEFAULT 'audio/webm', duration_seconds INTEGER NOT NULL DEFAULT 0, file_size_bytes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'recording' CHECK(status IN ('recording', 'recorded', 'transcribing', 'ready', 'failed')), raw_transcript TEXT, error_message TEXT, material_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lectures_subject ON lectures (subject_id)",
  // V4.5: Persistent document/lecture annotation sidecar
  `CREATE TABLE IF NOT EXISTS document_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    material_id INTEGER,
    lecture_id INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('highlight', 'comment', 'cue', 'question', 'summary')),
    parent_id INTEGER,
    color TEXT,
    body TEXT NOT NULL DEFAULT '',
    selected_text TEXT,
    locator_json TEXT,
    source_snapshot TEXT,
    source_hash TEXT,
    locator_status TEXT NOT NULL DEFAULT 'resolved' CHECK (locator_status IN ('resolved', 'needs_review')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    CHECK (material_id IS NOT NULL OR lecture_id IS NOT NULL),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES document_annotations(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_document_annotations_material ON document_annotations (material_id, deleted_at, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_document_annotations_lecture ON document_annotations (lecture_id, deleted_at, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_document_annotations_subject ON document_annotations (subject_id, deleted_at, updated_at)",
  "ALTER TABLE document_annotations ADD COLUMN locator_status TEXT NOT NULL DEFAULT 'resolved'",
  // V4.4: Practice Problems & Lab
  `CREATE TABLE IF NOT EXISTS practice_problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    module_id INTEGER,
    topic_id INTEGER,
    material_id INTEGER,
    title TEXT NOT NULL,
    problem_text TEXT NOT NULL,
    solution_steps TEXT,
    final_answer TEXT,
    difficulty INTEGER DEFAULT 2,
    principles_json TEXT DEFAULT '[]',
    is_ai_generated INTEGER DEFAULT 0,
    parent_problem_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES syllabus_modules(id) ON DELETE SET NULL,
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE SET NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_practice_problems_subject ON practice_problems (subject_id)",
  `CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    module_id INTEGER,
    topic_id INTEGER,
    total_problems INTEGER NOT NULL,
    completed_problems INTEGER DEFAULT 0,
    correct_problems INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    summary TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_practice_sessions_subject ON practice_sessions (subject_id)",
  `CREATE TABLE IF NOT EXISTS practice_problem_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    problem_id INTEGER NOT NULL,
    user_answer TEXT,
    is_correct INTEGER DEFAULT 0,
    tutor_conversation_id INTEGER,
    feedback TEXT,
    time_spent_seconds INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (problem_id) REFERENCES practice_problems(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_practice_attempts_session ON practice_problem_attempts (session_id)",
  // V5.0: Cognitive Knowledge & Rating Fabric (CKRF)
  `CREATE TABLE IF NOT EXISTS topic_competency_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1500.0,
    rating_deviation REAL NOT NULL DEFAULT 350.0,
    volatility REAL NOT NULL DEFAULT 0.06,
    highest_rating REAL NOT NULL DEFAULT 1500.0,
    lowest_rating REAL NOT NULL DEFAULT 1500.0,
    observations_count INTEGER NOT NULL DEFAULT 0,
    last_assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    decayed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, subject_id, topic),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_topic_ratings_user_subject ON topic_competency_ratings(user_id, subject_id)",
  `CREATE TABLE IF NOT EXISTS episodic_learning_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('breakthrough', 'struggle', 'analogy', 'pedagogical_profile')),
    importance_score INTEGER NOT NULL DEFAULT 5,
    summary TEXT NOT NULL,
    context_snippet TEXT,
    effective_intervention TEXT,
    session_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_episodic_memories_lookup ON episodic_learning_memories(user_id, subject_id, topic)",
  `CREATE TABLE IF NOT EXISTS student_misconceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    concept TEXT NOT NULL,
    misconception_key TEXT NOT NULL,
    misconception_title TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation_status TEXT NOT NULL DEFAULT 'active' CHECK(remediation_status IN ('active', 'inoculating', 'resolved')),
    consecutive_successes INTEGER DEFAULT 0,
    occurrence_count INTEGER DEFAULT 1,
    first_observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    UNIQUE(user_id, subject_id, misconception_key),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_misconceptions_status ON student_misconceptions(user_id, subject_id, remediation_status)",
  `CREATE TABLE IF NOT EXISTS concept_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    prerequisite_concept TEXT NOT NULL,
    target_concept TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    UNIQUE(subject_id, prerequisite_concept, target_concept),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_concept_deps_subject ON concept_dependencies(subject_id)",
  // V5.1: Dynamic syllabus reconciliation flags
  "ALTER TABLE module_topics ADD COLUMN has_new_material INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE module_topics ADD COLUMN is_gap INTEGER NOT NULL DEFAULT 0",
  // V5.2: Topic Spaced Repetition (Topic-SRS) Memory
  `CREATE TABLE IF NOT EXISTS topic_spaced_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    stability REAL NOT NULL DEFAULT 2.0,
    difficulty REAL NOT NULL DEFAULT 5.0,
    retrievability REAL NOT NULL DEFAULT 1.0,
    reps INTEGER NOT NULL DEFAULT 1,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_studied_at TEXT NOT NULL DEFAULT (datetime('now')),
    next_review_due TEXT NOT NULL DEFAULT (date('now', '+2 days')),
    status TEXT NOT NULL DEFAULT 'fresh' CHECK(status IN ('fresh', 'fading', 'overdue')),
    UNIQUE (topic_id, user_id),
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_topic_srs_user_subject ON topic_spaced_memory(user_id, subject_id)",
  "CREATE INDEX IF NOT EXISTS idx_topic_srs_due ON topic_spaced_memory(user_id, next_review_due)",
  // V5.5: Evidence-backed topic review history and transparent planning metadata
  `CREATE TABLE IF NOT EXISTS topic_review_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('tutor', 'flashcards', 'practice', 'new_content', 'manual')),
    prompt_text TEXT,
    answer_text TEXT,
    score REAL,
    assistance_level TEXT NOT NULL DEFAULT 'none' CHECK(assistance_level IN ('none', 'hint', 'worked_example', 'direct_answer', 'unassessed')),
    duration_seconds INTEGER,
    source_material_id INTEGER,
    session_id INTEGER,
    evidence_status TEXT NOT NULL DEFAULT 'assessed' CHECK(evidence_status IN ('assessed', 'unassessed', 'invalid')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_material_id) REFERENCES materials(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_topic_review_events_lookup ON topic_review_events(user_id, subject_id, topic_id, created_at DESC)",
  "ALTER TABLE module_topics ADD COLUMN concept_fingerprint TEXT",
  "ALTER TABLE module_topics ADD COLUMN concept_type TEXT DEFAULT 'concept'",
  "ALTER TABLE module_topics ADD COLUMN estimated_minutes INTEGER DEFAULT 15",
  "ALTER TABLE module_topics ADD COLUMN new_content_state TEXT NOT NULL DEFAULT 'unseen' CHECK(new_content_state IN ('unseen','learning','verified','deferred'))",
  "ALTER TABLE module_topics ADD COLUMN source_material_ids TEXT DEFAULT '[]'",
  "ALTER TABLE daily_plans ADD COLUMN reason_code TEXT",
  "ALTER TABLE daily_plans ADD COLUMN topic_id INTEGER REFERENCES module_topics(id) ON DELETE SET NULL",
  "ALTER TABLE daily_plans ADD COLUMN evidence_json TEXT DEFAULT '{}'",
  "ALTER TABLE daily_plans ADD COLUMN success_criteria TEXT",
  "ALTER TABLE daily_plans ADD COLUMN fallback_action TEXT",
  // V5.3: Tutor session persistence & chat history
  "ALTER TABLE tutor_sessions ADD COLUMN title TEXT",
  "ALTER TABLE tutor_sessions ADD COLUMN last_message_at INTEGER",
  "ALTER TABLE tutor_sessions ADD COLUMN is_pinned INTEGER DEFAULT 0",
  "CREATE INDEX IF NOT EXISTS idx_tutor_sessions_subject ON tutor_sessions(subject_id, last_message_at DESC)",
  `CREATE TABLE IF NOT EXISTS tutor_session_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    topic_id INTEGER,
    topic_label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    gap_evidence_json TEXT NOT NULL DEFAULT '[]',
    recommended_minutes INTEGER,
    FOREIGN KEY (session_id) REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES module_topics(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_tutor_session_targets_session ON tutor_session_targets(session_id, sort_order, id)",
  // V5.4: Practice Problem Psychometrics & Cognitive Demands
  "ALTER TABLE practice_problems ADD COLUMN stimulus TEXT",
  "ALTER TABLE practice_problems ADD COLUMN stem_lead_in TEXT",
  "ALTER TABLE practice_problems ADD COLUMN options_json TEXT",
  "ALTER TABLE practice_problems ADD COLUMN correct_key TEXT",
  "ALTER TABLE practice_problems ADD COLUMN blooms_revised TEXT",
  "ALTER TABLE practice_problems ADD COLUMN webbs_dok TEXT",
  "ALTER TABLE practice_problems ADD COLUMN discipline_paradigm TEXT",
  "ALTER TABLE practice_problems ADD COLUMN subgoals_json TEXT",
  "ALTER TABLE practice_problems ADD COLUMN item_validation_json TEXT",
  "ALTER TABLE practice_problems ADD COLUMN quality_score REAL",
  "ALTER TABLE practice_problems ADD COLUMN cover_test_passed INTEGER",
  "ALTER TABLE practice_problems ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'legacy_unverified'",
  "ALTER TABLE practice_problems ADD COLUMN verification_json TEXT",
  "ALTER TABLE practice_problems ADD COLUMN solution_steps_json TEXT",
  "ALTER TABLE practice_problems ADD COLUMN source_ref TEXT",
  "ALTER TABLE practice_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard'",
  "ALTER TABLE practice_sessions ADD COLUMN guided_phase TEXT",
  "ALTER TABLE practice_sessions ADD COLUMN guided_state_json TEXT",
  "ALTER TABLE practice_problem_attempts ADD COLUMN evaluation_json TEXT",
  "ALTER TABLE practice_problem_attempts ADD COLUMN assistance_level TEXT NOT NULL DEFAULT 'none'",
  "ALTER TABLE practice_problem_attempts ADD COLUMN self_explanation TEXT",
  "ALTER TABLE practice_problem_attempts ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE practice_problem_attempts ADD COLUMN transfer_result TEXT",
  "CREATE TABLE IF NOT EXISTS practice_guidance_events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, problem_id INTEGER NOT NULL, phase TEXT NOT NULL, subgoal_index INTEGER NOT NULL DEFAULT 0, learner_response TEXT, hint_level INTEGER NOT NULL DEFAULT 0, evaluation_json TEXT, assistance_level TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE, FOREIGN KEY (problem_id) REFERENCES practice_problems(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_practice_guidance_session ON practice_guidance_events(session_id, id)",
  // V5.6: Source-grounded curriculum graph and generation audit trail.
  "ALTER TABLE subjects ADD COLUMN curriculum_revision INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE subjects ADD COLUMN curriculum_schema_version INTEGER NOT NULL DEFAULT 1",
  "CREATE TABLE IF NOT EXISTS curriculum_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_number INTEGER NOT NULL, parent_revision_id INTEGER, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','applied','superseded','rejected')), source_hashes_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), applied_at TEXT, FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(parent_revision_id) REFERENCES curriculum_revisions(id) ON DELETE SET NULL, UNIQUE(subject_id, revision_number))",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_revisions_subject ON curriculum_revisions(subject_id, revision_number DESC)",
  "CREATE TABLE IF NOT EXISTS curriculum_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, material_id INTEGER NOT NULL, chunk_id TEXT, content_hash TEXT NOT NULL, section TEXT, page INTEGER, slide INTEGER, start_offset INTEGER, end_offset INTEGER, quote TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE, FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_evidence_revision ON curriculum_evidence(revision_id, material_id)",
  "CREATE TABLE IF NOT EXISTS curriculum_outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, topic_id INTEGER, outcome_key TEXT NOT NULL, statement TEXT NOT NULL, bloom_level TEXT, sort_order INTEGER NOT NULL DEFAULT 0, evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE, FOREIGN KEY(topic_id) REFERENCES module_topics(id) ON DELETE SET NULL, UNIQUE(revision_id, outcome_key))",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_outcomes_revision ON curriculum_outcomes(revision_id, sort_order, id)",
  "CREATE TABLE IF NOT EXISTS curriculum_prerequisites (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, prerequisite_outcome_id INTEGER NOT NULL, dependent_outcome_id INTEGER NOT NULL, relation TEXT NOT NULL DEFAULT 'requires' CHECK(relation IN ('requires','recommended')), rationale TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE, FOREIGN KEY(prerequisite_outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE, FOREIGN KEY(dependent_outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE, CHECK(prerequisite_outcome_id <> dependent_outcome_id), UNIQUE(revision_id, prerequisite_outcome_id, dependent_outcome_id))",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_prerequisites_revision ON curriculum_prerequisites(revision_id)",
  "CREATE TABLE IF NOT EXISTS curriculum_practice (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, outcome_id INTEGER, kind TEXT NOT NULL CHECK(kind IN ('worked_example','independent','retrieval','transfer','repair')), prompt TEXT, instructions TEXT NOT NULL, estimated_minutes INTEGER NOT NULL DEFAULT 15, retrieval_delay_days INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE, FOREIGN KEY(outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_practice_outcome ON curriculum_practice(outcome_id, sort_order, id)",
  "CREATE TABLE IF NOT EXISTS curriculum_mastery (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, outcome_id INTEGER, criterion TEXT NOT NULL, evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('assessment','teach_back','practice','tutor','manual')), target_score REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(revision_id) REFERENCES curriculum_revisions(id) ON DELETE CASCADE, FOREIGN KEY(outcome_id) REFERENCES curriculum_outcomes(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_mastery_outcome ON curriculum_mastery(outcome_id)",
  "CREATE TABLE IF NOT EXISTS curriculum_generation_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, requested_revision INTEGER NOT NULL, resulting_revision INTEGER, provider TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL, source_hashes_json TEXT NOT NULL DEFAULT '[]', output_hash TEXT, status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','applied','rejected','failed','stale')), validation_score REAL, repair_attempt INTEGER NOT NULL DEFAULT 0, error_details_json TEXT NOT NULL DEFAULT '[]', change_summary_json TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, duration_ms INTEGER, FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE, FOREIGN KEY(resulting_revision) REFERENCES curriculum_revisions(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_curriculum_generation_runs_subject ON curriculum_generation_runs(subject_id, started_at DESC)"
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
  // subject_notes uses ON DELETE CASCADE and is removed by SQLite with the subject.
  for (const table of SUBJECT_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE subject_id = ?`).run(subjectId)
  }

  // 6. The subject itself.
  db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId)
}

/** Delete a single card and every row that references it directly. */
export function deleteCardCascade(db: CascadeDB, cardId: number): void {
  for (const table of CARD_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE card_id = ?`).run(cardId)
  }
  db.prepare('DELETE FROM cards WHERE id = ?').run(cardId)
}

/** Delete multiple cards and every row that references them directly in chunks. */
export function deleteCardsCascade(db: CascadeDB, cardIds: number[]): number {
  if (!cardIds || cardIds.length === 0) return 0
  const chunkSize = 500
  let totalDeleted = 0
  for (let i = 0; i < cardIds.length; i += chunkSize) {
    const chunk = cardIds.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(',')
    for (const table of CARD_CHILD_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE card_id IN (${placeholders})`).run(...chunk)
    }
    const res = db.prepare(`DELETE FROM cards WHERE id IN (${placeholders})`).run(...chunk) as { changes?: number }
    totalDeleted += res?.changes ?? chunk.length
  }
  return totalDeleted
}

export function createLecture(
  db: CascadeDB,
  params: CreateLectureParams
): Lecture {
  const stmt = db.prepare(`
    INSERT INTO lectures (
      subject_id, title, audio_path, audio_mime_type, duration_seconds, file_size_bytes, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    params.subject_id,
    params.title,
    params.audio_path,
    params.audio_mime_type || 'audio/webm',
    params.duration_seconds || 0,
    params.file_size_bytes || 0,
    params.status || 'recording'
  ) as { lastInsertRowid: number | bigint }
  const id = Number(info.lastInsertRowid)
  return getLectureById(db, id)!
}

export function getLectureById(db: CascadeDB, id: number): Lecture | null {
  const rows = db.prepare('SELECT * FROM lectures WHERE id = ?').all(id) as Lecture[]
  return rows.length > 0 ? rows[0] : null
}

export function listLecturesBySubject(db: CascadeDB, subjectId: number): Lecture[] {
  return db.prepare('SELECT * FROM lectures WHERE subject_id = ? ORDER BY created_at DESC').all(subjectId) as Lecture[]
}

export function updateLectureStatus(
  db: CascadeDB,
  id: number,
  status: LectureStatus,
  updates?: UpdateLectureParams
): Lecture | null {
  const fields: string[] = ['status = ?', "updated_at = datetime('now')"]
  const values: unknown[] = [status]

  if (updates) {
    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.duration_seconds !== undefined) {
      fields.push('duration_seconds = ?')
      values.push(updates.duration_seconds)
    }
    if (updates.file_size_bytes !== undefined) {
      fields.push('file_size_bytes = ?')
      values.push(updates.file_size_bytes)
    }
    if (updates.raw_transcript !== undefined) {
      fields.push('raw_transcript = ?')
      values.push(updates.raw_transcript)
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?')
      values.push(updates.error_message)
    }
    if (updates.material_id !== undefined) {
      fields.push('material_id = ?')
      values.push(updates.material_id)
    }
  }

  values.push(id)
  db.prepare(`UPDATE lectures SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getLectureById(db, id)
}

export function deleteLecture(db: CascadeDB, id: number): void {
  db.prepare('DELETE FROM lectures WHERE id = ?').run(id)
}
