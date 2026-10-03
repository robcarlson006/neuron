import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import {
  registerAnnotationHandlers,
  setAnnotationDatabase
} from '../../electron/ipc/annotationHandlers'
import fs from 'fs'
import os from 'os'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

const registeredHandlers = new Map<string, Function>()

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: Function) => {
      registeredHandlers.set(channel, handler)
    })
  }
}))

function createFreshDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) db.exec(statement + ';')
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* already applied */ }
  }
  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Student')").run()
  db.prepare("INSERT INTO subjects (id, user_id, name, status) VALUES (1, 1, 'Biology', 'active')").run()
  db.prepare("INSERT INTO materials (id, subject_id, filename, file_type, content_text) VALUES (1, 1, 'Lecture 1.pdf', 'pdf', 'Action potentials')").run()
  db.prepare("INSERT INTO lectures (id, subject_id, title, audio_path) VALUES (1, 1, 'Lecture 1', '/tmp/lecture.webm')").run()
  return db
}

describe('persistent document annotation handlers', () => {
  let db: any

  beforeEach(() => {
    registeredHandlers.clear()
    db = createFreshDatabase()
    setAnnotationDatabase(db)
    registerAnnotationHandlers()
  })

  afterEach(() => db.close())

  it('persists a material highlight and a linked comment', async () => {
    const save = registeredHandlers.get('annotations:save')!
    const list = registeredHandlers.get('annotations:list')!

    const highlight = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'highlight',
      color: '#facc15',
      body: '',
      selected_text: 'Action potentials',
      locator: { page: 4, startOffset: 10, endOffset: 27, quote: 'Action potentials' },
      source_snapshot: 'Action potentials propagate along the axon.',
      source_hash: 'source-v1'
    })
    expect(highlight.id).toBeDefined()
    expect(highlight.locator_json).toContain('"page":4')

    const comment = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'comment',
      parent_id: highlight.id,
      body: 'Why does the refractory period matter?',
      selected_text: 'Action potentials',
      locator: { page: 4, quote: 'Action potentials' }
    })
    expect(comment.parent_id).toBe(highlight.id)

    const annotations = await list({}, { materialId: 1 })
    expect(annotations).toHaveLength(2)
    expect(annotations.map((item: any) => item.kind)).toEqual(['highlight', 'comment'])
  })

  it('recovers annotations after the SQLite database is closed and reopened', async () => {
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-annotation-restart-'))
    const databasePath = path.join(storageDir, 'neuron.sqlite')
    let diskDb: any
    let reopenedDb: any
    try {
      diskDb = new DatabaseSync(databasePath)
      diskDb.exec('PRAGMA foreign_keys = ON')
      const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
      for (const statement of statements) diskDb.exec(statement + ';')
      for (const migration of MIGRATIONS_SQL) {
        try { diskDb.exec(migration) } catch { /* already applied */ }
      }
      diskDb.prepare("INSERT INTO users (id, name) VALUES (1, 'Student')").run()
      diskDb.prepare("INSERT INTO subjects (id, user_id, name, status) VALUES (1, 1, 'Biology', 'active')").run()
      diskDb.prepare("INSERT INTO materials (id, subject_id, filename, file_type, content_text) VALUES (1, 1, 'Lecture 1.pdf', 'pdf', 'Action potentials')").run()
      setAnnotationDatabase(diskDb)
      registerAnnotationHandlers()

      const save = registeredHandlers.get('annotations:save')!
      await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'highlight',
        color: '#bfdbfe',
        body: '',
        selected_text: 'Action potentials',
        locator: { page: 4, startOffset: 10, endOffset: 27, quote: 'Action potentials' },
        source_snapshot: 'Action potentials propagate along the axon.',
        source_hash: 'source-v1'
      })
      const savedHighlight = await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'highlight',
        color: '#facc15',
        body: '',
        selected_text: 'Action potentials',
        locator: { page: 4, quote: 'Action potentials' },
        source_snapshot: 'Action potentials propagate along the axon.',
        source_hash: 'source-v1'
      })
      await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'comment',
        parent_id: savedHighlight.id,
        body: 'Why does the refractory period matter?',
        selected_text: 'Action potentials',
        locator: { page: 4, quote: 'Action potentials' }
      })
      await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'cue',
        body: 'Refractory period and signal direction',
        locator: { page: 4 }
      })
      await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'question',
        body: 'Why does the refractory period matter?',
        locator: { page: 4 }
      })
      await save({}, {
        subject_id: 1,
        material_id: 1,
        kind: 'summary',
        body: 'Action potentials propagate along the axon and the refractory period controls direction.',
        locator: { page: 4 }
      })
      diskDb.close()
      diskDb = null

      reopenedDb = new DatabaseSync(databasePath)
      setAnnotationDatabase(reopenedDb)
      registerAnnotationHandlers()
      const annotations = await registeredHandlers.get('annotations:list')!({}, { materialId: 1 })
      expect(annotations).toHaveLength(6)
      expect(annotations.map((annotation: any) => annotation.kind)).toEqual(['highlight', 'highlight', 'comment', 'cue', 'question', 'summary'])
      expect(annotations).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'highlight', selected_text: 'Action potentials', color: '#bfdbfe' }),
        expect.objectContaining({ kind: 'comment', body: 'Why does the refractory period matter?' }),
        expect.objectContaining({ kind: 'cue', body: 'Refractory period and signal direction' }),
        expect.objectContaining({ kind: 'question', body: 'Why does the refractory period matter?' }),
        expect.objectContaining({ kind: 'summary', body: 'Action potentials propagate along the axon and the refractory period controls direction.' })
      ]))
      expect(JSON.parse(annotations.find((annotation: any) => annotation.color === '#bfdbfe').locator_json)).toEqual(expect.objectContaining({ page: 4, startOffset: 10, endOffset: 27 }))
    } finally {
      try { diskDb?.close() } catch { /* already closed */ }
      try { reopenedDb?.close() } catch { /* already closed */ }
      fs.rmSync(storageDir, { recursive: true, force: true })
    }
  })

  it('rejects cross-subject resources and preserves deleted records for restore', async () => {
    db.prepare("INSERT INTO users (id, name) VALUES (2, 'Other')").run()
    db.prepare("INSERT INTO subjects (id, user_id, name, status) VALUES (2, 2, 'Chemistry', 'active')").run()
    db.prepare("INSERT INTO materials (id, subject_id, filename, file_type, content_text) VALUES (2, 2, 'Chemistry.pdf', 'pdf', 'Acids')").run()

    const save = registeredHandlers.get('annotations:save')!
    expect(() => save({}, {
      subject_id: 1,
      material_id: 2,
      kind: 'cue',
      body: 'Should be rejected'
    })).toThrow('does not belong to the selected subject')

    const annotation = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'question',
      body: 'What changes at threshold?'
    })
    const remove = registeredHandlers.get('annotations:delete')!
    const restore = registeredHandlers.get('annotations:restore')!
    const list = registeredHandlers.get('annotations:list')!

    expect(await remove({}, annotation.id)).toEqual({ success: true })
    expect(await list({}, { materialId: 1 })).toHaveLength(0)
    expect(await list({}, { materialId: 1, includeDeleted: true })).toHaveLength(1)
    expect(await restore({}, annotation.id)).toEqual({ success: true })
    expect(await list({}, { materialId: 1 })).toHaveLength(1)
  })

  it('refreshes linked lecture notes when an annotation is deleted or restored', async () => {
    const linkedFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-annotation-export-'))
    try {
      db.prepare('UPDATE subjects SET linked_folder_path = ? WHERE id = 1').run(linkedFolder)
      const save = registeredHandlers.get('annotations:save')!
      const remove = registeredHandlers.get('annotations:delete')!
      const restore = registeredHandlers.get('annotations:restore')!
      const annotation = await save({}, {
        subject_id: 1,
        lecture_id: 1,
        kind: 'question',
        body: 'Why does diffusion stop?'
      })
      const notesPath = path.join(linkedFolder, '.neuron', 'lectures', 'Lecture 1-1.notes.md')
      expect(fs.readFileSync(notesPath, 'utf8')).toContain('Why does diffusion stop?')

      await remove({}, annotation.id)
      expect(fs.readFileSync(notesPath, 'utf8')).not.toContain('Why does diffusion stop?')

      await restore({}, annotation.id)
      expect(fs.readFileSync(notesPath, 'utf8')).toContain('Why does diffusion stop?')
    } finally {
      fs.rmSync(linkedFolder, { recursive: true, force: true })
    }
  })

  it('cascades source removal without leaving orphaned annotations', async () => {
    const save = registeredHandlers.get('annotations:save')!
    const list = registeredHandlers.get('annotations:list')!
    const annotation = await save({}, {
      subject_id: 1,
      lecture_id: 1,
      kind: 'summary',
      body: 'Summarize after the lecture.'
    })
    expect(annotation.id).toBeDefined()

    db.prepare('DELETE FROM lectures WHERE id = 1').run()
    expect(await list({}, { lectureId: 1, includeDeleted: true })).toHaveLength(0)
  })

  it('marks a highlight for review when its source quote disappears', async () => {
    const save = registeredHandlers.get('annotations:save')!
    const reconcile = registeredHandlers.get('annotations:reconcileMaterial')!
    const highlight = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'highlight',
      body: '',
      selected_text: 'Action potentials',
      locator: { page: 1, quote: 'Action potentials' },
      source_snapshot: 'Action potentials propagate along the axon.',
      source_hash: 'old'
    })

    db.prepare("UPDATE materials SET content_text = 'The cell membrane maintains a gradient.' WHERE id = 1").run()
    const rows = await reconcile({}, 1)
    const updated = rows.find((row: any) => row.id === highlight.id)
    expect(updated?.locator_status).toBe('needs_review')
  })

  it('keeps a rectangle-only visual highlight resolved until its source changes', async () => {
    db.prepare("UPDATE materials SET file_mtime = 100, file_size = 10, file_sha256 = 'pdf-content-v1', file_type = 'pdf', content_text = 'A scanned diagram page.' WHERE id = 1").run()
    const save = registeredHandlers.get('annotations:save')!
    const reconcile = registeredHandlers.get('annotations:reconcileMaterial')!
    const highlight = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'highlight',
      body: '',
      selected_text: 'Visual region on Page 1',
      locator: { page: 1, quote: 'Visual region on Page 1', rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }] },
      source_snapshot: 'A scanned diagram page.',
      source_hash: 'pdf-content-v1'
    })

    let rows = await reconcile({}, 1)
    expect(rows.find((row: any) => row.id === highlight.id)?.locator_status).toBe('resolved')

    db.prepare("UPDATE materials SET file_size = 11, file_sha256 = 'pdf-content-v2' WHERE id = 1").run()
    rows = await reconcile({}, 1)
    expect(rows.find((row: any) => row.id === highlight.id)?.locator_status).toBe('needs_review')
  })

  it('remaps a recovered highlight to its new slide marker', async () => {
    db.prepare("UPDATE materials SET file_type = 'pptx', content_text = '--- Slide 1 ---\\nOpening\\n\\n--- Slide 2 ---\\nThe membrane potential changes.' WHERE id = 1").run()
    const save = registeredHandlers.get('annotations:save')!
    const reconcile = registeredHandlers.get('annotations:reconcileMaterial')!
    const highlight = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'highlight',
      body: '',
      selected_text: 'The membrane potential changes.',
      locator: { slide: 2, quote: 'The membrane potential changes.' },
      source_snapshot: '--- Slide 2 ---\\nThe membrane potential changes.',
      source_hash: 'slide-deck-v1'
    })

    db.prepare("UPDATE materials SET content_text = '--- Slide 1 ---\\nOpening\\n\\n--- Slide 2 ---\\nDiscussion\\n\\n--- Slide 3 ---\\nThe membrane potential changes.' WHERE id = 1").run()
    const rows = await reconcile({}, 1)
    const updated = rows.find((row: any) => row.id === highlight.id)
    expect(updated?.locator_status).toBe('resolved')
    expect(JSON.parse(updated.locator_json).slide).toBe(3)
  })

  it('remaps a recovered highlight to its new PDF page marker', async () => {
    db.prepare("UPDATE materials SET file_type = 'pdf', content_text = '--- Page 1 ---\\nIntro\\n\\n--- Page 2 ---\\nThe membrane potential changes.' WHERE id = 1").run()
    const save = registeredHandlers.get('annotations:save')!
    const reconcile = registeredHandlers.get('annotations:reconcileMaterial')!
    const highlight = await save({}, {
      subject_id: 1,
      material_id: 1,
      kind: 'highlight',
      body: '',
      selected_text: 'The membrane potential changes.',
      locator: { page: 2, quote: 'The membrane potential changes.' },
      source_snapshot: '--- Page 2 ---\\nThe membrane potential changes.',
      source_hash: 'pdf-v1'
    })

    db.prepare("UPDATE materials SET content_text = '--- Page 1 ---\\nIntro\\n\\n--- Page 2 ---\\nDiscussion\\n\\n--- Page 3 ---\\nThe membrane potential changes.' WHERE id = 1").run()
    const rows = await reconcile({}, 1)
    const updated = rows.find((row: any) => row.id === highlight.id)
    expect(updated?.locator_status).toBe('resolved')
    expect(JSON.parse(updated.locator_json).page).toBe(3)
  })
})
