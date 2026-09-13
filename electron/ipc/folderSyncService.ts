import * as fs from 'fs'
import * as path from 'path'
import type Database from 'better-sqlite3'
import type { BrowserWindow } from 'electron'
import { parseFileToText } from './documentParser'
import type { FolderSyncResult, FolderSyncEvent } from '../../src/types'

export const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.txt',
  '.md',
  '.markdown',
  '.rtf',
  '.html',
  '.csv'
])

/**
 * Checks if a file is supported for ingestion.
 * Rejects hidden files (starting with .), temporary Office lock files (starting with ~$),
 * download artifacts (.crdownload, .download, .tmp), and unsupported extensions.
 */
export function isSupportedFile(filename: string): boolean {
  const base = path.basename(filename)
  if (base.startsWith('.') || base.startsWith('~$')) {
    return false
  }
  if (base.endsWith('.crdownload') || base.endsWith('.download') || base.endsWith('.tmp')) {
    return false
  }
  const ext = path.extname(base).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(ext)
}

/**
 * Computes a normalized relative path with forward slashes from baseDir to filePath.
 */
export function getRelativePath(baseDir: string, filePath: string): string {
  const rel = path.relative(baseDir, filePath)
  return rel.replace(/\\/g, '/')
}

/**
 * Recursively scans a directory tree up to maxDepth and returns full paths
 * of all supported files. Hidden folders and files are ignored.
 */
export function scanDirectory(
  dir: string,
  maxDepth: number = 8,
  currentDepth: number = 0
): string[] {
  if (currentDepth > maxDepth) return []
  if (!fs.existsSync(dir)) return []

  try {
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return []
  } catch {
    return []
  }

  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('~$')) {
        continue
      }
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (currentDepth < maxDepth) {
          const subFiles = scanDirectory(fullPath, maxDepth, currentDepth + 1)
          results.push(...subFiles)
        }
      } else if (entry.isFile()) {
        if (isSupportedFile(entry.name)) {
          results.push(fullPath)
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err)
  }

  return results
}

export interface SyncDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }
}

export class FolderSyncService {
  private static db: Database.Database | SyncDatabase | null = null
  private static getWindow: (() => BrowserWindow | null) | null = null
  private static watchers = new Map<number, fs.FSWatcher>()
  private static debounceTimers = new Map<number, NodeJS.Timeout>()
  private static watchedFolders = new Map<number, string>()
  private static activeSyncs = new Map<number, Promise<FolderSyncResult>>()

  static isSupportedFile = isSupportedFile
  static getRelativePath = getRelativePath
  static scanDirectory = scanDirectory

  /**
   * Sets the window getter function for IPC event dispatching.
   */
  static setWindowGetter(getter: () => BrowserWindow | null): void {
    FolderSyncService.getWindow = getter
  }

  /**
   * Initialize FolderSyncService: sets DB and window getter, executes startup sweep
   * on all linked subjects, and starts watchers.
   */
  static async init(
    db: Database.Database | SyncDatabase,
    getWindow: () => BrowserWindow | null = () => null
  ): Promise<void> {
    FolderSyncService.db = db
    FolderSyncService.setWindowGetter(getWindow)

    try {
      const subjects = db
        .prepare('SELECT id, linked_folder_path FROM subjects WHERE linked_folder_path IS NOT NULL')
        .all() as Array<{ id: number; linked_folder_path: string | null }>

      for (const subject of subjects) {
        if (!subject.linked_folder_path) continue

        if (fs.existsSync(subject.linked_folder_path)) {
          await FolderSyncService.scanAndSync(db, subject.id, subject.linked_folder_path)
          FolderSyncService.startWatching(subject.id, subject.linked_folder_path)
        } else {
          db.prepare("UPDATE subjects SET folder_sync_status = 'error' WHERE id = ?").run(subject.id)
        }
      }
    } catch (err) {
      console.error('Error during FolderSyncService init:', err)
    }
  }

  /**
   * Scans the linked directory and synchronizes it with the database.
   * Concurrent sync calls for the same subjectId are deduplicated via an in-flight promise.
   */
  static async scanAndSync(
    db: Database.Database | SyncDatabase,
    subjectId: number,
    folderPath: string
  ): Promise<FolderSyncResult> {
    const existing = FolderSyncService.activeSyncs.get(subjectId)
    if (existing) {
      return existing
    }

    const syncPromise = (async () => {
      try {
        return await FolderSyncService.doScanAndSync(db, subjectId, folderPath)
      } finally {
        FolderSyncService.activeSyncs.delete(subjectId)
      }
    })()

    FolderSyncService.activeSyncs.set(subjectId, syncPromise)
    return syncPromise
  }

  /**
   * Internal implementation of directory scan and database synchronization.
   * New files are parsed and inserted.
   * Modified files are re-parsed and updated.
   * Deleted files are preserved in the database (Safe Sync).
   */
  private static async doScanAndSync(
    db: Database.Database | SyncDatabase,
    subjectId: number,
    folderPath: string
  ): Promise<FolderSyncResult> {
    try {
      if (!fs.existsSync(folderPath)) {
        db.prepare("UPDATE subjects SET folder_sync_status = 'error' WHERE id = ?").run(subjectId)
        return {
          success: false,
          addedCount: 0,
          updatedCount: 0,
          error: `Directory not found: ${folderPath}`
        }
      }

      const dirStat = fs.statSync(folderPath)
      if (!dirStat.isDirectory()) {
        db.prepare("UPDATE subjects SET folder_sync_status = 'error' WHERE id = ?").run(subjectId)
        return {
          success: false,
          addedCount: 0,
          updatedCount: 0,
          error: `Path is not a directory: ${folderPath}`
        }
      }

      // Mark subject as syncing
      db.prepare("UPDATE subjects SET folder_sync_status = 'syncing' WHERE id = ?").run(subjectId)

      // Query existing materials for this subject
      const existingMaterials = db
        .prepare(
          'SELECT id, filename, file_type, relative_path, file_mtime, file_size FROM materials WHERE subject_id = ?'
        )
        .all(subjectId) as Array<{
          id: number
          filename: string
          file_type: string
          relative_path: string | null
          file_mtime: number | null
          file_size: number | null
        }>

      const matByRelPath = new Map<string, typeof existingMaterials[0]>()
      for (const mat of existingMaterials) {
        if (mat.relative_path) {
          matByRelPath.set(mat.relative_path, mat)
        }
      }

      const filesOnDisk = scanDirectory(folderPath)
      const added: string[] = []
      const updated: string[] = []

      for (const fullPath of filesOnDisk) {
        const relPath = getRelativePath(folderPath, fullPath)
        const filename = path.basename(fullPath)

        let stat: fs.Stats
        try {
          stat = fs.statSync(fullPath)
        } catch {
          continue
        }

        const mtime = Math.round(stat.mtimeMs)
        const size = stat.size

        const existing =
          matByRelPath.get(relPath) ||
          existingMaterials.find(
            (m) => !m.relative_path && m.filename === filename && relPath === filename
          )

        if (!existing) {
          // New file -> parse and insert
          try {
            const parsed = await parseFileToText(fullPath)
            db.prepare(`
              INSERT INTO materials (subject_id, filename, file_type, content_text, file_mtime, file_size, relative_path)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(subjectId, filename, parsed.fileType, parsed.contentText, mtime, size, relPath)
            added.push(relPath)
          } catch (err) {
            console.error(`Failed to parse file ${fullPath}:`, err)
          }
        } else {
          // Modified file check
          const mtimeChanged = existing.file_mtime == null || existing.file_mtime !== mtime
          const sizeChanged = existing.file_size == null || existing.file_size !== size

          if (mtimeChanged || sizeChanged) {
            try {
              const parsed = await parseFileToText(fullPath)
              db.prepare(`
                UPDATE materials
                SET content_text = ?, file_mtime = ?, file_size = ?, relative_path = ?
                WHERE id = ?
              `).run(parsed.contentText, mtime, size, relPath, existing.id)
              updated.push(relPath)
            } catch (err) {
              console.error(`Failed to re-parse file ${fullPath}:`, err)
            }
          }
        }
      }

      // Safe Sync: Missing files on disk are retained in the database

      const nowIso = new Date().toISOString()
      db.prepare(`
        UPDATE subjects
        SET folder_last_synced_at = ?, folder_sync_status = 'idle'
        WHERE id = ?
      `).run(nowIso, subjectId)

      // Send IPC notification if any changes occurred
      if (added.length > 0 || updated.length > 0) {
        if (FolderSyncService.getWindow) {
          const win = FolderSyncService.getWindow()
          if (win && !win.isDestroyed?.()) {
            const syncEvent: FolderSyncEvent = {
              subjectId,
              added,
              updated,
              timestamp: nowIso
            }
            win.webContents.send('folder:sync-event', syncEvent)
          }
        }
      }

      return {
        success: true,
        addedCount: added.length,
        updatedCount: updated.length
      }
    } catch (err: unknown) {
      console.error(`Scan and sync error for subject ${subjectId}:`, err)
      try {
        db.prepare("UPDATE subjects SET folder_sync_status = 'error' WHERE id = ?").run(subjectId)
      } catch {}
      return {
        success: false,
        addedCount: 0,
        updatedCount: 0,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * Starts recursive file watching on the specified folder with 1500ms debounce.
   */
  static startWatching(subjectId: number, folderPath: string): void {
    FolderSyncService.stopWatching(subjectId)

    if (!fs.existsSync(folderPath)) {
      console.error(`Cannot watch non-existent folder: ${folderPath}`)
      return
    }

    try {
      const watcher = fs.watch(folderPath, { recursive: true }, () => {
        const existingTimer = FolderSyncService.debounceTimers.get(subjectId)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        const timer = setTimeout(async () => {
          FolderSyncService.debounceTimers.delete(subjectId)
          if (FolderSyncService.db) {
            try {
              await FolderSyncService.scanAndSync(FolderSyncService.db, subjectId, folderPath)
            } catch (err) {
              console.error(`Debounced sync error for subject ${subjectId}:`, err)
            }
          }
        }, 1500)

        FolderSyncService.debounceTimers.set(subjectId, timer)
      })

      watcher.on('error', (err) => {
        console.error(`Watcher error for subject ${subjectId}:`, err)
        FolderSyncService.stopWatching(subjectId)
        if (FolderSyncService.db) {
          try {
            FolderSyncService.db
              .prepare("UPDATE subjects SET folder_sync_status = 'error' WHERE id = ?")
              .run(subjectId)
          } catch {}
        }
      })

      FolderSyncService.watchers.set(subjectId, watcher)
      FolderSyncService.watchedFolders.set(subjectId, folderPath)
    } catch (err) {
      console.error(`Failed to start watcher on ${folderPath}:`, err)
    }
  }

  /**
   * Stops watching the linked folder for the given subject and clears any pending debounced sync.
   */
  static stopWatching(subjectId: number): void {
    const timer = FolderSyncService.debounceTimers.get(subjectId)
    if (timer) {
      clearTimeout(timer)
      FolderSyncService.debounceTimers.delete(subjectId)
    }

    const watcher = FolderSyncService.watchers.get(subjectId)
    if (watcher) {
      try {
        watcher.close()
      } catch {}
      FolderSyncService.watchers.delete(subjectId)
    }

    FolderSyncService.watchedFolders.delete(subjectId)
  }

  /**
   * Stops all active watchers and clears all timers across all subjects.
   */
  static stopAllWatchers(): void {
    for (const [subjectId, timer] of Array.from(FolderSyncService.debounceTimers.entries())) {
      clearTimeout(timer)
      FolderSyncService.debounceTimers.delete(subjectId)
    }

    for (const [subjectId, watcher] of Array.from(FolderSyncService.watchers.entries())) {
      try {
        watcher.close()
      } catch {}
      FolderSyncService.watchers.delete(subjectId)
    }

    FolderSyncService.watchedFolders.clear()
  }

  /**
   * Returns whether a watcher is active and the current sync status of the subject.
   */
  static getStatus(subjectId: number): { isWatching: boolean; status: string } {
    const isWatching = FolderSyncService.watchers.has(subjectId)
    let status = 'idle'
    if (FolderSyncService.db) {
      try {
        const row = FolderSyncService.db
          .prepare('SELECT folder_sync_status FROM subjects WHERE id = ?')
          .get(subjectId) as { folder_sync_status?: string } | undefined
        if (row && row.folder_sync_status) {
          status = row.folder_sync_status
        }
      } catch {}
    }
    return { isWatching, status }
  }
}
