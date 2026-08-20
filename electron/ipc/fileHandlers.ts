import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import Database from 'better-sqlite3'
import { cleanExtractedText, truncateText, getFileType } from '../../src/lib/fileParser'
import type { AnkiDeck } from '../../src/types'

function extractCardsFromAnkiDb(db: Database.Database, defaultName: string): AnkiDeck {
  // Check if the required tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  const hasNotes = tables.some(t => t.name === 'notes')
  const hasCards = tables.some(t => t.name === 'cards')

  if (!hasNotes || !hasCards) {
    db.close()
    return { name: defaultName, cards: [], cardCount: 0 }
  }

  // Get deck name
  let deckName = defaultName
  try {
    const colExists = tables.some(t => t.name === 'col')
    if (colExists) {
      const colRow = db.prepare('SELECT decks FROM col LIMIT 1').get() as { decks: string } | undefined
      if (colRow) {
        const decks = JSON.parse(colRow.decks)
        const firstKey = Object.keys(decks)[0]
        if (firstKey) deckName = decks[firstKey]?.name || defaultName
      }
    }
  } catch {}

  // Get notes with their fields and tags
  const notes = db.prepare("SELECT id, flds, tags FROM notes").all() as { id: number; flds: string; tags: string }[]

  if (notes.length === 0) {
    db.close()
    return { name: deckName, cards: [], cardCount: 0 }
  }

  const result: AnkiDeck['cards'] = []
  for (const note of notes) {
    const fields = note.flds.split('\x1f')  // Unit separator
    const front = fields[0] || ''
    const back = fields.slice(1).join('\n') || ''
    const tags = note.tags ? note.tags.split(' ').filter(Boolean) : []

    // Strip HTML tags from Anki text
    const cleanFront = front.replace(/<[^>]*>/g, '').trim()
    const cleanBack = back.replace(/<[^>]*>/g, '').trim()

    if (cleanFront && cleanBack) {
      result.push({
        front: cleanFront,
        back: cleanBack,
        tags,
        type: 'flashcard',
      })
    }
  }

  db.close()
  return { name: deckName, cards: result, cardCount: result.length }
}

// Try to find a SQLite database within a zip/binary container
function findSqliteInBuffer(buffer: Buffer): Buffer | null {
  const sqliteSig = Buffer.from('SQLite format 3\x00')
  const idx = buffer.indexOf(sqliteSig)
  if (idx !== -1) {
    // Found SQLite signature - extract from this position
    return buffer.subarray(idx)
  }
  return null
}

async function parseAnkiFile(filePath: string): Promise<AnkiDeck> {
  const buffer = fs.readFileSync(filePath)
  const defaultName = path.basename(filePath, path.extname(filePath))

  // Strategy 1: Try direct SQLite
  try {
    const db = new Database(buffer.toString('binary'))
    const result = extractCardsFromAnkiDb(db, defaultName)
    if (result.cardCount > 0) return result
  } catch {}

  // Strategy 2: Try gzip decompress
  try {
    const decompressed = zlib.gunzipSync(buffer)
    const db = new Database(decompressed.toString('binary'))
    const result = extractCardsFromAnkiDb(db, defaultName)
    if (result.cardCount > 0) return result
  } catch {}

  // Strategy 3: Search for embedded SQLite in zip container
  try {
    const sqliteData = findSqliteInBuffer(buffer)
    if (sqliteData) {
      const db = new Database(sqliteData.toString('binary'))
      const result = extractCardsFromAnkiDb(db, defaultName)
      if (result.cardCount > 0) return result
    }
  } catch {}

  return { name: defaultName, cards: [], cardCount: 0 }
}

async function parsePDF(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse')
  const dataBuffer = fs.readFileSync(filePath)
  const data = await pdfParse(dataBuffer)
  return cleanExtractedText(data.text)
}

async function parseDOCX(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return cleanExtractedText(result.value)
}

async function parsePPTX(filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const officeParser = require('officeparser')
    const text = await new Promise<string>((resolve, reject) => {
      officeParser.parseOffice(filePath, (data: string, err: Error | null) => {
        if (err) reject(err)
        else resolve(data || '')
      })
    })
    return cleanExtractedText(text)
  } catch {
    return `[PPTX content - ${path.basename(filePath)}] - Please ensure officeparser is properly installed`
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:openDialog', async () => {
    const window = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'Study Materials', extensions: ['pdf', 'docx', 'pptx', 'apkg'] },
        { name: 'Anki Decks', extensions: ['apkg'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'PowerPoint', extensions: ['pptx'] },
        { name: 'Text Files', extensions: ['txt', 'md'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('file:parseFile', async (_event, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const filename = path.basename(filePath)
    const fileType = getFileType(filename)

    if (!fileType) {
      throw new Error(`Unsupported file type: ${filename}`)
    }

    let contentText = ''

    switch (fileType) {
      case 'pdf':
        contentText = await parsePDF(filePath)
        break
      case 'docx':
        contentText = await parseDOCX(filePath)
        break
      case 'pptx':
        contentText = await parsePPTX(filePath)
        break
      case 'txt':
      case 'md':
        contentText = fs.readFileSync(filePath, 'utf-8')
        break
    }

    const truncated = truncateText(contentText)

    return {
      filename,
      fileType,
      contentText: truncated,
      originalLength: contentText.length
    }
  })

  // ── Anki Deck Import ──
  ipcMain.handle('file:parseAnkiDeck', async (_event, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found: ' + filePath)
    }
    return parseAnkiFile(filePath)
  })
}
