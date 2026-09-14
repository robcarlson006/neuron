import fs from 'fs'
import path from 'path'
import os from 'os'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { LectureAudioService } from '../../electron/ipc/lectureAudioService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('LectureAudioService', () => {
  let db: any
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-rec-test-'))
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
    db.prepare('INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)').run(1, 'Biology', 'active')

    LectureAudioService.init(db, tempDir)
  })

  afterEach(() => {
    db.close()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  test('starts recording and appends audio chunks to file', async () => {
    const session = LectureAudioService.startRecording(1, 'Cellular Respiration')
    expect(session.sessionId).toBeDefined()
    expect(session.lectureId).toBeDefined()
    expect(fs.existsSync(session.audioPath)).toBe(true)

    // Append two chunks
    const chunk1 = Buffer.from('RIFF mock audio data 1')
    const chunk2 = Buffer.from(' mock audio data 2')
    LectureAudioService.appendChunk(session.sessionId, chunk1)
    LectureAudioService.appendChunk(session.sessionId, chunk2)

    const finalized = await LectureAudioService.finalizeRecording(session.sessionId, 120)
    expect(finalized.lectureId).toBe(session.lectureId)
    expect(finalized.fileSizeBytes).toBe(chunk1.length + chunk2.length)

    const diskContent = fs.readFileSync(finalized.audioPath)
    expect(diskContent.toString()).toBe('RIFF mock audio data 1 mock audio data 2')

    const lecture = LectureAudioService.getLecture(session.lectureId)
    expect(lecture?.status).toBe('recorded')
    expect(lecture?.duration_seconds).toBe(120)
    expect(lecture?.file_size_bytes).toBe(chunk1.length + chunk2.length)
  })

  test('aborts recording and cleans up partial file from disk', async () => {
    const session = LectureAudioService.startRecording(1, 'Discarded Lecture')
    LectureAudioService.appendChunk(session.sessionId, Buffer.from('partial audio'))

    expect(fs.existsSync(session.audioPath)).toBe(true)

    await LectureAudioService.abortRecording(session.sessionId)

    expect(fs.existsSync(session.audioPath)).toBe(false)
    expect(LectureAudioService.getLecture(session.lectureId)).toBeNull()
  })

  test('deletes lecture and associated audio file', async () => {
    const session = LectureAudioService.startRecording(1, 'To Delete')
    LectureAudioService.appendChunk(session.sessionId, Buffer.from('audio bytes'))
    const finalized = await LectureAudioService.finalizeRecording(session.sessionId, 60)

    expect(fs.existsSync(finalized.audioPath)).toBe(true)

    await LectureAudioService.deleteLecture(finalized.lectureId, true)

    expect(fs.existsSync(finalized.audioPath)).toBe(false)
    expect(LectureAudioService.getLecture(finalized.lectureId)).toBeNull()
  })
})
