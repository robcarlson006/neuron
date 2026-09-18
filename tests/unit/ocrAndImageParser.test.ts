import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  extractEmbeddedImagesFromPdf,
  extractTextFromImage,
  ocrScannedPdf
} from '../../electron/ipc/ocrHelper'
import { parsePDF, parseFileToText } from '../../electron/ipc/documentParser'
import { getFileType } from '../../src/lib/fileParser'

describe('OCR and Image Parser Pipeline', () => {
  const tempDir = path.join(os.tmpdir(), `neuron-ocr-test-${Date.now()}`)

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  describe('Image extension detection', () => {
    it('detects screenshots and photos as image type', () => {
      expect(getFileType('screenshot_2026.png')).toBe('image')
      expect(getFileType('calc_homework.jpg')).toBe('image')
      expect(getFileType('exam_page.jpeg')).toBe('image')
      expect(getFileType('problem_set.webp')).toBe('image')
      expect(getFileType('ios_scan.heic')).toBe('image')
    })
  })

  describe('extractEmbeddedImagesFromPdf', () => {
    it('extracts embedded JPEG DCTDecode streams from PDF buffer', () => {
      // Mock a minimal PDF containing an image object with DCTDecode
      const fakeJpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])
      const mockPdf = Buffer.concat([
        Buffer.from('%PDF-1.4\n5 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /Filter /DCTDecode >>\nstream\n'),
        fakeJpegData,
        Buffer.from('\nendstream\nendobj\n%%EOF')
      ])

      const extracted = extractEmbeddedImagesFromPdf(mockPdf)
      expect(extracted.length).toBe(1)
      expect(extracted[0]).toEqual(fakeJpegData)
    })

    it('returns empty array when PDF has no embedded images', () => {
      const textPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
      const extracted = extractEmbeddedImagesFromPdf(textPdf)
      expect(extracted).toEqual([])
    })
  })

  describe('extractTextFromImage', () => {
    it('handles non-existent image gracefully with error', async () => {
      await expect(extractTextFromImage('/path/to/nonexistent/image.png')).rejects.toThrow(/not found/)
    })

    it('processes image buffer without crashing', async () => {
      const dummyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const text = await extractTextFromImage(dummyPng)
      expect(typeof text).toBe('string')
    })
  })

  describe('parsePDF with scanned fallback', () => {
    it('falls back to OCR when digital text is minimal', async () => {
      // PDF with zero digital text
      const emptyPdfPath = path.join(tempDir, 'scanned_exam.pdf')
      const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
      fs.writeFileSync(emptyPdfPath, minimalPdf)

      // It should attempt OCR and throw if completely empty / unparsable
      await expect(parsePDF(emptyPdfPath)).rejects.toThrow()
    })
  })
})
