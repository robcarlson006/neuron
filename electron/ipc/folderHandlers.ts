import { ipcMain, dialog, shell } from 'electron'
import type Database from 'better-sqlite3'
import { FolderSyncService, type SyncDatabase } from './folderSyncService'
import type { FolderSyncResult } from '../../src/types'

let db: Database.Database | SyncDatabase | null = null

export function setFolderDatabase(database: Database.Database | SyncDatabase): void {
  db = database
}

export function registerFolderHandlers(): void {
  ipcMain.handle('folder:selectDialog', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(
    'folder:link',
    async (_event, subjectId: number, folderPath: string): Promise<FolderSyncResult> => {
      if (!db) {
        return {
          success: false,
          addedCount: 0,
          updatedCount: 0,
          error: 'Database not initialized'
        }
      }

      db.prepare('UPDATE subjects SET linked_folder_path = ? WHERE id = ?').run(folderPath, subjectId)
      FolderSyncService.startWatching(subjectId, folderPath)
      return await FolderSyncService.scanAndSync(db, subjectId, folderPath)
    }
  )

  ipcMain.handle('folder:unlink', async (_event, subjectId: number): Promise<{ success: boolean }> => {
    FolderSyncService.stopWatching(subjectId)
    if (db) {
      db.prepare(
        "UPDATE subjects SET linked_folder_path = NULL, folder_sync_status = 'idle', folder_last_synced_at = NULL WHERE id = ?"
      ).run(subjectId)
    }
    return { success: true }
  })

  ipcMain.handle('folder:syncNow', async (_event, subjectId: number): Promise<FolderSyncResult> => {
    if (!db) {
      return {
        success: false,
        addedCount: 0,
        updatedCount: 0,
        error: 'Database not initialized'
      }
    }

    const row = db
      .prepare('SELECT linked_folder_path FROM subjects WHERE id = ?')
      .get(subjectId) as { linked_folder_path?: string | null } | undefined

    if (!row || !row.linked_folder_path) {
      return {
        success: false,
        addedCount: 0,
        updatedCount: 0,
        error: 'No linked folder found for this subject'
      }
    }

    return await FolderSyncService.scanAndSync(db, subjectId, row.linked_folder_path)
  })

  ipcMain.handle('folder:openFolder', async (_event, folderPath: string): Promise<void> => {
    await shell.openPath(folderPath)
  })

  ipcMain.handle('folder:getStatus', (_event, subjectId: number): { isWatching: boolean; status: string } => {
    return FolderSyncService.getStatus(subjectId)
  })
}
