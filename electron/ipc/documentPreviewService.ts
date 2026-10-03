import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, extname, join, posix } from 'path'
import { pathToFileURL } from 'url'
import { promisify } from 'util'
import type Database from 'better-sqlite3'
import JSZip from 'jszip'
import pdfParse from 'pdf-parse'

const execFileAsync = promisify(execFile)

const OFFICE_TYPES = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods'])
const previewCache = new Map<number, { sourcePath: string; mtimeMs: number; size: number; previewPath: string }>()
const previewInFlight = new Map<number, Promise<string | null>>()
const pagePreviewCache = new Map<string, { sourcePath: string; mtimeMs: number; size: number; pagePath: string }>()
const epubChapterCache = new Map<string, { sourcePath: string; mtimeMs: number; size: number; chapterPath: string }>()
let sofficePath: string | null | undefined

export function isOfficeDocument(fileType: string): boolean {
  return OFFICE_TYPES.has(fileType.toLowerCase())
}

function isEpubDocument(fileType: string): boolean {
  return fileType.toLowerCase() === 'epub'
}

function xmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return match?.[1] || null
}

function resolveZipPath(basePath: string, relativePath: string): string {
  return posix.normalize(posix.join(basePath, relativePath)).replace(/^\.\//, '')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function sanitizeEpubMarkup(markup: string): string {
  return markup
    .replace(/<(script|iframe|object|embed|form|base|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|form|base|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"')
    .replace(/<\/?style\b[^>]*>/gi, '')
}

function sanitizeEpubCss(css: string): string {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/url\(\s*["']?\s*(?:https?:|javascript:)[^)]*\)/gi, 'none')
    .replace(/<\/?style\b[^>]*>/gi, '')
}

async function createEpubPreview(sourcePath: string, outputPath: string): Promise<boolean> {
  const zip = await JSZip.loadAsync(readFileSync(sourcePath))
  const container = await zip.file('META-INF/container.xml')?.async('text')
  const rootfilePath = container ? xmlAttribute(container.match(/<rootfile\b[^>]*>/i)?.[0] || '', 'full-path') : null
  if (!rootfilePath) return false
  const opf = await zip.file(rootfilePath)?.async('text')
  if (!opf) return false

  const opfDirectory = posix.dirname(rootfilePath)
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = xmlAttribute(match[0], 'id')
    const href = xmlAttribute(match[0], 'href')
    const mediaType = xmlAttribute(match[0], 'media-type')
    if (id && href && mediaType) manifest.set(id, { href: resolveZipPath(opfDirectory, decodeURIComponent(href)), mediaType })
  }

  const styles: string[] = []
  for (const item of manifest.values()) {
    if (item.mediaType === 'text/css') {
      const css = await zip.file(item.href)?.async('text')
      if (css) styles.push(sanitizeEpubCss(css))
    }
  }

  const imageData = new Map<string, string>()
  for (const item of manifest.values()) {
    if (!item.mediaType.startsWith('image/')) continue
    const image = await zip.file(item.href)?.async('base64')
    if (image) imageData.set(item.href, `data:${item.mediaType};base64,${image}`)
  }

  const spineIds = Array.from(opf.matchAll(/<itemref\b[^>]*>/gi))
    .map((match) => xmlAttribute(match[0], 'idref'))
    .filter((id): id is string => Boolean(id))
  const chapterItems = (spineIds.length > 0 ? spineIds : Array.from(manifest.keys()))
    .map((id) => manifest.get(id))
    .filter((item): item is { href: string; mediaType: string } => item !== undefined && /(?:xhtml|html)/i.test(item.mediaType))

  const chapters: string[] = []
  for (const item of chapterItems) {
    const chapter = await zip.file(item.href)?.async('text')
    if (!chapter) continue
    const chapterDirectory = posix.dirname(item.href)
    const body = sanitizeEpubMarkup((chapter.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || chapter)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\s(?:src|xlink:href)=(['"])([^'"]+)\1/gi, (_whole, quote: string, reference: string) => {
        const asset = imageData.get(resolveZipPath(chapterDirectory, reference.split('#')[0]))
        return asset ? ` src=${quote}${asset}${quote}` : ` src=${quote}${reference}${quote}`
      }))
    chapters.push(`<section id="epub-chapter-${chapters.length + 1}" class="epub-chapter">${body}</section>`)
  }
  if (chapters.length === 0) return false

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: light dark; } body { margin: 0; padding: 2rem 4rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #1e293b; background: #fff; } .epub-chapter { max-width: 58rem; margin: 0 auto 4rem; padding-bottom: 3rem; border-bottom: 1px solid #cbd5e1; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; max-width: 100%; } td, th { border: 1px solid #94a3b8; padding: .35rem .55rem; } @media (prefers-color-scheme: dark) { body { color: #e2e8f0; background: #0f172a; } .epub-chapter { border-color: #475569; } }
    ${styles.join('\n')}
  </style></head><body><h1>${escapeHtml(basename(sourcePath, extname(sourcePath)))}</h1>${chapters.join('\n')}</body></html>`
  writeFileSync(outputPath, html, 'utf8')
  return true
}

async function findSoffice(): Promise<string | null> {
  if (sofficePath !== undefined) return sofficePath
  const runtimeCandidates: string[] = []
  // GUI-launched macOS apps often receive a reduced PATH. In the packaged
  // development/runtime environment, discover bundled workspace utilities
  // without requiring the user to start Neuron from a terminal.
  const runtimeRoot = join(homedir(), '.cache', 'codex-runtimes')
  try {
    for (const runtime of readdirSync(runtimeRoot)) {
      runtimeCandidates.push(join(runtimeRoot, runtime, 'dependencies', 'bin', 'override', 'soffice'))
    }
  } catch { /* optional runtime directory */ }
  const candidates = [
    process.env.NEURON_SOFFICE_PATH,
    ...runtimeCandidates,
    'soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice'
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 10_000 })
      sofficePath = candidate
      return candidate
    } catch {
      // Try the next installation location.
    }
  }
  sofficePath = null
  return null
}

async function resolveMaterialVisualPathInternal(database: Database.Database, materialId: number): Promise<string | null> {
  const row = database.prepare('SELECT file_path, file_type, filename FROM materials WHERE id = ?').get(materialId) as {
    file_path?: string | null
    file_type?: string | null
    filename?: string | null
  } | undefined
  if (!row?.file_path || !existsSync(row.file_path)) return null

  const fileType = (row.file_type || extname(row.file_path).slice(1)).toLowerCase()
  if (!isOfficeDocument(fileType) && !isEpubDocument(fileType)) return row.file_path

  const sourceStats = statSync(row.file_path)
  const cached = previewCache.get(materialId)
  if (cached && cached.sourcePath === row.file_path && cached.mtimeMs === sourceStats.mtimeMs && cached.size === sourceStats.size && existsSync(cached.previewPath)) {
    return cached.previewPath
  }

  const outputDirectory = join(tmpdir(), 'neuron-document-previews')
  mkdirSync(outputDirectory, { recursive: true })

  if (isEpubDocument(fileType)) {
    const outputPath = join(outputDirectory, `${materialId}-${basename(row.filename || row.file_path, extname(row.filename || row.file_path))}.html`)
    try {
      if (!await createEpubPreview(row.file_path, outputPath)) return null
      previewCache.set(materialId, { sourcePath: row.file_path, mtimeMs: sourceStats.mtimeMs, size: sourceStats.size, previewPath: outputPath })
      return outputPath
    } catch (error) {
      console.error(`Could not render ${row.file_path} as an EPUB preview:`, error)
      return null
    }
  }

  const converter = await findSoffice()
  if (!converter) return null

  const outputName = `${basename(row.filename || row.file_path, extname(row.filename || row.file_path))}.pdf`
  const outputPath = join(outputDirectory, `${materialId}-${outputName}`)
  const profileDirectory = join(outputDirectory, `lo-profile-${materialId}-${process.pid}`)
  mkdirSync(profileDirectory, { recursive: true })
  const generatedPath = join(outputDirectory, outputName)
  try {
    const conversionArgs = [
      [
        '--headless',
        `-env:UserInstallation=${pathToFileURL(profileDirectory).toString()}`,
        '--convert-to', 'pdf',
        '--outdir', outputDirectory,
        row.file_path
      ],
      // Some LibreOffice builds reject a custom profile when launched from an
      // app bundle. Retry with the default headless profile before reporting
      // that the visual preview is unavailable.
      ['--headless', '--convert-to', 'pdf', '--outdir', outputDirectory, row.file_path]
    ]
    for (const args of conversionArgs) {
      try {
        if (existsSync(generatedPath)) unlinkSync(generatedPath)
        await execFileAsync(converter, args, { timeout: 120_000 })
        if (existsSync(generatedPath)) break
      } catch (error) {
        console.warn(`Visual conversion attempt failed for ${row.file_path}:`, error)
      }
    }
    if (!existsSync(generatedPath)) return null
    // Give each material a stable, collision-free cache path while retaining
    // the converter's output as the source artifact.
    if (generatedPath !== outputPath) {
      const { copyFileSync } = await import('fs')
      copyFileSync(generatedPath, outputPath)
    }
    previewCache.set(materialId, { sourcePath: row.file_path, mtimeMs: sourceStats.mtimeMs, size: sourceStats.size, previewPath: outputPath })
    return outputPath
  } catch (error) {
    console.error(`Could not render ${row.file_path} as a visual PDF:`, error)
    return null
  }
}

/**
 * Resolve a visual preview once per material at a time. The material workspace
 * asks for both the preview URL and its page count during startup; without
 * this guard those calls can launch concurrent LibreOffice conversions against
 * the same temporary output/profile and leave the renderer waiting forever.
 */
export function resolveMaterialVisualPath(database: Database.Database, materialId: number): Promise<string | null> {
  const existing = previewInFlight.get(materialId)
  if (existing) return existing
  const promise = resolveMaterialVisualPathInternal(database, materialId)
  previewInFlight.set(materialId, promise)
  void promise.finally(() => {
    if (previewInFlight.get(materialId) === promise) previewInFlight.delete(materialId)
  }).catch(() => { /* the original caller receives the rejection */ })
  return promise
}

/** Return the number of visual pages/chapters represented by the preview. */
export async function getMaterialVisualPageCount(database: Database.Database, materialId: number): Promise<number | null> {
  const previewPath = await resolveMaterialVisualPath(database, materialId)
  if (!previewPath || !existsSync(previewPath)) return null

  const row = database.prepare('SELECT file_type FROM materials WHERE id = ?').get(materialId) as { file_type?: string | null } | undefined
  if (row?.file_type?.toLowerCase() === 'epub') {
    const html = readFileSync(previewPath, 'utf8')
    return Math.max(1, (html.match(/id="epub-chapter-\d+"/g) || []).length)
  }
  if (row?.file_type?.toLowerCase() === 'image') return 1

  // Prefer the native utility in the packaged macOS runtime. pdf-parse can
  // wait for a worker setup that is not available in Electron's main process.
  for (const pdfInfoPath of ['/opt/homebrew/bin/pdfinfo', '/usr/local/bin/pdfinfo', 'pdfinfo']) {
    try {
      const { stdout } = await execFileAsync(pdfInfoPath, [previewPath], { timeout: 10_000 })
      const pageMatch = stdout.match(/^Pages:\s*(\d+)/mi)
      if (pageMatch) return Number.parseInt(pageMatch[1], 10)
    } catch {
      // Try the next macOS/Linux utility location.
    }
  }

  try {
    const parsed = await pdfParse(readFileSync(previewPath))
    return parsed.numpages || 1
  } catch (error) {
    console.warn(`Could not count visual pages for material ${materialId}:`, error)
    return null
  }
}

/** Render one PDF/Office page as a standalone image for Neuron's page viewer. */
export async function resolveMaterialVisualPagePath(database: Database.Database, materialId: number, pageNumber: number): Promise<string | null> {
  const previewPath = await resolveMaterialVisualPath(database, materialId)
  if (!previewPath || !existsSync(previewPath) || !Number.isInteger(pageNumber) || pageNumber < 1) return null
  const sourceStats = statSync(previewPath)
  const cacheKey = `${materialId}:${pageNumber}`
  const cached = pagePreviewCache.get(cacheKey)
  if (cached && cached.sourcePath === previewPath && cached.mtimeMs === sourceStats.mtimeMs && cached.size === sourceStats.size && existsSync(cached.pagePath)) {
    return cached.pagePath
  }

  const outputDirectory = join(tmpdir(), 'neuron-document-pages')
  mkdirSync(outputDirectory, { recursive: true })
  const outputPrefix = join(outputDirectory, `${materialId}-page-${pageNumber}`)
  const outputPath = `${outputPrefix}.png`
  try {
    await execFileAsync('/opt/homebrew/bin/pdftoppm', ['-f', String(pageNumber), '-l', String(pageNumber), '-png', '-singlefile', '-r', '144', previewPath, outputPrefix], { timeout: 120_000 })
  } catch {
    try {
      await execFileAsync('pdftoppm', ['-f', String(pageNumber), '-l', String(pageNumber), '-png', '-singlefile', '-r', '144', previewPath, outputPrefix], { timeout: 120_000 })
    } catch (error) {
      console.warn(`Could not render visual page ${pageNumber} for material ${materialId}:`, error)
      return null
    }
  }
  if (!existsSync(outputPath)) return null
  pagePreviewCache.set(cacheKey, { sourcePath: previewPath, mtimeMs: sourceStats.mtimeMs, size: sourceStats.size, pagePath: outputPath })
  return outputPath
}

/** Create an isolated EPUB chapter so the reader cannot scroll into other chapters. */
export async function resolveMaterialVisualChapterPath(database: Database.Database, materialId: number, chapterNumber: number): Promise<string | null> {
  const previewPath = await resolveMaterialVisualPath(database, materialId)
  if (!previewPath || !existsSync(previewPath) || !Number.isInteger(chapterNumber) || chapterNumber < 1) return null
  const sourceStats = statSync(previewPath)
  const cacheKey = `${materialId}:${chapterNumber}`
  const cached = epubChapterCache.get(cacheKey)
  if (cached && cached.sourcePath === previewPath && cached.mtimeMs === sourceStats.mtimeMs && cached.size === sourceStats.size && existsSync(cached.chapterPath)) return cached.chapterPath

  const html = readFileSync(previewPath, 'utf8')
  const chapterMatch = html.match(new RegExp(`<section id="epub-chapter-${chapterNumber}"[^>]*>[\\s\\S]*?<\\/section>`, 'i'))
  if (!chapterMatch) return null
  const head = html.match(/^[\s\S]*?<body\b[^>]*>/i)?.[0] || '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  const outputPath = join(tmpdir(), 'neuron-document-previews', `${materialId}-chapter-${chapterNumber}.html`)
  writeFileSync(outputPath, `${head}${chapterMatch[0]}</body></html>`, 'utf8')
  epubChapterCache.set(cacheKey, { sourcePath: previewPath, mtimeMs: sourceStats.mtimeMs, size: sourceStats.size, chapterPath: outputPath })
  return outputPath
}
