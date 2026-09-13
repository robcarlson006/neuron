import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { FolderSyncService } from '../../electron/ipc/folderSyncService'
import {
  registerFolderHandlers,
  setFolderDatabase
} from '../../electron/ipc/folderHandlers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

const registeredHandlers = new Map<string, Function>()

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: Function) => {
      registeredHandlers.set(channel, handler)
    })
  },
  dialog: {
    showOpenDialog: jest.fn()
  },
  shell: {
    openPath: jest.fn()
  }
}))

// We can import the mocked electron modules
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dialog, shell } = require('electron')

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
      /* ignore */
    }
  }

  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
  return db
}

describe('folderHandlers', () => {
  let db: any

  beforeEach(() => {
    registeredHandlers.clear()
    jest.clearAllMocks()

    db = createFreshDatabase()
    setFolderDatabase(db)
    registerFolderHandlers()

    db.prepare("INSERT INTO subjects (id, user_id, name) VALUES (1, 1, 'Biology 101')").run()
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('registers all required folder IPC channels', () => {
    expect(registeredHandlers.has('folder:selectDialog')).toBe(true)
    expect(registeredHandlers.has('folder:link')).toBe(true)
    expect(registeredHandlers.has('folder:unlink')).toBe(true)
    expect(registeredHandlers.has('folder:syncNow')).toBe(true)
    expect(registeredHandlers.has('folder:openFolder')).toBe(true)
    expect(registeredHandlers.has('folder:getStatus')).toBe(true)
  })

  describe('folder:selectDialog', () => {
    it('returns selected folder path when directory chosen', async () => {
      ;(dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/Users/student/Classes/Bio101']
      })

      const handler = registeredHandlers.get('folder:selectDialog')!
      const result = await handler({})

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory']
      })
      expect(result).toBe('/Users/student/Classes/Bio101')
    })

    it('returns null when dialog is canceled', async () => {
      ;(dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
        canceled: true,
        filePaths: []
      })

      const handler = registeredHandlers.get('folder:selectDialog')!
      const result = await handler({})

      expect(result).toBeNull()
    })
  })

  describe('folder:link', () => {
    it('updates subject row with linked folder, starts watching, and runs sync', async () => {
      const startWatchingSpy = jest.spyOn(FolderSyncService, 'startWatching').mockImplementation(() => {})
      const scanAndSyncSpy = jest.spyOn(FolderSyncService, 'scanAndSync').mockResolvedValueOnce({
        success: true,
        addedCount: 5,
        updatedCount: 0
      })

      const handler = registeredHandlers.get('folder:link')!
      const result = await handler({}, 1, '/Users/student/Classes/Bio101')

      // Verify subject row in DB was updated
      const subject = db.prepare('SELECT linked_folder_path FROM subjects WHERE id = 1').get() as any
      expect(subject.linked_folder_path).toBe('/Users/student/Classes/Bio101')

      // Verify service interactions
      expect(startWatchingSpy).toHaveBeenCalledWith(1, '/Users/student/Classes/Bio101')
      expect(scanAndSyncSpy).toHaveBeenCalledWith(db, 1, '/Users/student/Classes/Bio101')
      expect(result).toEqual({
        success: true,
        addedCount: 5,
        updatedCount: 0
      })

      startWatchingSpy.mockRestore()
      scanAndSyncSpy.mockRestore()
    })
  })

  describe('folder:unlink', () => {
    it('stops watching and clears linked_folder_path and sync fields in database', async () => {
      // First link the subject
      db.prepare(
        "UPDATE subjects SET linked_folder_path = '/some/path', folder_sync_status = 'idle', folder_last_synced_at = '2026-09-13T12:00:00.000Z' WHERE id = 1"
      ).run()

      const stopWatchingSpy = jest.spyOn(FolderSyncService, 'stopWatching').mockImplementation(() => {})

      const handler = registeredHandlers.get('folder:unlink')!
      const result = await handler({}, 1)

      expect(stopWatchingSpy).toHaveBeenCalledWith(1)
      expect(result).toEqual({ success: true })

      const subject = db.prepare('SELECT linked_folder_path, folder_sync_status, folder_last_synced_at FROM subjects WHERE id = 1').get() as any
      expect(subject.linked_folder_path).toBeNull()
      expect(subject.folder_sync_status).toBe('idle')
      expect(subject.folder_last_synced_at).toBeNull()

      stopWatchingSpy.mockRestore()
    })
  })

  describe('folder:syncNow', () => {
    it('calls scanAndSync with the linked folder path for the subject', async () => {
      db.prepare("UPDATE subjects SET linked_folder_path = '/Users/student/Classes/Bio101' WHERE id = 1").run()

      const scanAndSyncSpy = jest.spyOn(FolderSyncService, 'scanAndSync').mockResolvedValueOnce({
        success: true,
        addedCount: 2,
        updatedCount: 1
      })

      const handler = registeredHandlers.get('folder:syncNow')!
      const result = await handler({}, 1)

      expect(scanAndSyncSpy).toHaveBeenCalledWith(db, 1, '/Users/student/Classes/Bio101')
      expect(result).toEqual({
        success: true,
        addedCount: 2,
        updatedCount: 1
      })

      scanAndSyncSpy.mockRestore()
    })

    it('returns error result when subject has no linked folder', async () => {
      const handler = registeredHandlers.get('folder:syncNow')!
      const result = await handler({}, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No linked folder')
    })
  })

  describe('folder:openFolder', () => {
    it('calls shell.openPath with the folder path', async () => {
      ;(shell.openPath as jest.Mock).mockResolvedValueOnce('')

      const handler = registeredHandlers.get('folder:openFolder')!
      await handler({}, '/Users/student/Classes/Bio101')

      expect(shell.openPath).toHaveBeenCalledWith('/Users/student/Classes/Bio101')
    })
  })

  describe('folder:getStatus', () => {
    it('calls FolderSyncService.getStatus and returns status', () => {
      const getStatusSpy = jest.spyOn(FolderSyncService, 'getStatus').mockReturnValueOnce({
        isWatching: true,
        status: 'idle'
      })

      const handler = registeredHandlers.get('folder:getStatus')!
      const result = handler({}, 1)

      expect(getStatusSpy).toHaveBeenCalledWith(1)
      expect(result).toEqual({
        isWatching: true,
        status: 'idle'
      })

      getStatusSpy.mockRestore()
    })
  })
})
