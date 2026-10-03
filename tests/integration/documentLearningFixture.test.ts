import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import JSZip from 'jszip'

jest.mock('../../electron/ipc/documentParser', () => ({
  parseFileToText: jest.fn(async (filePath: string) => {
    const extension = path.extname(filePath).slice(1).toLowerCase()
    const fileType = extension === 'markdown' ? 'md' : extension
    return { fileType, contentText: `Fixture content for ${path.basename(filePath)}` }
  })
}))

import { FolderSyncService, sha256File } from '../../electron/ipc/folderSyncService'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const statement of DB_SCHEMA.split(';').map((value) => value.trim()).filter(Boolean)) db.exec(`${statement};`)
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* already applied by the base schema */ }
  }
  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Fixture User')").run()
  return db
}

async function writeEpub(filePath: string): Promise<void> {
  const zip = new JSZip()
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
  zip.file('OPS/package.opf', '<package><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
  zip.file('OPS/chapter.xhtml', '<html><body><h1>Fixture chapter</h1><p>EPUB content.</p></body></html>')
  fs.writeFileSync(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
}

describe('document learning linked-folder fixture', () => {
  let fixtureDir: string
  let db: any

  beforeEach(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-learning-fixture-'))
    db = createDatabase()
    db.prepare(`INSERT INTO subjects (id, user_id, name, status, linked_folder_path) VALUES (1, 1, 'Fixture Class', 'active', ?)`).run(fixtureDir)
    fs.writeFileSync(path.join(fixtureDir, 'reading.pdf'), '%PDF fixture bytes')
    fs.writeFileSync(path.join(fixtureDir, 'lecture.pptx'), Buffer.from('pptx fixture bytes'))
    fs.copyFileSync(path.join(process.cwd(), 'node_modules/mammoth/test/test-data/tables.docx'), path.join(fixtureDir, 'notes.docx'))
    fs.writeFileSync(path.join(fixtureDir, 'notes.md'), '# Notes\nA = b + c')
    fs.writeFileSync(path.join(fixtureDir, 'transcript.txt'), 'Lecture transcript fixture')
    fs.writeFileSync(path.join(fixtureDir, 'diagram.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    fs.writeFileSync(path.join(fixtureDir, 'photo.jpeg'), Buffer.from([255, 216, 255, 224]))
    await writeEpub(path.join(fixtureDir, 'book.epub'))
    FolderSyncService.stopAllWatchers()
  })

  afterEach(() => {
    FolderSyncService.stopAllWatchers()
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('syncs every requested material type, records content identity, and never mutates sources', async () => {
    const sourcePaths = fs.readdirSync(fixtureDir).map((name) => path.join(fixtureDir, name))
    const before = new Map<string, string>()
    for (const sourcePath of sourcePaths) before.set(sourcePath, await sha256File(sourcePath))

    const result = await FolderSyncService.scanAndSync(db, 1, fixtureDir)
    expect(result).toMatchObject({ success: true, addedCount: 8, updatedCount: 0 })

    const materials = db.prepare('SELECT filename, file_type, file_path, file_sha256, relative_path FROM materials WHERE subject_id = 1 ORDER BY filename').all() as any[]
    expect(materials.map((row) => row.file_type).sort()).toEqual(['docx', 'epub', 'jpeg', 'md', 'png', 'pptx', 'pdf', 'txt'].sort())
    for (const material of materials) {
      expect(material.file_path).toBe(path.join(fixtureDir, material.filename))
      expect(material.relative_path).toBe(material.filename)
      expect(material.file_sha256).toBe(before.get(material.file_path))
    }

    for (const sourcePath of sourcePaths) expect(await sha256File(sourcePath)).toBe(before.get(sourcePath))
  })

  it('re-ingests a same-size source edit when the mtime is preserved', async () => {
    await FolderSyncService.scanAndSync(db, 1, fixtureDir)
    const sourcePath = path.join(fixtureDir, 'notes.md')
    const originalStat = fs.statSync(sourcePath)
    fs.writeFileSync(sourcePath, '# Notes\nA = d + e')
    fs.utimesSync(sourcePath, originalStat.atime, originalStat.mtime)

    const result = await FolderSyncService.scanAndSync(db, 1, fixtureDir)
    expect(result.updatedCount).toBe(1)
    const material = db.prepare("SELECT file_sha256 FROM materials WHERE filename = 'notes.md'").get() as any
    expect(material.file_sha256).toBe(createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'))
  })
})
