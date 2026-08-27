import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { cleanExtractedText, truncateText, getFileType, SupportedFileType } from '../../src/lib/fileParser'

/**
 * Decodes XML / HTML character entities into readable Unicode characters.
 */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Extracts printable ASCII / Unicode string runs from binary file buffers (e.g. legacy .ppt / .doc)
 */
export function extractBinaryStrings(buffer: Buffer, minLength: number = 4): string {
  const textRuns: string[] = []
  let currentRun = ''

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i]
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
      currentRun += String.fromCharCode(byte)
    } else {
      if (currentRun.length >= minLength) {
        const cleaned = currentRun.trim()
        if (cleaned.length >= minLength && /[a-zA-Z0-9]/.test(cleaned)) {
          // Filter out typical binary metadata junk
          if (!/^[_\x00-\x1f\x7f-\xff]+$/.test(cleaned)) {
            textRuns.push(cleaned)
          }
        }
      }
      currentRun = ''
    }
  }
  if (currentRun.length >= minLength) {
    textRuns.push(currentRun.trim())
  }
  return textRuns.join('\n')
}

/**
 * Parse paragraphs and text runs from PowerPoint slide XML
 */
function extractParagraphsFromSlideXml(xml: string): string[] {
  const paragraphs: string[] = []
  const pRegex = /<a:p[\s>][\s\S]*?<\/a:p>/g
  let pMatch: RegExpExecArray | null

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pXml = pMatch[0]
    const textPieces: string[] = []
    const tRegex = /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/g
    let tMatch: RegExpExecArray | null

    while ((tMatch = tRegex.exec(pXml)) !== null) {
      textPieces.push(decodeXmlEntities(tMatch[1]))
    }
    const line = textPieces.join('').trim()
    if (line) {
      paragraphs.push(line)
    }
  }

  // Fallback: If no <a:p> wrapper was matched, grab all <a:t> directly
  if (paragraphs.length === 0) {
    const fallbackPieces: string[] = []
    const tRegex = /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/g
    let tMatch: RegExpExecArray | null
    while ((tMatch = tRegex.exec(xml)) !== null) {
      const val = decodeXmlEntities(tMatch[1]).trim()
      if (val) fallbackPieces.push(val)
    }
    if (fallbackPieces.length > 0) {
      paragraphs.push(fallbackPieces.join(' '))
    }
  }

  return paragraphs
}

/**
 * Robust PowerPoint (.pptx / .pptm / .potx / .ppsx) extractor using JSZip.
 * Extracts slide text in order along with speaker notes and tables.
 */
export async function parsePPTX(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input

  try {
    const zip = await JSZip.loadAsync(buffer)

    // Locate all slide XML files
    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
      .sort((a, b) => {
        const numA = parseInt((a.match(/\d+/) || ['0'])[0], 10)
        const numB = parseInt((b.match(/\d+/) || ['0'])[0], 10)
        return numA - numB
      })

    if (slideFiles.length === 0) {
      // Check if there are any other slide paths (e.g. nested presentation)
      const anySlides = Object.keys(zip.files).filter(f => f.includes('slide') && f.endsWith('.xml'))
      if (anySlides.length > 0) {
        slideFiles.push(...anySlides)
      }
    }

    const slideSections: string[] = []

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i]
      const slideXml = await zip.file(slidePath)?.async('text')
      if (!slideXml) continue

      const paragraphs = extractParagraphsFromSlideXml(slideXml)

      // Look for corresponding speaker notes
      let notesText = ''
      const notePath = slidePath.replace(/slides\/slide/i, 'notesSlides/notesSlide')
      const noteFile = zip.file(notePath) || zip.file(notePath.toLowerCase())

      if (noteFile) {
        const noteXml = await noteFile.async('text')
        const noteParas = extractParagraphsFromSlideXml(noteXml)
          .filter(p => !/^slide \d+$/i.test(p.trim()) && !paragraphs.includes(p))

        if (noteParas.length > 0) {
          notesText = `\n[Speaker Notes: ${noteParas.join(' ')}]`
        }
      }

      if (paragraphs.length > 0 || notesText) {
        slideSections.push(`--- Slide ${i + 1} ---\n${paragraphs.join('\n')}${notesText}`)
      }
    }

    if (slideSections.length > 0) {
      return cleanExtractedText(slideSections.join('\n\n'))
    }

    // If zip was valid but no slide text was found, check all text tags in zip
    const allXmlFiles = Object.keys(zip.files).filter(f => f.endsWith('.xml'))
    const fallbackText: string[] = []
    for (const xFile of allXmlFiles) {
      const content = await zip.file(xFile)?.async('text')
      if (content) {
        const paras = extractParagraphsFromSlideXml(content)
        if (paras.length > 0) fallbackText.push(...paras)
      }
    }
    if (fallbackText.length > 0) {
      return cleanExtractedText(fallbackText.join('\n'))
    }

    return extractBinaryStrings(buffer)
  } catch (err) {
    console.warn('PPTX zip parsing failed, falling back to binary extraction:', err)
    return cleanExtractedText(extractBinaryStrings(buffer))
  }
}

/**
 * Word (.docx / .docm / .dotx) document extractor using Mammoth with JSZip fallback.
 */
export async function parseDOCX(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input

  try {
    const result = await mammoth.extractRawText({ buffer })
    if (result.value && result.value.trim().length > 0) {
      return cleanExtractedText(result.value)
    }
  } catch (err) {
    console.warn('Mammoth extraction failed, falling back to XML extraction:', err)
  }

  // JSZip fallback for DOCX
  try {
    const zip = await JSZip.loadAsync(buffer)
    const docXml = await zip.file('word/document.xml')?.async('text')
    if (docXml) {
      const paragraphs: string[] = []
      const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g
      let pMatch: RegExpExecArray | null
      while ((pMatch = pRegex.exec(docXml)) !== null) {
        const tMatches = pMatch[0].match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) || []
        const line = tMatches.map(t => decodeXmlEntities(t.replace(/<[^>]+>/g, ''))).join('')
        if (line.trim()) paragraphs.push(line.trim())
      }
      if (paragraphs.length > 0) {
        return cleanExtractedText(paragraphs.join('\n\n'))
      }
    }
  } catch {}

  return cleanExtractedText(extractBinaryStrings(buffer))
}

/**
 * PDF parser using pdf-parse with buffer safety.
 */
export async function parsePDF(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input
  try {
    const data = await pdfParse(buffer)
    return cleanExtractedText(data.text || '')
  } catch (err) {
    console.error('PDF parsing error:', err)
    const fallback = extractBinaryStrings(buffer)
    if (fallback.length > 50) return cleanExtractedText(fallback)
    throw new Error(`Failed to parse PDF document: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

/**
 * Strips Rich Text Format (RTF) commands to extract plain text.
 */
export function parseRTF(rtfContent: string): string {
  return cleanExtractedText(
    rtfContent
      .replace(/\\par\b/gi, '\n')
      .replace(/\\line\b/gi, '\n')
      .replace(/\\tab\b/gi, '\t')
      .replace(/\{\\*?\\[^{}]+(?:\{[^{}]*\})*\}/g, '')
      .replace(/\\[a-zA-Z]+-?\d* ?/g, ' ')
      .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/[ \t]+/g, ' ')
  )
}

/**
 * Strips HTML / HTM tags to extract text content.
 */
export function parseHTML(htmlContent: string): string {
  return cleanExtractedText(
    htmlContent
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
  )
}

/**
 * Universal document parser. Takes a file path on disk and returns the clean extracted text
 * along with the normalized file type.
 */
export async function parseFileToText(filePath: string): Promise<{
  filename: string
  fileType: SupportedFileType
  contentText: string
  originalLength: number
}> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const filename = path.basename(filePath)
  const detectedType = getFileType(filename)

  if (!detectedType) {
    throw new Error(`Unsupported file format: ${filename}`)
  }

  let contentText = ''

  switch (detectedType) {
    case 'pdf':
      contentText = await parsePDF(filePath)
      break

    case 'pptx':
    case 'ppt':
      contentText = await parsePPTX(filePath)
      break

    case 'docx':
    case 'doc':
      contentText = await parseDOCX(filePath)
      break

    case 'rtf': {
      const raw = fs.readFileSync(filePath, 'utf-8')
      contentText = parseRTF(raw)
      break
    }

    case 'html': {
      const raw = fs.readFileSync(filePath, 'utf-8')
      contentText = parseHTML(raw)
      break
    }

    case 'txt':
    case 'md':
    case 'csv':
    case 'tsv':
    case 'json':
    default: {
      contentText = cleanExtractedText(fs.readFileSync(filePath, 'utf-8'))
      break
    }
  }

  const originalLength = contentText.length
  const truncated = truncateText(contentText, 25000)

  return {
    filename,
    fileType: detectedType,
    contentText: truncated,
    originalLength
  }
}
