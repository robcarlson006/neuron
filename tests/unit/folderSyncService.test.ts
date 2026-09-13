import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  FolderSyncService,
  isSupportedFile,
  getRelativePath,
  scanDirectory,
  SUPPORTED_EXTENSIONS
} from '../../electron/ipc/folderSyncService'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createFreshDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  for (const migration of MIGRATIONS_SQL) {
    try {
      db.exec(migration)
    } catch {
      /* column may already exist */
    }
  }

  // Insert default test user
  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()

  return db
}

describe('FolderSyncService', () => {
  let tempDir: string
  let db: any

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuron-sync-test-'))
    db = createFreshDatabase()
    FolderSyncService.stopAllWatchers()
  })

  afterEach(() => {
    FolderSyncService.stopAllWatchers()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* ignore cleanup error */
    }
  })

  describe('isSupportedFile', () => {
    it('accepts supported file formats', () => {
      expect(isSupportedFile('document.pdf')).toBe(true)
      expect(isSupportedFile('DOCUMENT.PDF')).toBe(true)
      expect(isSupportedFile('lecture.docx')).toBe(true)
      expect(isSupportedFile('legacy.doc')).toBe(true)
      expect(isSupportedFile('slides.pptx')).toBe(true)
      expect(isSupportedFile('slides.ppt')).toBe(true)
      expect(isSupportedFile('notes.txt')).toBe(true)
      expect(isSupportedFile('readme.md')).toBe(true)
      expect(isSupportedFile('guide.markdown')).toBe(true)
      expect(isSupportedFile('doc.rtf')).toBe(true)
      expect(isSupportedFile('index.html')).toBe(true)
      expect(isSupportedFile('data.csv')).toBe(true)
    })

    it('rejects hidden and system files', () => {
      expect(isSupportedFile('.DS_Store')).toBe(false)
      expect(isSupportedFile('.git')).toBe(false)
      expect(isSupportedFile('.hidden.pdf')).toBe(false)
      expect(isSupportedFile('._lecture.pdf')).toBe(false)
    })

    it('rejects temporary Office lock files', () => {
      expect(isSupportedFile('~$test.docx')).toBe(false)
      expect(isSupportedFile('~$slides.pptx')).toBe(false)
      expect(isSupportedFile('~$notes.doc')).toBe(false)
    })

    it('rejects unsupported extensions and download temp files', () => {
      expect(isSupportedFile('photo.png')).toBe(false)
      expect(isSupportedFile('image.jpg')).toBe(false)
      expect(isSupportedFile('archive.zip')).toBe(false)
      expect(isSupportedFile('script.js')).toBe(false)
      expect(isSupportedFile('program.py')).toBe(false)
      expect(isSupportedFile('download.crdownload')).toBe(false)
      expect(isSupportedFile('file.pdf.tmp')).toBe(false)
      expect(isSupportedFile('file.download')).toBe(false)
    })
  })

  describe('getRelativePath', () => {
    it('returns normalized relative path with forward slashes', () => {
      const baseDir = path.join('Users', 'test', 'Course')
      const filePath = path.join('Users', 'test', 'Course', 'Week 1', 'lecture.pdf')
      const result = getRelativePath(baseDir, filePath)
      expect(result).toBe('Week 1/lecture.pdf')
    })

    it('handles files directly in root folder', () => {
      const baseDir = path.join('Users', 'test', 'Course')
      const filePath = path.join('Users', 'test', 'Course', 'syllabus.pdf')
      const result = getRelativePath(baseDir, filePath)
      expect(result).toBe('syllabus.pdf')
    })

    it('handles deeply nested subdirectories', () => {
      const baseDir = path.join('Users', 'test', 'Course')
      const filePath = path.join('Users', 'test', 'Course', 'Modules', 'Unit 1', 'Sub', 'notes.md')
      const result = getRelativePath(baseDir, filePath)
      expect(result).toBe('Modules/Unit 1/Sub/notes.md')
    })
  })

  describe('scanDirectory', () => {
    it('recursively discovers supported files in nested folders', () => {
      // Create folder structure
      const subDir = path.join(tempDir, 'Week 1')
      const nestedDir = path.join(subDir, 'Slides')
      const hiddenDir = path.join(tempDir, '.hidden')
      fs.mkdirSync(nestedDir, { recursive: true })
      fs.mkdirSync(hiddenDir, { recursive: true })

      // Create files
      fs.writeFileSync(path.join(tempDir, 'syllabus.pdf'), 'Syllabus content')
      fs.writeFileSync(path.join(tempDir, 'notes.md'), 'Notes content')
      fs.writeFileSync(path.join(tempDir, '.DS_Store'), 'junk')
      fs.writeFileSync(path.join(tempDir, '~$lock.docx'), 'lock')
      fs.writeFileSync(path.join(tempDir, 'image.png'), 'image data')

      fs.writeFileSync(path.join(subDir, 'lecture.docx'), 'Lecture content')
      fs.writeFileSync(path.join(nestedDir, 'presentation.pptx'), 'Presentation content')
      fs.writeFileSync(path.join(hiddenDir, 'secret.pdf'), 'Secret content')

      const discovered = scanDirectory(tempDir)
      const relPaths = discovered.map((p: string) => getRelativePath(tempDir, p)).sort()

      expect(relPaths).toEqual([
        'Week 1/Slides/presentation.pptx',
        'Week 1/lecture.docx',
        'notes.md',
        'syllabus.pdf'
      ].sort())
    })

    it('returns empty array if directory does not exist', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist')
      expect(scanDirectory(nonExistent)).toEqual([])
    })

    it('respects maxDepth limit', () => {
      const deepPath = path.join(tempDir, 'd1', 'd2', 'd3', 'd4')
      fs.mkdirSync(deepPath, { recursive: true })
      fs.writeFileSync(path.join(deepPath, 'deep.txt'), 'Deep file')

      const shallowScan = scanDirectory(tempDir, 2)
      expect(shallowScan).toEqual([])

      const fullScan = scanDirectory(tempDir, 5)
      expect(fullScan.length).toBe(1)
    })
  })

  describe('scanAndSync (Safe Sync)', () => {
    it('adds new files to the database with parsed content and metadata', async () => {
      // Insert test subject
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      // Create test files
      const week1Dir = path.join(tempDir, 'Week 1')
      fs.mkdirSync(week1Dir, { recursive: true })
      fs.writeFileSync(path.join(tempDir, 'syllabus.md'), '# Course Syllabus\nBiology 101')
      fs.writeFileSync(path.join(week1Dir, 'cell_biology.txt'), 'Cells are the basic unit of life.')

      const mockSend = jest.fn()
      const mockWin = {
        isDestroyed: () => false,
        webContents: { send: mockSend }
      }
      FolderSyncService.init(db, () => mockWin as any)

      const result = await FolderSyncService.scanAndSync(db, 1, tempDir)

      expect(result.success).toBe(true)
      expect(result.addedCount).toBe(2)
      expect(result.updatedCount).toBe(0)

      // Verify materials table rows
      const materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1 ORDER BY filename ASC').all() as any[]
      expect(materials.length).toBe(2)

      const txtMat = materials.find((m) => m.filename === 'cell_biology.txt')
      expect(txtMat).toBeDefined()
      expect(txtMat.file_type).toBe('txt')
      expect(txtMat.content_text).toContain('Cells are the basic unit of life.')
      expect(txtMat.relative_path).toBe('Week 1/cell_biology.txt')
      expect(txtMat.file_size).toBeGreaterThan(0)
      expect(txtMat.file_mtime).toBeGreaterThan(0)

      const mdMat = materials.find((m) => m.filename === 'syllabus.md')
      expect(mdMat).toBeDefined()
      expect(mdMat.file_type).toBe('md')
      expect(mdMat.content_text).toContain('# Course Syllabus')
      expect(mdMat.relative_path).toBe('syllabus.md')

      // Verify subject updated
      const subject = db.prepare('SELECT * FROM subjects WHERE id = 1').get() as any
      expect(subject.folder_sync_status).toBe('idle')
      expect(subject.folder_last_synced_at).toBeTruthy()

      // Verify IPC event sent to window
      expect(mockSend).toHaveBeenCalledWith(
        'folder:sync-event',
        expect.objectContaining({
          subjectId: 1,
          added: expect.arrayContaining(['syllabus.md', 'Week 1/cell_biology.txt']),
          updated: []
        })
      )
    })

    it('detects modified files and updates content without creating duplicates', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      const filePath = path.join(tempDir, 'notes.txt')
      fs.writeFileSync(filePath, 'Initial notes content')

      await FolderSyncService.scanAndSync(db, 1, tempDir)

      // Initial check
      let materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(materials.length).toBe(1)
      expect(materials[0].content_text).toBe('Initial notes content')
      const initialMtime = materials[0].file_mtime

      // Modify file and touch mtime
      fs.writeFileSync(filePath, 'Updated notes content with more info')
      const futureTime = new Date(Date.now() + 2000)
      fs.utimesSync(filePath, futureTime, futureTime)

      const updateResult = await FolderSyncService.scanAndSync(db, 1, tempDir)

      expect(updateResult.success).toBe(true)
      expect(updateResult.addedCount).toBe(0)
      expect(updateResult.updatedCount).toBe(1)

      materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(materials.length).toBe(1) // No duplicate row created
      expect(materials[0].content_text).toBe('Updated notes content with more info')
      expect(materials[0].file_mtime).toBeGreaterThan(initialMtime)
    })

    it('skips files when mtime and size are unchanged', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      fs.writeFileSync(path.join(tempDir, 'static.txt'), 'Static content')

      const res1 = await FolderSyncService.scanAndSync(db, 1, tempDir)
      expect(res1.addedCount).toBe(1)

      const res2 = await FolderSyncService.scanAndSync(db, 1, tempDir)
      expect(res2.addedCount).toBe(0)
      expect(res2.updatedCount).toBe(0)
    })

    it('preserves database records when files are deleted on disk (Safe Sync)', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      const filePath = path.join(tempDir, 'to_delete.txt')
      fs.writeFileSync(filePath, 'Important study material')

      await FolderSyncService.scanAndSync(db, 1, tempDir)

      // Confirm added
      const beforeDelete = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(beforeDelete.length).toBe(1)

      // Delete file on disk
      fs.unlinkSync(filePath)

      // Sync again
      const syncAfterDelete = await FolderSyncService.scanAndSync(db, 1, tempDir)
      expect(syncAfterDelete.success).toBe(true)
      expect(syncAfterDelete.addedCount).toBe(0)
      expect(syncAfterDelete.updatedCount).toBe(0)

      // Material should still exist in database!
      const afterDelete = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(afterDelete.length).toBe(1)
      expect(afterDelete[0].filename).toBe('to_delete.txt')
      expect(afterDelete[0].content_text).toBe('Important study material')
    })

    it('handles non-existent folder by recording error status', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run('/non/existent/path/12345')

      const result = await FolderSyncService.scanAndSync(db, 1, '/non/existent/path/12345')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()

      const subject = db.prepare('SELECT folder_sync_status FROM subjects WHERE id = 1').get() as any
      expect(subject.folder_sync_status).toBe('error')
    })
  })

  describe('Watcher and Service Lifecycle', () => {
    it('manages watchers via startWatching, getStatus, stopWatching, and stopAllWatchers', () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      FolderSyncService.init(db, () => null)

      expect(FolderSyncService.getStatus(1).isWatching).toBe(false)

      FolderSyncService.startWatching(1, tempDir)
      expect(FolderSyncService.getStatus(1).isWatching).toBe(true)

      FolderSyncService.stopWatching(1)
      expect(FolderSyncService.getStatus(1).isWatching).toBe(false)

      FolderSyncService.startWatching(1, tempDir)
      FolderSyncService.stopAllWatchers()
      expect(FolderSyncService.getStatus(1).isWatching).toBe(false)
    })

    it('init sweeps existing linked subjects and sets up watchers', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      fs.writeFileSync(path.join(tempDir, 'init_notes.txt'), 'Notes created before boot')

      await FolderSyncService.init(db, () => null)

      // Watcher should be active
      expect(FolderSyncService.getStatus(1).isWatching).toBe(true)

      // File should have been ingested during startup sweep
      const materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(materials.length).toBe(1)
      expect(materials[0].filename).toBe('init_notes.txt')
    })

    it('continues syncing other files if one file parsing fails', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      // Valid text file
      fs.writeFileSync(path.join(tempDir, 'valid.txt'), 'Valid content')
      // Corrupt PDF (invalid binary header that will fail or trigger error)
      fs.writeFileSync(path.join(tempDir, 'corrupt.pdf'), 'NOT A VALID PDF HEADER')

      const result = await FolderSyncService.scanAndSync(db, 1, tempDir)

      expect(result.success).toBe(true)
      // Even if corrupt.pdf fails or falls back, valid.txt is definitely ingested
      const materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      const validMat = materials.find((m) => m.filename === 'valid.txt')
      expect(validMat).toBeDefined()
      expect(validMat.content_text).toContain('Valid content')
    })

    it('triggers debounced sync when files are modified while watching', async () => {
      db.prepare(`
        INSERT INTO subjects (id, user_id, name, status, linked_folder_path)
        VALUES (1, 1, 'Biology 101', 'active', ?)
      `).run(tempDir)

      await FolderSyncService.init(db, () => null)

      // Write a file to trigger watcher
      fs.writeFileSync(path.join(tempDir, 'watch_test.txt'), 'Created during watch')

      // Wait 2200ms for the 1500ms debounce to fire cleanly even under full parallel suite load
      await new Promise((resolve) => setTimeout(resolve, 2200))

      const materials = db.prepare('SELECT * FROM materials WHERE subject_id = 1').all() as any[]
      expect(materials.length).toBe(1)
      expect(materials[0].filename).toBe('watch_test.txt')
    }, 10000)
  })
})
