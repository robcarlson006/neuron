import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import Database from 'better-sqlite3'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../src/lib/db'
import { registerDbHandlers, setDatabase } from './ipc/dbHandlers'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerAIHandlers } from './ipc/aiHandlers'
import { setAIDatabase } from './ipc/aiConfigStore'
import { registerTutorHandlers, setTutorDatabase } from './ipc/tutorHandlers'
import { registerUpdaterHandlers } from './ipc/updaterHandlers'
import { registerRAGHandlers, setRAGDatabase } from './ipc/ragHandlers'
import { registerSyllabusHandlers, setSyllabusDatabase } from './ipc/syllabusHandlers'
import { registerCardGenerationHandlers, setCardGenerationDatabase } from './ipc/cardGenHandlers'
import { registerClassHandlers, setClassDatabase } from './ipc/classHandlers'

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
      nodeIntegration: false
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
  setAIDatabase(db)
  setRAGDatabase(db)
  setTutorDatabase(db)
  registerTutorHandlers()
  setSyllabusDatabase(db)
  registerSyllabusHandlers()
  setCardGenerationDatabase(db)
  registerCardGenerationHandlers()
  setClassDatabase(db)
  registerClassHandlers()
  registerUpdaterHandlers(() => mainWindow)

  createWindow()
  setupAutoUpdater()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ── Auto-updater ──────────────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  if (is.dev) return  // skip in dev mode

  // Allow unsigned updates on macOS (required when not code-signed)
  if (process.platform === 'darwin') {
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    // Disable code signature validation for unsigned builds
    // This is needed because electron-updater uses Squirrel.Mac which validates signatures
    process.env['ELECTRON_UPDATER_ALLOW_UNSIGNED'] = 'true'
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message)
    mainWindow?.webContents.send('update:error', err.message)
  })

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

// Renderer can trigger "install now"
ipcMain.on('update:install', () => {
  try {
    autoUpdater.quitAndInstall()
  } catch (err) {
    mainWindow?.webContents.send('update:error', (err as Error).message)
  }
})
