import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { cleanExtractedText, truncateText, getFileType } from '../../src/lib/fileParser'

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
        { name: 'Study Materials', extensions: ['pdf', 'docx', 'pptx'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'PowerPoint', extensions: ['pptx'] }
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
    }

    const truncated = truncateText(contentText)

    return {
      filename,
      fileType,
      contentText: truncated,
      originalLength: contentText.length
    }
  })
}
