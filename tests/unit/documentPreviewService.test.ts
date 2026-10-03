import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getMaterialVisualPageCount, isOfficeDocument, resolveMaterialVisualChapterPath, resolveMaterialVisualPath } from '../../electron/ipc/documentPreviewService'
import JSZip from 'jszip'

describe('document preview service', () => {
  it('recognizes office formats that need a visual PDF preview', () => {
    expect(isOfficeDocument('pptx')).toBe(true)
    expect(isOfficeDocument('PPT')).toBe(true)
    expect(isOfficeDocument('docx')).toBe(true)
    expect(isOfficeDocument('pdf')).toBe(false)
  })

  it('keeps image materials on their original source path for visual viewing', async () => {
    const sourcePath = join('/tmp', 'neuron-original-image.png')
    writeFileSync(sourcePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const database = {
      prepare: () => ({ get: () => ({ file_path: sourcePath, file_type: 'image', filename: 'neuron-original-image.png' }) })
    } as never

    await expect(resolveMaterialVisualPath(database, 9916)).resolves.toBe(sourcePath)
    await expect(getMaterialVisualPageCount(database, 9916)).resolves.toBe(1)
    expect(existsSync(sourcePath)).toBe(true)
  })

  it('converts a linked office file to a cached visual PDF without changing the source', async () => {
    const sourcePath = join(process.cwd(), 'node_modules/mammoth/test/test-data/tables.docx')
    const database = {
      prepare: () => ({ get: () => ({ file_path: sourcePath, file_type: 'docx', filename: 'tables.docx' }) })
    } as never

    const previewPath = await resolveMaterialVisualPath(database, 9917)
    expect(previewPath).toBeTruthy()
    expect(previewPath).toMatch(/9917-tables\.pdf$/)
    expect(existsSync(previewPath as string)).toBe(true)
    expect(existsSync(sourcePath)).toBe(true)
  })

  it('deduplicates concurrent visual URL and page-count requests for one office material', async () => {
    const sourcePath = join(process.cwd(), 'node_modules/mammoth/test/test-data/tables.docx')
    const database = {
      prepare: () => ({ get: () => ({ file_path: sourcePath, file_type: 'docx', filename: 'tables.docx' }) })
    } as never

    const [previewPath, pageCount] = await Promise.all([
      resolveMaterialVisualPath(database, 9920),
      getMaterialVisualPageCount(database, 9920)
    ])
    expect(previewPath).toBeTruthy()
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })

  it('creates a styled EPUB preview with chapter content and embedded images', async () => {
    const sourcePath = join('/tmp', 'neuron-preview-fixture.epub')
    const zip = new JSZip()
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>')
    zip.file('OPS/package.opf', '<package><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
    zip.file('OPS/chapter.xhtml', '<html><body><h2>Chapter One</h2><p>Visual EPUB content.</p><img src="cover.png" /></body></html>')
    zip.file('OPS/chapter-2.xhtml', '<html><body><h2>Chapter Two</h2><p>Second chapter content.</p></body></html>')
    zip.file('OPS/cover.png', Buffer.from([137, 80, 78, 71]))
    writeFileSync(sourcePath, await zip.generateAsync({ type: 'nodebuffer' }))

    const database = {
      prepare: () => ({ get: () => ({ file_path: sourcePath, file_type: 'epub', filename: 'neuron-preview-fixture.epub' }) })
    } as never
    const previewPath = await resolveMaterialVisualPath(database, 9918)
    const preview = readFileSync(previewPath as string, 'utf8')

    expect(previewPath).toMatch(/9918-neuron-preview-fixture\.html$/)
    expect(preview).toContain('Chapter One')
    expect(preview).toContain('Visual EPUB content.')
    expect(preview).toContain('data:image/png;base64,')
    await expect(getMaterialVisualPageCount(database, 9918)).resolves.toBe(2)
    const chapterPath = await resolveMaterialVisualChapterPath(database, 9918, 1)
    expect(chapterPath).toBeTruthy()
    expect(readFileSync(chapterPath as string, 'utf8')).toContain('Chapter One')
    const secondChapterPath = await resolveMaterialVisualChapterPath(database, 9918, 2)
    expect(secondChapterPath).toBeTruthy()
    const secondChapter = readFileSync(secondChapterPath as string, 'utf8')
    expect(secondChapter).toContain('Chapter Two')
    expect(secondChapter).not.toContain('Chapter One')
  })

  it('removes active EPUB content before embedding chapters in the preview', async () => {
    const sourcePath = join('/tmp', 'neuron-malicious-preview-fixture.epub')
    const zip = new JSZip()
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>')
    zip.file('OPS/package.opf', '<package><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/></spine></package>')
    zip.file('OPS/style.css', '@import url(https://example.com/remote.css); body { background: url(javascript:alert(1)); }')
    zip.file('OPS/chapter.xhtml', '<html><body><script>alert(1)</script><iframe src="https://example.com"></iframe><p onclick="alert(1)">Safe chapter</p><a href="javascript:alert(1)">Read</a></body></html>')
    writeFileSync(sourcePath, await zip.generateAsync({ type: 'nodebuffer' }))

    const database = {
      prepare: () => ({ get: () => ({ file_path: sourcePath, file_type: 'epub', filename: 'neuron-malicious-preview-fixture.epub' }) })
    } as never
    const previewPath = await resolveMaterialVisualPath(database, 9919)
    const preview = readFileSync(previewPath as string, 'utf8')

    expect(preview).toContain('Safe chapter')
    expect(preview).not.toContain('<script')
    expect(preview).not.toContain('<iframe')
    expect(preview).not.toContain('onclick=')
    expect(preview).not.toContain('javascript:')
    expect(preview).not.toContain('@import')
  })
})
