import { app, BrowserWindow, shell, protocol, net, Menu, MenuItem } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../src/lib/db'
import { registerDbHandlers, setDatabase } from './ipc/dbHandlers'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerAIHandlers } from './ipc/aiHandlers'
import { getAIConfig, isLocalEndpoint, setAIDatabase } from './ipc/aiConfigStore'
import { registerTutorHandlers, setTutorDatabase } from './ipc/tutorHandlers'
import { registerUpdaterHandlers } from './ipc/updaterHandlers'
import { registerRAGHandlers, setRAGDatabase, ensureRAGIndexVersion } from './ipc/ragHandlers'
import { registerGroundedHandlers, setGroundedDatabase } from './ipc/groundedHandlers'
import { registerSyllabusHandlers, setSyllabusDatabase } from './ipc/syllabusHandlers'
import { registerCardGenerationHandlers, setCardGenerationDatabase } from './ipc/cardGenHandlers'
import { registerClassHandlers, setClassDatabase } from './ipc/classHandlers'
import { registerCalendarHandlers, setCalendarDatabase } from './ipc/calendarHandlers'
import { registerGoogleCalendarHandlers } from './ipc/googleCalendarHandlers'
import { setGoogleCalendarDatabase } from './ipc/googleCalendarService'
import { listLocalModels, registerLocalEngineHandlers, setLocalEngineWindowGetter, startEngine, stopEngine } from './ipc/localEngine'
import { registerFolderHandlers, setFolderDatabase } from './ipc/folderHandlers'
import { registerLectureHandlers, setLectureDatabase, setOnRecordingFinalized } from './ipc/lectureHandlers'
import { registerPracticeHandlers, setPracticeDatabase } from './ipc/practiceHandlers'
import { registerAnnotationHandlers, setAnnotationDatabase } from './ipc/annotationHandlers'
import { LectureNotesService } from './ipc/lectureNotesService'
import { LocalWhisperService } from './ipc/localWhisperService'
import { TranscriptionService } from './ipc/transcriptionService'
import { FolderSyncService } from './ipc/folderSyncService'
import { resolveMaterialVisualChapterPath, resolveMaterialVisualPagePath, resolveMaterialVisualPath } from './ipc/documentPreviewService'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'neuron-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  },
  {
    scheme: 'neuron-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()

    // 1. Spelling suggestions when clicking on a misspelled word
    if (params.misspelledWord) {
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          menu.append(
            new MenuItem({
              label: suggestion,
              click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
            })
          )
        }
      } else {
        menu.append(
          new MenuItem({
            label: 'No Spelling Suggestions',
            enabled: false
          })
        )
      }

      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({
          label: `Add "${params.misspelledWord}" to Dictionary`,
          click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // 2. Standard editing options for text inputs / textareas
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }))
      menu.append(new MenuItem({ role: 'redo' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'cut' }))
      menu.append(new MenuItem({ role: 'copy' }))
      menu.append(new MenuItem({ role: 'paste' }))
      menu.append(new MenuItem({ role: 'selectAll' }))
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      menu.append(new MenuItem({ role: 'copy' }))
      menu.append(new MenuItem({ role: 'selectAll' }))
    }

    if (menu.items.length > 0) {
      menu.popup()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let db: Database.Database

function migrateCardsFolderForeignKey(): void {
  try {
    const fkList = db.pragma('foreign_key_list(cards)') as Array<{ table: string }>
    if (!fkList.some((fk) => fk.table === 'folders')) return

    const cols = (db.pragma('table_info(cards)') as Array<{ name: string }>).map((c) => c.name)
    const required = ['id', 'subject_id', 'material_id', 'type', 'front', 'back', 'folder_id', 'concept', 'is_manual', 'created_at']
    if (!required.every((c) => cols.includes(c))) {
      console.warn('Skipping cards FK migration: unexpected column set', cols.join(','))
      return
    }

    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec(`
        CREATE TABLE cards_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id INTEGER NOT NULL,
          material_id INTEGER,
          type TEXT NOT NULL CHECK (type IN ('flashcard', 'active_recall')),
          front TEXT NOT NULL,
          back TEXT NOT NULL,
          folder_id INTEGER,
          concept TEXT,
          is_manual INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          note_id INTEGER REFERENCES card_notes(id),
          cloze_ordinal INTEGER DEFAULT 0,
          tags TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          media_json TEXT DEFAULT '{}',
          source TEXT DEFAULT '',
          topic_id INTEGER,
          FOREIGN KEY (subject_id) REFERENCES subjects(id),
          FOREIGN KEY (material_id) REFERENCES materials(id),
          FOREIGN KEY (folder_id) REFERENCES card_folders(id)
        );
      `)
      const colList = cols.join(', ')
      db.exec(`INSERT INTO cards_new (${colList}) SELECT ${colList} FROM cards`)
      db.exec('DROP TABLE cards')
      db.exec('ALTER TABLE cards_new RENAME TO cards')
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  } catch (err) {
    console.error('cards FK migration failed:', err)
  }
}

function verifyGoogleCalendarSchema(): void {
  const requiredColumns = ['google_account_id', 'google_calendar_id', 'sync_token', 'provider_metadata_json', 'enabled']
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS google_calendar_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'reauthorize_required', 'error')),
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`).run()
    for (const column of [
      "ALTER TABLE calendar_sources ADD COLUMN google_account_id INTEGER",
      "ALTER TABLE calendar_sources ADD COLUMN google_calendar_id TEXT",
      "ALTER TABLE calendar_sources ADD COLUMN sync_token TEXT",
      "ALTER TABLE calendar_sources ADD COLUMN provider_metadata_json TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE calendar_sources ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1"
    ]) {
      try { db.prepare(column).run() } catch { /* column already exists */ }
    }
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('google_calendar_accounts', 'calendar_sources')").all() as Array<{ name: string }>).map(row => row.name))
    const columns = new Set((db.pragma('table_info(calendar_sources)') as Array<{ name: string }>).map(row => row.name))
    const missing = requiredColumns.filter(column => !columns.has(column))
    if (!tables.has('google_calendar_accounts') || !tables.has('calendar_sources') || missing.length > 0) {
      throw new Error(`required tables or columns are missing${missing.length ? `: ${missing.join(', ')}` : ''}`)
    }
  } catch (error) {
    console.error('[GoogleCalendar] database migration verification failed:', error)
  }
}

function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'studyhelper.db')

  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run all schema creation statements
  const statements = DB_SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0)
  for (const statement of statements) {
    db.prepare(statement + ';').run()
  }

  // Migrations for existing databases
  try {
    db.prepare("ALTER TABLE deadlines ADD COLUMN deadline_type TEXT NOT NULL DEFAULT 'personal'").run()
  } catch {
    // Column already exists — no-op
  }
  try {
    db.prepare('ALTER TABLE review_log ADD COLUMN response_time_ms INTEGER').run()
  } catch {
    // Column already exists — no-op
  }
  try {
    db.prepare('ALTER TABLE cards ADD COLUMN folder_id INTEGER REFERENCES card_folders(id)').run()
  } catch {
    // Column already exists — no-op
  }
  // FSRS-5 state columns
  for (const col of [
    'ALTER TABLE card_schedule ADD COLUMN stability REAL',
    'ALTER TABLE card_schedule ADD COLUMN difficulty REAL',
    'ALTER TABLE card_schedule ADD COLUMN state INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE card_schedule ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE cards ADD COLUMN concept TEXT"
  ]) {
    try { db.prepare(col).run() } catch { /* already applied */ }
  }

  // V2 schema migrations (new features: cloze, image, tags, undo, etc.)
  for (const migrationSql of MIGRATIONS_SQL) {
    try { db.prepare(migrationSql).run() } catch { /* column may already exist */ }
  }
  verifyGoogleCalendarSchema()

  // Backfill: materials of subjects that already have a generated syllabus
  // were folded in by the old full-regeneration flow — mark them processed so
  // the incremental syllabus updater only considers newly added materials.
  try {
    db.prepare(`
      UPDATE materials SET syllabus_processed = 1
      WHERE syllabus_processed = 0
        AND subject_id IN (SELECT id FROM subjects WHERE syllabus_generated = 1)
    `).run()
  } catch { /* column may not exist yet in a fresh DB */ }

  // Fix a legacy FK reference: the base schema pointed cards.folder_id at a
  // nonexistent `folders` table (the real table is `card_folders`). With
  // foreign_keys ON this made folder assignment fail at runtime. Rebuild the
  // cards table with the corrected reference for pre-existing databases.
  migrateCardsFolderForeignKey()

  setDatabase(db)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.studyhelper.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()

  // Register all IPC handlers
  registerDbHandlers()
  registerFileHandlers()
  registerAIHandlers()
  registerRAGHandlers()
  registerGroundedHandlers()
  setAIDatabase(db)
  setRAGDatabase(db)
  void ensureRAGIndexVersion()
  setGroundedDatabase(db)
  setTutorDatabase(db)
  registerTutorHandlers()
  setSyllabusDatabase(db)
  registerSyllabusHandlers()
  setCardGenerationDatabase(db)
  registerCardGenerationHandlers()
  setClassDatabase(db)
  registerClassHandlers()
  setCalendarDatabase(db)
  registerCalendarHandlers()
  setGoogleCalendarDatabase(db)
  registerGoogleCalendarHandlers()
  registerUpdaterHandlers(() => mainWindow)
  setLocalEngineWindowGetter(() => mainWindow)
  registerLocalEngineHandlers()
  setFolderDatabase(db)
  registerFolderHandlers()
  setPracticeDatabase(db)
  registerPracticeHandlers()
  setAnnotationDatabase(db)
  registerAnnotationHandlers()
  setLectureDatabase(db)
  registerLectureHandlers()
  TranscriptionService.setDatabase(db)
  LectureNotesService.init(db)
  LectureNotesService.setWindowGetter(() => mainWindow)
  LocalWhisperService.setWindowGetter(() => mainWindow)
  setOnRecordingFinalized(async (lectureId) => {
    await LectureNotesService.processLecture(lectureId)
  })

  protocol.handle('neuron-audio', (request) => {
    try {
      const rawPath = request.url.replace(/^neuron-audio:\/\//, '')
      let filePath = decodeURIComponent(rawPath)
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\/([A-Za-z]:)/, '$1')
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('Failed to handle neuron-audio protocol request:', err)
      return new Response('Audio file not found', { status: 404 })
    }
  })

  protocol.handle('neuron-file', (request) => {
    try {
      // Chromium includes the iframe fragment in custom-scheme requests. The
      // fragment controls the PDF page/EPUB chapter in the renderer and must
      // not prevent the main process from resolving the visual source.
      const visualMatch = request.url.match(/^neuron-file:\/\/visual\/(\d+)(?:#.*)?$/)
      if (visualMatch) {
        return resolveMaterialVisualPath(db, Number(visualMatch[1])).then((filePath) => {
          if (!filePath) return new Response('Visual preview not available', { status: 404 })
          return net.fetch(pathToFileURL(filePath).toString())
        })
      }
      const visualPageMatch = request.url.match(/^neuron-file:\/\/visual-page\/(\d+)\/(\d+)(?:\?.*)?$/)
      if (visualPageMatch) {
        return resolveMaterialVisualPagePath(db, Number(visualPageMatch[1]), Number(visualPageMatch[2])).then((filePath) => {
          if (!filePath) return new Response('Visual page not available', { status: 404 })
          return net.fetch(pathToFileURL(filePath).toString())
        })
      }
      const visualChapterMatch = request.url.match(/^neuron-file:\/\/visual-epub-page\/(\d+)\/(\d+)(?:\?.*)?$/)
      if (visualChapterMatch) {
        return resolveMaterialVisualChapterPath(db, Number(visualChapterMatch[1]), Number(visualChapterMatch[2])).then((filePath) => {
          if (!filePath) return new Response('Visual EPUB chapter not available', { status: 404 })
          return net.fetch(pathToFileURL(filePath).toString())
        })
      }
      const match = request.url.match(/^neuron-file:\/\/material\/(\d+)(?:#.*)?$/)
      if (!match) return new Response('File not found', { status: 404 })
      const row = db.prepare('SELECT file_path FROM materials WHERE id = ?').get(Number(match[1])) as { file_path?: string | null } | undefined
      if (!row?.file_path) return new Response('File not found', { status: 404 })
      return net.fetch(pathToFileURL(row.file_path).toString())
    } catch (err) {
      console.error('Failed to handle neuron-file request:', err)
      return new Response('File not found', { status: 404 })
    }
  })

  createWindow()
  // Restore a previously configured local engine when its model is already
  // present. A fresh install keeps the default cloud configuration and does
  // not download or spawn anything during startup.
  const savedAIConfig = getAIConfig()
  if (isLocalEndpoint(savedAIConfig.baseUrl)) {
    const modelReady = listLocalModels().some((model) => model.id === savedAIConfig.model && model.status === 'ready')
    if (modelReady) {
      void startEngine(savedAIConfig.model).catch((error) => {
        console.warn('Local AI restart recovery failed:', error)
      })
    }
  }
  FolderSyncService.init(db, () => mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  FolderSyncService.stopAllWatchers()
})

app.on('will-quit', () => {
  stopEngine()
})
