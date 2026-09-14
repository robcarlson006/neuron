import { buildLectureNotesPrompt } from '../../src/lib/promptBuilders'
import { DB_SCHEMA, MIGRATIONS_SQL, createLecture, getLectureById } from '../../src/lib/db'
import { LectureNotesService } from '../../electron/ipc/lectureNotesService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('LectureNotesService & PromptBuilder', () => {
  let db: any

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')

    const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
    for (const statement of statements) {
      db.exec(statement + ';')
    }
    for (const migration of MIGRATIONS_SQL) {
      try { db.exec(migration) } catch { /* ignore */ }
    }

    db.prepare('INSERT INTO users (name) VALUES (?)').run('Test Student')
    db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(1, 'Neurobiology', 'active')
  })

  afterEach(() => {
    db.close()
  })

  test('buildLectureNotesPrompt constructs rich markdown prompt with all sections', () => {
    const transcript = '[00:00] Today we talk about the resting potential of neurons.'
    const prompt = buildLectureNotesPrompt(transcript, 'Neurobiology', 'Resting Potential')

    expect(prompt).toContain('Neurobiology')
    expect(prompt).toContain('Resting Potential')
    expect(prompt).toContain('Executive Summary')
    expect(prompt).toContain('Key Concepts, Definitions & Formulas')
    expect(prompt).toContain('Detailed Chronological Notes')
    expect(prompt).toContain('Potential Exam Questions')
    expect(prompt).toContain('<details>')
    expect(prompt).toContain(transcript)
  })

  test('synthesizes lecture notes and registers class material', async () => {
    const lecture = createLecture(db, {
      subject_id: 1,
      title: 'Action Potentials',
      audio_path: '/dummy/path.webm',
      status: 'recorded'
    })

    // Mock AI generator function
    const mockGenerateNotes = jest.fn().mockResolvedValue(
      '# 📚 Neurobiology: Action Potentials\n\n## 🎯 Executive Summary\nAction potentials allow rapid signal transmission.\n\n## 🔑 Key Concepts\n- **Depolarization**: Voltage spikes.'
    )

    LectureNotesService.init(db, {
      generateNotesFn: mockGenerateNotes,
      transcribeFn: jest.fn().mockResolvedValue({
        text: 'Action potentials allow rapid signal transmission.',
        timestampedText: '[00:00] Action potentials allow rapid signal transmission.',
        durationSeconds: 1200
      })
    })

    const result = await LectureNotesService.processLecture(lecture.id)
    expect(result.success).toBe(true)
    expect(result.materialId).toBeDefined()

    const updatedLecture = getLectureById(db, lecture.id)
    expect(updatedLecture?.status).toBe('ready')
    expect(updatedLecture?.material_id).toBe(result.materialId)
    expect(updatedLecture?.raw_transcript).toContain('Action potentials')

    // Verify material row created
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.materialId)
    expect(material).not.toBeNull()
    expect(material.filename).toBe('Lecture - Action Potentials.md')
    expect(material.file_type).toBe('md')
    expect(material.content_text).toContain('Executive Summary')
  })
})
