import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { generateSyllabusForSubject, setSyllabusDatabase } from '../../electron/ipc/syllabusHandlers'
import { callAIMessages } from '../../electron/ipc/aiHandlers'
import { getAIConfig, getApiKey } from '../../electron/ipc/aiConfigStore'

jest.mock('../../electron/ipc/aiHandlers', () => ({ callAIMessages: jest.fn() }))
jest.mock('../../electron/ipc/aiConfigStore', () => ({
  getAIConfig: jest.fn(),
  getApiKey: jest.fn()
}))
jest.mock('../../electron/ipc/tutorHandlers', () => ({
  syncModuleCompletionStatus: jest.fn()
}))

const mockedCallAIMessages = callAIMessages as jest.MockedFunction<typeof callAIMessages>
const mockedGetAIConfig = getAIConfig as jest.MockedFunction<typeof getAIConfig>
const mockedGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const statement of DB_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) db.exec(`${statement};`)
  for (const migration of [
    "ALTER TABLE deadlines ADD COLUMN deadline_type TEXT NOT NULL DEFAULT 'personal'",
    'ALTER TABLE review_log ADD COLUMN response_time_ms INTEGER',
    'ALTER TABLE cards ADD COLUMN folder_id INTEGER REFERENCES card_folders(id)',
    'ALTER TABLE card_schedule ADD COLUMN stability REAL',
    'ALTER TABLE card_schedule ADD COLUMN difficulty REAL',
    'ALTER TABLE card_schedule ADD COLUMN state INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE card_schedule ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE cards ADD COLUMN concept TEXT'
  ]) {
    try { db.exec(migration) } catch { /* already present */ }
  }
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* already present */ }
  }
  return db
}

function insert(db: any, sql: string, ...params: unknown[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid)
}

function validResponse(materialId: number, moduleTitle = 'Foundations', topicTitle = 'Core concept', matchedPreviousTopic?: string): string {
  return JSON.stringify({
    modules: [{
      title: moduleTitle,
      description: 'A grounded module',
      hours_estimated: 2,
      topics: [
        { title: topicTitle, description: 'Explain the concept', concept_type: 'definition', estimated_minutes: 20, source_material_ids: [materialId], matched_previous_topic: matchedPreviousTopic ?? null, coverage_delta: 'identical' },
        { title: 'Applied example', description: 'Apply the concept', concept_type: 'application', estimated_minutes: 25, source_material_ids: [materialId], coverage_delta: 'new_topic' }
      ]
    }]
  })
}

describe('AI syllabus generation integration', () => {
  let db: any
  let subjectId: number
  let materialId: number
  let userId: number

  beforeEach(() => {
    db = createDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Test learner')
    subjectId = insert(db, 'INSERT INTO subjects (user_id, name, status, time_commitment_minutes) VALUES (?, ?, ?, ?)', userId, 'Biology', 'active', 120)
    materialId = insert(db, 'INSERT INTO materials (subject_id, filename, file_type, content_text, uploaded_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)', subjectId, 'biology.md', 'markdown', '# Foundations\nCells and energy.', '2026-10-05T00:00:00.000Z', 0)
    setSyllabusDatabase(db)
    mockedGetAIConfig.mockReturnValue({ provider: 'openai-compatible', baseUrl: 'https://api.example.test', model: 'test-model' })
    mockedGetApiKey.mockReturnValue('test-key')
    mockedCallAIMessages.mockReset()
  })

  afterEach(() => db.close())

  it('rejects the contradictory empty-source output without touching the active syllabus', async () => {
    const moduleId = insert(db, 'INSERT INTO syllabus_modules (subject_id, title, status, sort_order) VALUES (?, ?, ?, ?)', subjectId, 'Existing', 'in_progress', 0)
    const topicId = insert(db, 'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)', moduleId, 'Existing topic', 0)
    insert(db, 'INSERT INTO module_topic_study_log (topic_id, user_id) VALUES (?, ?)', topicId, userId)
    mockedCallAIMessages.mockResolvedValue(JSON.stringify({
      modules: [{ title: 'New', topics: [{ title: 'Uncited', concept_type: 'definition', estimated_minutes: 15, source_material_ids: [] }] }]
    }))

    await expect(generateSyllabusForSubject(subjectId)).rejects.toThrow(/missing source evidence/)
    expect(db.prepare('SELECT id, title FROM syllabus_modules WHERE subject_id = ?').all(subjectId)).toHaveLength(1)
    expect(db.prepare('SELECT id FROM module_topics WHERE id = ?').get(topicId)).toBeTruthy()
    expect(db.prepare('SELECT syllabus_processed FROM materials WHERE id = ?').get(materialId).syllabus_processed).toBe(0)
    const run = db.prepare('SELECT status, error_details_json FROM curriculum_generation_runs WHERE subject_id = ?').get(subjectId)
    expect(run.status).toBe('rejected')
    expect(run.error_details_json).toContain('missing source evidence')
    expect(run.error_details_json).not.toContain('test-key')
  })

  it('applies a valid fenced response and records graph provenance', async () => {
    mockedCallAIMessages.mockResolvedValue(`\`\`\`json\n${validResponse(materialId)}\n\`\`\``)

    const result = await generateSyllabusForSubject(subjectId)

    expect(result.modules).toHaveLength(1)
    expect(result.processed_material_count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM curriculum_revisions WHERE subject_id = ?').get(subjectId).count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM curriculum_outcomes WHERE subject_id = ?').get(subjectId).count).toBe(2)
    expect(db.prepare('SELECT COUNT(*) AS count FROM curriculum_evidence WHERE subject_id = ?').get(subjectId).count).toBe(2)
    expect(db.prepare('SELECT COUNT(*) AS count FROM curriculum_practice WHERE subject_id = ?').get(subjectId).count).toBe(2)
    expect(db.prepare('SELECT COUNT(*) AS count FROM curriculum_mastery WHERE subject_id = ?').get(subjectId).count).toBe(2)
    expect(db.prepare('SELECT status FROM curriculum_generation_runs WHERE id = ?').get(result.generation_run_id).status).toBe('applied')
    expect(db.prepare('SELECT syllabus_processed FROM materials WHERE id = ?').get(materialId).syllabus_processed).toBe(1)
  })

  it('preserves completed topic identity and study evidence during regeneration', async () => {
    mockedCallAIMessages.mockResolvedValue(validResponse(materialId, 'Foundations', 'Core concept'))
    const first = await generateSyllabusForSubject(subjectId)
    const oldTopic = db.prepare('SELECT id FROM module_topics WHERE module_id = ? AND title = ?').get(first.modules[0].id, 'Core concept')
    insert(db, 'INSERT INTO module_topic_study_log (topic_id, user_id) VALUES (?, ?)', oldTopic.id, userId)

    mockedCallAIMessages.mockResolvedValue(validResponse(materialId, 'Foundations', 'Core concept expanded', 'Core concept'))
    const second = await generateSyllabusForSubject(subjectId)
    const preserved = db.prepare('SELECT id FROM module_topics WHERE id = ?').get(oldTopic.id)
    const log = db.prepare('SELECT topic_id FROM module_topic_study_log WHERE topic_id = ? AND user_id = ?').get(oldTopic.id, userId)

    expect(second.modules).toHaveLength(1)
    expect(preserved).toBeTruthy()
    expect(log.topic_id).toBe(oldTopic.id)
  })

  it('records provider failures as failed runs with actionable redacted diagnostics', async () => {
    mockedCallAIMessages.mockRejectedValue(new Error('AI API error 401: Bearer test-key'))

    await expect(generateSyllabusForSubject(subjectId)).rejects.toThrow(/AI API error 401/)
    const run = db.prepare('SELECT status, error_details_json FROM curriculum_generation_runs WHERE subject_id = ?').get(subjectId)
    expect(run.status).toBe('failed')
    expect(run.error_details_json).toContain('provider_error')
    expect(run.error_details_json).not.toContain('test-key')
    expect(db.prepare('SELECT COUNT(*) AS count FROM syllabus_modules WHERE subject_id = ?').get(subjectId).count).toBe(0)
  })
})
