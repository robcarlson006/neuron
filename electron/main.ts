import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
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

  setDatabase(db)
}

async function seedHistoryData(): Promise<void> {
  // Import and run seed after DB is ready
  try {
    const { seedHistoryData: seed } = await import('../seed/history-seed')
    await seed()
  } catch (err) {
    console.error('Seed error:', err)
  }
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

  // Seed history data on first launch
  await seedHistoryData()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
