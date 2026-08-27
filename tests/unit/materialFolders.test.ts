import { getOrCreateMaterialFolder, syncCardsToMaterialFolders } from '../../electron/ipc/materialFolderHelper'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

// Adapter to provide better-sqlite3 style .run() and .get() and .all() over DatabaseSync
function createDbAdapter(): any {
  const syncDb = new DatabaseSync(':memory:')
  syncDb.exec(`
    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content_text TEXT
    );
    CREATE TABLE card_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      material_id INTEGER,
      folder_id INTEGER,
      type TEXT DEFAULT 'flashcard',
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      created_at TEXT
    );
  `)

  return {
    prepare(sql: string) {
      const stmt = syncDb.prepare(sql)
      return {
        run(...params: any[]) {
          const res = stmt.run(...params)
          return { lastInsertRowid: res.lastInsertRowid }
        },
        get(...params: any[]) {
          return stmt.get(...params)
        },
        all(...params: any[]) {
          return stmt.all(...params)
        }
      }
    },
    exec(sql: string) {
      return syncDb.exec(sql)
    },
    close() {
      return syncDb.close()
    }
  }
}

describe('Material Folder Auto-Creation & Assignment', () => {
  let db: any

  beforeEach(() => {
    db = createDbAdapter()
  })

  afterEach(() => {
    db.close()
  })

  it('creates a new folder named after the material when it does not exist', () => {
    db.prepare("INSERT INTO subjects (id, name) VALUES (1, 'Biology')").run()
    db.prepare("INSERT INTO materials (id, subject_id, filename) VALUES (10, 1, 'Cell_Biology_Notes.pdf')").run()

    const folderId = getOrCreateMaterialFolder(db, 1, 10)
    expect(folderId).not.toBeNull()

    const folder = db.prepare('SELECT * FROM card_folders WHERE id = ?').get(folderId) as { id: number; subject_id: number; name: string }
    expect(folder).toBeDefined()
    expect(folder.name).toBe('Cell_Biology_Notes.pdf')
    expect(folder.subject_id).toBe(1)
  })

  it('reuses existing folder if a folder with the material filename already exists', () => {
    db.prepare("INSERT INTO subjects (id, name) VALUES (1, 'Biology')").run()
    db.prepare("INSERT INTO materials (id, subject_id, filename) VALUES (10, 1, 'Genetics.docx')").run()
    db.prepare("INSERT INTO card_folders (id, subject_id, name) VALUES (5, 1, 'Genetics.docx')").run()

    const folderId = getOrCreateMaterialFolder(db, 1, 10)
    expect(folderId).toBe(5)

    const allFolders = db.prepare('SELECT * FROM card_folders WHERE subject_id = 1').all()
    expect(allFolders).toHaveLength(1)
  })

  it('syncCardsToMaterialFolders backfills unassigned cards into folders named after their materials', () => {
    db.prepare("INSERT INTO subjects (id, name) VALUES (1, 'Physics')").run()
    db.prepare("INSERT INTO materials (id, subject_id, filename) VALUES (20, 1, 'Thermodynamics.pdf')").run()
    db.prepare("INSERT INTO materials (id, subject_id, filename) VALUES (21, 1, 'Optics.pdf')").run()

    // Insert cards with material_id but no folder_id
    db.prepare("INSERT INTO cards (subject_id, material_id, folder_id, front, back) VALUES (1, 20, NULL, 'Q1', 'A1')").run()
    db.prepare("INSERT INTO cards (subject_id, material_id, folder_id, front, back) VALUES (1, 20, NULL, 'Q2', 'A2')").run()
    db.prepare("INSERT INTO cards (subject_id, material_id, folder_id, front, back) VALUES (1, 21, NULL, 'Q3', 'A3')").run()

    syncCardsToMaterialFolders(db)

    const folders = db.prepare('SELECT * FROM card_folders WHERE subject_id = 1').all() as { id: number; name: string }[]
    expect(folders).toHaveLength(2)

    const thermoFolder = folders.find((f: any) => f.name === 'Thermodynamics.pdf')!
    const opticsFolder = folders.find((f: any) => f.name === 'Optics.pdf')!
    expect(thermoFolder).toBeDefined()
    expect(opticsFolder).toBeDefined()

    const cards = db.prepare('SELECT * FROM cards WHERE subject_id = 1').all() as { id: number; material_id: number; folder_id: number }[]
    expect(cards[0].folder_id).toBe(thermoFolder.id)
    expect(cards[1].folder_id).toBe(thermoFolder.id)
    expect(cards[2].folder_id).toBe(opticsFolder.id)
  })
})
