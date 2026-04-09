import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import Database from 'better-sqlite3'
import { DB_SCHEMA } from '../src/lib/db'
import { registerDbHandlers, setDatabase } from './ipc/dbHandlers'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerGeminiHandlers } from './ipc/geminiHandlers'

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

function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'studyhelper.db')

  const db = new Database(dbPath)

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
  registerGeminiHandlers()

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
  })

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

// Renderer can trigger "install now"
ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall()
})
