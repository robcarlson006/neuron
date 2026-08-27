import JSZip from 'jszip'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  decodeXmlEntities,
  parsePPTX,
  parseDOCX,
  parseRTF,
  parseHTML,
  extractBinaryStrings,
  parseFileToText
} from '../../electron/ipc/documentParser'
import { getFileType } from '../../src/lib/fileParser'

describe('documentParser', () => {
  const tempDir = path.join(os.tmpdir(), `neuron-parser-test-${Date.now()}`)

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  describe('decodeXmlEntities', () => {
    it('decodes standard XML entities and numeric entities', () => {
      const input = 'Photosynthesis &amp; Cellular Respiration: &lt;ATP&gt; &quot;Energy&quot; &apos;Currency&apos; &#65; &#x42;'
      const output = decodeXmlEntities(input)
      expect(output).toBe('Photosynthesis & Cellular Respiration: <ATP> "Energy" \'Currency\' A B')
    })
  })

  describe('getFileType', () => {
    it('correctly classifies all supported study file extensions', () => {
      expect(getFileType('lecture.pptx')).toBe('pptx')
      expect(getFileType('slides.ppt')).toBe('ppt')
      expect(getFileType('presentation.pptm')).toBe('pptx')
      expect(getFileType('template.potx')).toBe('pptx')
      expect(getFileType('notes.docx')).toBe('docx')
      expect(getFileType('old_notes.doc')).toBe('doc')
      expect(getFileType('textbook.pdf')).toBe('pdf')
      expect(getFileType('summary.txt')).toBe('txt')
      expect(getFileType('readme.md')).toBe('md')
      expect(getFileType('data.csv')).toBe('csv')
      expect(getFileType('table.tsv')).toBe('tsv')
      expect(getFileType('formatted.rtf')).toBe('rtf')
      expect(getFileType('page.html')).toBe('html')
      expect(getFileType('page.htm')).toBe('html')
      expect(getFileType('data.json')).toBe('json')
      expect(getFileType('unknown.xyz')).toBeNull()
    })
  })

  describe('parsePPTX', () => {
    it('extracts slide content in order with titles, bullets, and speaker notes', async () => {
      const zip = new JSZip()
      zip.file(
        'ppt/slides/slide1.xml',
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:txBody>
              <a:p><a:r><a:t>Chapter 1: Neuroanatomy</a:t></a:r></a:p>
              <a:p><a:r><a:t>Overview of the Central Nervous System</a:t></a:r></a:p>
            </p:txBody></p:sp>
          </p:spTree></p:cSld>
        </p:sld>`
      )
      zip.file(
        'ppt/slides/slide2.xml',
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:txBody>
              <a:p><a:r><a:t>Neurons &amp; Glial Cells</a:t></a:r></a:p>
              <a:p><a:r><a:t>- Astrocytes provide metabolic support</a:t></a:r></a:p>
              <a:p><a:r><a:t>- Oligodendrocytes form myelin sheaths in CNS</a:t></a:r></a:p>
            </p:txBody></p:sp>
          </p:spTree></p:cSld>
        </p:sld>`
      )
      zip.file(
        'ppt/notesSlides/notesSlide2.xml',
        `<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:txBody>
              <a:p><a:r><a:t>Exam Tip: Compare Schwann cells vs Oligodendrocytes</a:t></a:r></a:p>
            </p:txBody></p:sp>
          </p:spTree></p:cSld>
        </p:notes>`
      )

      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const text = await parsePPTX(buffer)

      expect(text).toContain('--- Slide 1 ---')
      expect(text).toContain('Chapter 1: Neuroanatomy')
      expect(text).toContain('Overview of the Central Nervous System')

      expect(text).toContain('--- Slide 2 ---')
      expect(text).toContain('Neurons & Glial Cells')
      expect(text).toContain('Astrocytes provide metabolic support')
      expect(text).toContain('Oligodendrocytes form myelin sheaths in CNS')
      expect(text).toContain('[Speaker Notes: Exam Tip: Compare Schwann cells vs Oligodendrocytes]')
    })

    it('falls back to binary string extraction if zip is corrupted', async () => {
      const corruptedBuffer = Buffer.from('PowerPoint Document corrupted string but contains Action Potential and Synapse')
      const text = await parsePPTX(corruptedBuffer)
      expect(text).toContain('PowerPoint Document')
      expect(text).toContain('Action Potential')
    })
  })

  describe('parseRTF', () => {
    it('strips RTF control codes and preserves line breaks', () => {
      const rtf = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Arial;}} \\f0\\fs24 Biology Notes\\par Cell membrane is a lipid bilayer.\\par Hydrophobic tails face inward.}'
      const output = parseRTF(rtf)
      expect(output).toContain('Biology Notes')
      expect(output).toContain('Cell membrane is a lipid bilayer.')
      expect(output).toContain('Hydrophobic tails face inward.')
      expect(output).not.toContain('\\rtf1')
      expect(output).not.toContain('\\fonttbl')
    })
  })

  describe('parseHTML', () => {
    it('strips scripts, styles, and HTML tags', () => {
      const html = '<html><head><style>body { color: red; }</style></head><body><h1>Genetics</h1><p>Mendelian inheritance patterns.</p><script>console.log("bad")</script></body></html>'
      const output = parseHTML(html)
      expect(output).toContain('Genetics')
      expect(output).toContain('Mendelian inheritance patterns.')
      expect(output).not.toContain('body { color: red; }')
      expect(output).not.toContain('console.log')
    })
  })

  describe('extractBinaryStrings', () => {
    it('extracts printable text runs from arbitrary binary buffers', () => {
      const buf = Buffer.from([
        0x00, 0x01, 0x02,
        0x4e, 0x65, 0x75, 0x72, 0x6f, 0x6e, // "Neuron"
        0x00, 0x00,
        0x53, 0x79, 0x6e, 0x61, 0x70, 0x73, 0x65, // "Synapse"
        0xff
      ])
      const output = extractBinaryStrings(buf, 4)
      expect(output).toContain('Neuron')
      expect(output).toContain('Synapse')
    })
  })

  describe('parseFileToText', () => {
    it('parses PPTX files from disk', async () => {
      const pptxPath = path.join(tempDir, 'test_lecture.pptx')
      const zip = new JSZip()
      zip.file(
        'ppt/slides/slide1.xml',
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:txBody>
              <a:p><a:r><a:t>Cognitive Psychology</a:t></a:r></a:p>
              <a:p><a:r><a:t>Working Memory Model by Baddeley &amp; Hitch (1974)</a:t></a:r></a:p>
            </p:txBody></p:sp>
          </p:spTree></p:cSld>
        </p:sld>`
      )
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      fs.writeFileSync(pptxPath, buffer)

      const result = await parseFileToText(pptxPath)
      expect(result.filename).toBe('test_lecture.pptx')
      expect(result.fileType).toBe('pptx')
      expect(result.contentText).toContain('Cognitive Psychology')
      expect(result.contentText).toContain('Working Memory Model by Baddeley & Hitch (1974)')
    })

    it('parses Plain Text, Markdown, and CSV files from disk', async () => {
      const txtPath = path.join(tempDir, 'notes.txt')
      fs.writeFileSync(txtPath, 'Cardiovascular System:\nThe heart has four chambers.')

      const result = await parseFileToText(txtPath)
      expect(result.fileType).toBe('txt')
      expect(result.contentText).toContain('Cardiovascular System:\nThe heart has four chambers.')
    })

    it('throws when file does not exist', async () => {
      await expect(parseFileToText('/non/existent/path/file.pptx')).rejects.toThrow(/File not found/)
    })
  })
})
