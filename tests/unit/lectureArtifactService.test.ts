import fs from 'fs'
import os from 'os'
import path from 'path'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { exportLectureArtifacts } from '../../electron/ipc/lectureArtifactService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('lecture linked-folder artifacts', () => {
  it('writes transcript and Cornell notes into the hidden linked-folder sidecar', () => {
    const db = new DatabaseSync(':memory:')
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-lecture-artifacts-'))
    try {
      for (const statement of DB_SCHEMA.split(';').map((item) => item.trim()).filter(Boolean)) db.exec(`${statement};`)
      for (const migration of MIGRATIONS_SQL) {
        try { db.exec(migration) } catch { /* already applied */ }
      }
      db.prepare("INSERT INTO users (id, name) VALUES (1, 'Student')").run()
      db.prepare("INSERT INTO subjects (id, user_id, name, status, linked_folder_path) VALUES (1, 1, 'Biology', 'active', ?)").run(outputRoot)
      db.prepare("INSERT INTO materials (id, subject_id, filename, file_type, content_text) VALUES (7, 1, 'Lecture - Cell Membrane.md', 'md', ?)").run('## Key ideas\n\n- Selective permeability')
      db.prepare("INSERT INTO lectures (id, subject_id, title, audio_path, raw_transcript, material_id) VALUES (1, 1, 'Cell Membrane / Lecture', '/tmp/lecture.webm', ?, 7)").run('[00:01] Membranes regulate transport.')
      db.prepare("INSERT INTO document_annotations (subject_id, lecture_id, kind, body) VALUES (1, 1, 'question', 'Why does diffusion stop at equilibrium?')").run()

      const result = exportLectureArtifacts(db, 1, '## Key ideas\n\n- Selective permeability')
      expect(result).not.toBeNull()
      expect(result?.transcriptPath).toContain(path.join('.neuron', 'lectures'))
      expect(fs.readFileSync(result!.transcriptPath, 'utf8')).toContain('Membranes regulate transport.')
      expect(fs.readFileSync(result!.notesPath, 'utf8')).toContain('Why does diffusion stop at equilibrium?')
      // Annotation saves re-export the artifact without passing generatedNotes;
      // the linked material must keep the AI-generated section intact.
      const refreshed = exportLectureArtifacts(db, 1)
      expect(fs.readFileSync(refreshed!.notesPath, 'utf8')).toContain('Selective permeability')
      expect(fs.readFileSync(refreshed!.notesPath, 'utf8')).toContain('Why does diffusion stop at equilibrium?')
      expect(fs.readdirSync(outputRoot)).toEqual(['.neuron'])
    } finally {
      db.close()
      fs.rmSync(outputRoot, { recursive: true, force: true })
    }
  })

  it('does not write outside the linked folder when no folder is linked', () => {
    const db = new DatabaseSync(':memory:')
    try {
      for (const statement of DB_SCHEMA.split(';').map((item) => item.trim()).filter(Boolean)) db.exec(`${statement};`)
      for (const migration of MIGRATIONS_SQL) {
        try { db.exec(migration) } catch { /* already applied */ }
      }
      db.prepare("INSERT INTO users (id, name) VALUES (1, 'Student')").run()
      db.prepare("INSERT INTO subjects (id, user_id, name, status) VALUES (1, 1, 'Biology', 'active')").run()
      db.prepare("INSERT INTO lectures (id, subject_id, title, audio_path) VALUES (1, 1, 'Lecture', '/tmp/lecture.webm')").run()
      expect(exportLectureArtifacts(db, 1)).toBeNull()
    } finally {
      db.close()
    }
  })
})
