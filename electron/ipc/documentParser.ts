import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { cleanExtractedText, getFileType, SupportedFileType } from '../../src/lib/fileParser'
import { extractTextFromImage, ocrPdfPages } from './ocrHelper'

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

function renderOmml(xml: string): string {
  const text = (fragment: string): string => decodeXmlEntities(fragment.replace(/<[^>]+>/g, ''))
  const content = (tag: string): string => {
    const match = xml.match(new RegExp(`<m:${tag}\\b[^>]*>([\\s\\S]*?)</m:${tag}>`, 'i'))
    return match ? renderOmml(match[1]) : ''
  }

  if (/<m:f\b/i.test(xml)) {
    const fraction = xml.match(/<m:f\b[^>]*>([\s\S]*?)<\/m:f>/i)?.[1] || ''
    const numerator = fraction.match(/<m:num\b[^>]*>([\s\S]*?)<\/m:num>/i)?.[1] || ''
    const denominator = fraction.match(/<m:den\b[^>]*>([\s\S]*?)<\/m:den>/i)?.[1] || ''
    return `\\frac{${renderOmml(numerator)}}{${renderOmml(denominator)}}`
  }
  if (/<m:sSup\b/i.test(xml)) {
    const base = content('e') || content('r')
    const exponent = xml.match(/<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>/i)?.[1] || ''
    return `${base}^{${renderOmml(exponent)}}`
  }
  if (/<m:sSub\b/i.test(xml)) {
    const base = content('e') || content('r')
    const subscript = xml.match(/<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>/i)?.[1] || ''
    return `${base}_{${renderOmml(subscript)}}`
  }
  if (/<m:rad\b/i.test(xml)) {
    const degree = content('deg')
    const radicand = content('e')
    return degree ? `\\sqrt[${degree}]{${radicand}}` : `\\sqrt{${radicand}}`
  }
  if (/<m:t\b/i.test(xml)) return text(xml.replace(/<m:t\b[^>]*>/i, '').replace(/<\/m:t>/i, ''))
  return xml
    .replace(/<m:br\b[^>]*\/?>(?:<\/m:br>)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

function extractDocxParagraphsWithMath(docXml: string): string[] {
  const paragraphs: string[] = []
  const pRegex = /<w:p\b[\s\S]*?<\/w:p>/gi
  let match: RegExpExecArray | null
  while ((match = pRegex.exec(docXml)) !== null) {
    let paragraph = match[0]
      .replace(/<m:oMathPara\b[\s\S]*?<\/m:oMathPara>/gi, (math) => renderOmml(math))
      .replace(/<m:oMath\b[\s\S]*?<\/m:oMath>/gi, (math) => renderOmml(math))
      .replace(/<w:tab\b[^>]*\/?>(?:<\/w:tab>)?/gi, '\t')
      .replace(/<w:br\b[^>]*\/?>(?:<\/w:br>)?/gi, '\n')
      .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi, (_, value: string) => decodeXmlEntities(value))
      .replace(/<[^>]+>/g, '')
      .trim()
    if (paragraph) paragraphs.push(paragraph)
  }
  return paragraphs
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

  let docXml = ''
  try {
    const zip = await JSZip.loadAsync(buffer)
    docXml = await zip.file('word/document.xml')?.async('text') || ''
  } catch {}

  const xmlParagraphs = docXml ? extractDocxParagraphsWithMath(docXml) : []
  const containsOfficeMath = /<m:oMath(?:Para)?\b/i.test(docXml)

  try {
    const result = await mammoth.extractRawText({ buffer })
    if (result.value && result.value.trim().length > 0 && !containsOfficeMath) {
      return cleanExtractedText(result.value)
    }
  } catch (err) {
    console.warn('Mammoth extraction failed, falling back to XML extraction:', err)
  }

  // JSZip fallback for DOCX
  try {
    if (docXml) {
      const paragraphs = xmlParagraphs.length > 0 ? xmlParagraphs : []
      if (paragraphs.length > 0) {
        return cleanExtractedText(paragraphs.join('\n\n'))
      }
    }
  } catch {}

  return cleanExtractedText(extractBinaryStrings(buffer))
}

/**
 * PDF parser using pdf-parse with buffer safety and automatic OCR fallback for scanned/screenshot PDFs.
 */
export async function parsePDF(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input
  let extracted = ''
  let pages: Array<{ pageNumber: number; text: string }> = []

  try {
    // Keep the renderer's natural page boundaries so the Cornell workspace can
    // attach notes/highlights to actual PDF pages instead of guessed paragraph
    // groups. The OCR fallback below already emits the same marker format.
    const data = await pdfParse(buffer, {
      pagerender: async (pageData: { pageIndex?: number; getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }) => {
        const content = await pageData.getTextContent()
        const pageNumber = (pageData.pageIndex ?? 0) + 1
        const pageText = content.items.map((item) => item.str || '').join(' ').trim()
        pages.push({ pageNumber, text: pageText })
        return `--- Page ${pageNumber} ---\n${pageText}`
      }
    })
    extracted = cleanExtractedText(data.text || '')
  } catch (err) {
    console.warn('pdf-parse digital text extraction failed, checking for scanned pages/OCR:', err)
  }

  // OCR only pages that are likely to contain missing equations. This avoids
  // the old document-wide 50-character shortcut, which incorrectly treated a
  // mixed formula sheet as fully readable because its labels were extractable.
  if (typeof input === 'string' && fs.existsSync(input)) {
    const filename = path.basename(input).toLowerCase()
    const formulaNamed = /(formula|equation|cheat.?sheet|reference)/i.test(filename)
    const requestedPages = new Set(
      pages
        .filter(page => shouldSupplementWithOcr(page.text, formulaNamed))
        .map(page => page.pageNumber)
    )
    if (requestedPages.size > 0 || extracted.length < 50) {
    try {
      const ocrPages = extracted.length < 50
        ? await ocrPdfPages(input)
        : await ocrPdfPages(input, requestedPages)
      const merged = pages.map(page => {
        const ocrText = ocrPages.get(page.pageNumber)
        if (!ocrText) return `--- Page ${page.pageNumber} ---\n${page.text}`
        if (!page.text) return `--- Page ${page.pageNumber} ---\n${ocrText}`
        return `--- Page ${page.pageNumber} ---\n${page.text}\n[Formula OCR]\n${ocrText}`
      })
      if (merged.length > 0) return cleanExtractedText(merged.join('\n\n'))
      if (extracted.length < 50) {
        const ocrResult = cleanExtractedText(Array.from(ocrPages.entries()).map(([page, text]) => `--- Page ${page} ---\n${text}`).join('\n\n'))
        if (ocrResult.length >= 10) return ocrResult
      }
    } catch (ocrErr) {
      console.warn('OCR on scanned PDF failed:', ocrErr)
    }
    }
  }

  if (extracted.length > 0) {
    return extracted
  }

  const fallback = extractBinaryStrings(buffer)
  if (fallback.length > 50) return cleanExtractedText(fallback)
  throw new Error('Failed to parse PDF document: no readable digital text or images recognized.')
}

export function shouldSupplementWithOcr(pageText: string, formulaNamed = false): boolean {
  const text = pageText.trim()
  if (!text) return true
  const letters = (text.match(/[A-Za-z]/g) || []).length
  const mathSignals = (text.match(/[=+\-*/^_∑∫√]|\\(?:frac|sqrt|sum|int|alpha|beta|gamma|Delta)\b/g) || []).length
  const lowTextDensity = text.length < 160 || letters / Math.max(1, text.length) < 0.35
  return formulaNamed ? lowTextDensity || mathSignals > 0 : text.length < 50 || (lowTextDensity && mathSignals > 0)
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
 * Extracts EPUB spine content in reading order. EPUB is a ZIP container whose
 * OPF manifest/spine identifies the XHTML documents that form the book. This
 * intentionally extracts readable text for indexing; visual rendering and
 * annotation locators belong to the renderer adapter layer.
 */
export async function parseEPUB(input: string | Buffer): Promise<string> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input
  const zip = await JSZip.loadAsync(buffer)
  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('Invalid EPUB: missing META-INF/container.xml')

  const containerXml = await containerFile.async('text')
  const rootfileMatch = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i)
  if (!rootfileMatch) throw new Error('Invalid EPUB: missing OPF rootfile')

  const opfPath = rootfileMatch[1].replace(/^\/+/, '')
  const opfFile = zip.file(opfPath)
  if (!opfFile) throw new Error('Invalid EPUB: OPF rootfile not found')
  const opfXml = await opfFile.async('text')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const manifest = new Map<string, string>()
  const itemRegex = /<item\b[^>]*>/gi
  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    const idMatch = itemMatch[0].match(/\bid\s*=\s*["']([^"']+)["']/i)
    const hrefMatch = itemMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!idMatch || !hrefMatch) continue
    let href = hrefMatch[1]
    try { href = decodeURIComponent(href) } catch { /* preserve malformed but usable paths */ }
    manifest.set(idMatch[1], href)
  }

  const spineIds: string[] = []
  const spineMatch = opfXml.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)
  const itemrefRegex = /<itemref\b[^>]*\bidref\s*=\s*["']([^"']+)["'][^>]*>/gi
  let itemrefMatch: RegExpExecArray | null
  while (spineMatch && (itemrefMatch = itemrefRegex.exec(spineMatch[1])) !== null) {
    spineIds.push(itemrefMatch[1])
  }

  const sections: string[] = []
  for (const id of spineIds) {
    const href = manifest.get(id)
    if (!href) continue
    const normalizedPath = path.posix.normalize(path.posix.join(opfDir.replace(/\\/g, '/'), href))
    const chapterFile = zip.file(normalizedPath)
    if (!chapterFile) continue
    const chapterText = parseHTML(await chapterFile.async('text'))
    if (chapterText) sections.push(`--- Chapter ${sections.length + 1} ---\n${chapterText}`)
  }

  if (sections.length === 0) throw new Error('Invalid EPUB: no readable spine content found')
  return sections.join('\n\n')
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
    case 'image':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'heic':
      contentText = await extractTextFromImage(filePath)
      break

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

    case 'epub':
      contentText = await parseEPUB(filePath)
      break

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

  return {
    filename,
    fileType: detectedType,
    contentText,
    originalLength
  }
}
