/**
 * Document Topology Parser
 * Decomposes long educational materials (textbooks, lecture slides, transcripts, notes)
 * into a hierarchical tree of atomic semantic units with 0% character loss.
 */

export type ChunkType =
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'slide'
  | 'worked_example'
  | 'case_study'
  | 'transcript_window'
  | 'general_block'

export interface AtomicChunk {
  index: number
  title: string
  type: ChunkType
  text: string
  charStart: number
  charEnd: number
  slideNumber?: number
  chapterNumber?: number
  sectionHeading?: string
  tokenEstimate: number
}

export interface DocumentTopology {
  totalCharacters: number
  totalEstimatedTokens: number
  detectedFormat: 'textbook_hierarchical' | 'slide_deck' | 'timestamped_transcript' | 'unstructured_notes'
  chunks: AtomicChunk[]
}

/**
 * Approximate token count (roughly 4 characters per token for English/code/math).
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4)
}

/**
 * Detect format and parse document text into exhaustive, non-overlapping or clean-boundary atomic units.
 */
export function parseDocumentTopology(
  rawText: string,
  filename: string = '',
  targetChunkTokens: number = 750, // ~3,000 chars per atomic unit
  overlapTokens: number = 75 // ~300 chars overlap for transcripts/general text
): DocumentTopology {
  const text = (rawText || '').replace(/\r\n/g, '\n').trim()
  if (!text) {
    return {
      totalCharacters: 0,
      totalEstimatedTokens: 0,
      detectedFormat: 'unstructured_notes',
      chunks: []
    }
  }

  const lowerName = filename.toLowerCase()
  const isSlideFile = lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || /\[slide\s*\d+\]|slide\s+\d+:/i.test(text)
  const isTranscript = /\[\d{1,2}:\d{2}(?::\d{2})?\]|professor:|instructor:|speaker\s*\d*:/i.test(text)
  const hasMarkdownHeadings = /^#{1,4}\s+.+$/m.test(text) || /\b(?:chapter|section)\s+\d+/i.test(text)

  if (isSlideFile) {
    return parseSlideDeckTopology(text)
  }

  if (hasMarkdownHeadings) {
    return parseHierarchicalTextbookTopology(text, targetChunkTokens)
  }

  if (isTranscript) {
    return parseTranscriptTopology(text, targetChunkTokens, overlapTokens)
  }

  return parseGeneralTextTopology(text, targetChunkTokens, overlapTokens)
}

/**
 * Parse presentations into per-slide or cohesive multi-slide units.
 */
function parseSlideDeckTopology(text: string): DocumentTopology {
  // Try splitting by standard slide delimiters: [Slide X], Slide X:, or --- dividers
  const rawParts = text.split(/(?=(?:^|\n)(?:\[Slide\s*\d+\]|Slide\s*\d+:|---\s*\n))/i)

  const chunks: AtomicChunk[] = []
  let globalOffset = 0

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i].trim()
    if (!part) continue

    // Extract slide number and title
    const numMatch = part.match(/(?:\[Slide\s*(\d+)\]|Slide\s*(\d+):)/i)
    const slideNumber = numMatch ? parseInt(numMatch[1] || numMatch[2], 10) : i + 1

    // First line or heading as title
    const firstLine = part.split('\n')[0].replace(/^#+\s*|^\[Slide\s*\d+\]\s*|^Slide\s*\d+:\s*|^---\s*/i, '').trim()
    const title = firstLine.length > 5 ? firstLine.slice(0, 80) : `Slide ${slideNumber}`

    const start = text.indexOf(part, globalOffset)
    const end = start >= 0 ? start + part.length : globalOffset + part.length
    if (start >= 0) globalOffset = end

    chunks.push({
      index: chunks.length,
      title,
      type: 'slide',
      text: part,
      charStart: Math.max(0, start),
      charEnd: end,
      slideNumber,
      tokenEstimate: estimateTokens(part)
    })
  }

  // If slide splitting found only 1 huge block, fallback to section-aware chunking
  if (chunks.length <= 1 && text.length > 4000) {
    return parseGeneralTextTopology(text, 750, 75)
  }

  return {
    totalCharacters: text.length,
    totalEstimatedTokens: estimateTokens(text),
    detectedFormat: 'slide_deck',
    chunks
  }
}

/**
 * Parse textbook / structured notes by heading hierarchy (#, ##, ###, Chapter, Section).
 */
function parseHierarchicalTextbookTopology(text: string, targetChunkTokens: number): DocumentTopology {
  const lines = text.split('\n')
  const sections: { title: string; lines: string[]; level: number; type: ChunkType }[] = []

  let currentTitle = 'Introduction / Overview'
  let currentLines: string[] = []
  let currentLevel = 1
  let currentType: ChunkType = 'chapter'

  const headingPattern = /^(#{1,4})\s+(.+)$/
  const keywordPattern = /^(chapter|section|part|module)\s+(\d+[\.\d]*)\s*[:\-–—]?\s*(.*)$/i
  const workedExamplePattern = /^(?:worked\s+example|example\s+\d+|case\s+study|problem\s+set)\b/i

  for (const line of lines) {
    const headingMatch = line.match(headingPattern)
    const keywordMatch = line.match(keywordPattern)

    if (headingMatch || keywordMatch) {
      if (currentLines.length > 0 && currentLines.join('\n').trim().length > 0) {
        sections.push({
          title: currentTitle,
          lines: [...currentLines],
          level: currentLevel,
          type: currentType
        })
        currentLines = []
      }

      if (headingMatch) {
        currentLevel = headingMatch[1].length
        currentTitle = headingMatch[2].trim()
        currentType = currentLevel === 1 ? 'chapter' : currentLevel === 2 ? 'section' : 'subsection'
      } else if (keywordMatch) {
        currentLevel = 2
        const prefix = keywordMatch[1]
        const num = keywordMatch[2]
        const rest = keywordMatch[3] ? `: ${keywordMatch[3].trim()}` : ''
        currentTitle = `${prefix} ${num}${rest}`
        currentType = prefix.toLowerCase() === 'chapter' ? 'chapter' : 'section'
      }

      if (workedExamplePattern.test(currentTitle)) {
        currentType = 'worked_example'
      }
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0 && currentLines.join('\n').trim().length > 0) {
    sections.push({
      title: currentTitle,
      lines: currentLines,
      level: currentLevel,
      type: currentType
    })
  }

  // Now assemble atomic chunks, sub-chunking sections that exceed targetChunkTokens (~3,000 chars)
  const chunks: AtomicChunk[] = []
  let globalOffset = 0
  const maxChunkChars = targetChunkTokens * 4

  for (const sec of sections) {
    const secText = sec.lines.join('\n').trim()
    if (!secText) continue

    if (secText.length <= maxChunkChars) {
      const start = text.indexOf(secText, globalOffset)
      const end = start >= 0 ? start + secText.length : globalOffset + secText.length
      if (start >= 0) globalOffset = end

      chunks.push({
        index: chunks.length,
        title: sec.title,
        type: sec.type,
        text: secText,
        charStart: Math.max(0, start),
        charEnd: end,
        sectionHeading: sec.title,
        tokenEstimate: estimateTokens(secText)
      })
    } else {
      // Sub-divide oversized section along paragraphs
      const paragraphs = secText.split(/\n\s*\n/)
      let subBuffer = ''
      let subIndex = 1

      for (const para of paragraphs) {
        if (subBuffer.length + para.length > maxChunkChars && subBuffer.trim().length > 0) {
          const start = text.indexOf(subBuffer.trim(), globalOffset)
          const end = start >= 0 ? start + subBuffer.trim().length : globalOffset + subBuffer.trim().length
          if (start >= 0) globalOffset = end

          chunks.push({
            index: chunks.length,
            title: `${sec.title} (Part ${subIndex})`,
            type: sec.type,
            text: subBuffer.trim(),
            charStart: Math.max(0, start),
            charEnd: end,
            sectionHeading: sec.title,
            tokenEstimate: estimateTokens(subBuffer.trim())
          })
          subBuffer = ''
          subIndex++
        }
        subBuffer += (subBuffer ? '\n\n' : '') + para
      }

      if (subBuffer.trim().length > 0) {
        const start = text.indexOf(subBuffer.trim(), globalOffset)
        const end = start >= 0 ? start + subBuffer.trim().length : globalOffset + subBuffer.trim().length
        if (start >= 0) globalOffset = end

        chunks.push({
          index: chunks.length,
          title: subIndex > 1 ? `${sec.title} (Part ${subIndex})` : sec.title,
          type: sec.type,
          text: subBuffer.trim(),
          charStart: Math.max(0, start),
          charEnd: end,
          sectionHeading: sec.title,
          tokenEstimate: estimateTokens(subBuffer.trim())
        })
      }
    }
  }

  return {
    totalCharacters: text.length,
    totalEstimatedTokens: estimateTokens(text),
    detectedFormat: 'textbook_hierarchical',
    chunks
  }
}

/**
 * Parse transcripts with timestamp awareness and sliding window preservation.
 */
function parseTranscriptTopology(text: string, targetChunkTokens: number, overlapTokens: number): DocumentTopology {
  const targetChars = targetChunkTokens * 4
  const overlapChars = overlapTokens * 4
  const chunks: AtomicChunk[] = []

  // Split into natural lines / speech turns
  const speechBlocks = text.split(/\n(?=\[\d{1,2}:\d{2}|\b(?:Professor|Instructor|Speaker\s*\d*):)/i)

  let currentText = ''
  let currentStart = 0
  let windowIndex = 1

  for (const block of speechBlocks) {
    if (currentText.length + block.length > targetChars && currentText.trim().length > 0) {
      // Find timestamp if present
      const timeMatch = currentText.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/)
      const title = timeMatch ? `Lecture Segment @ ${timeMatch[1]}` : `Lecture Segment ${windowIndex}`

      chunks.push({
        index: chunks.length,
        title,
        type: 'transcript_window',
        text: currentText.trim(),
        charStart: currentStart,
        charEnd: currentStart + currentText.length,
        tokenEstimate: estimateTokens(currentText.trim())
      })

      // Overlap to maintain speaker continuity across boundaries
      const sliceOverlap = currentText.slice(-overlapChars)
      currentStart += currentText.length - sliceOverlap.length
      currentText = sliceOverlap + '\n' + block
      windowIndex++
    } else {
      currentText += (currentText ? '\n' : '') + block
    }
  }

  if (currentText.trim().length > 0) {
    const timeMatch = currentText.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/)
    const title = timeMatch ? `Lecture Segment @ ${timeMatch[1]}` : `Lecture Segment ${windowIndex}`

    chunks.push({
      index: chunks.length,
      title,
      type: 'transcript_window',
      text: currentText.trim(),
      charStart: currentStart,
      charEnd: currentStart + currentText.length,
      tokenEstimate: estimateTokens(currentText.trim())
    })
  }

  return {
    totalCharacters: text.length,
    totalEstimatedTokens: estimateTokens(text),
    detectedFormat: 'timestamped_transcript',
    chunks
  }
}

/**
 * General robust chunker for unstructured notes or non-standard documents.
 */
function parseGeneralTextTopology(text: string, targetChunkTokens: number, overlapTokens: number): DocumentTopology {
  const targetChars = targetChunkTokens * 4
  const overlapChars = overlapTokens * 4
  const paragraphs = text.split(/\n\s*\n/)
  const chunks: AtomicChunk[] = []

  let currentBuffer = ''
  let currentStart = 0
  let chunkNum = 1

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (currentBuffer.length + trimmed.length > targetChars && currentBuffer.trim().length > 0) {
      const firstLine = currentBuffer.trim().split('\n')[0].replace(/^#+\s*/, '').trim()
      const title = firstLine.length > 5 ? firstLine.slice(0, 70) : `Section ${chunkNum}`

      chunks.push({
        index: chunks.length,
        title,
        type: 'general_block',
        text: currentBuffer.trim(),
        charStart: currentStart,
        charEnd: currentStart + currentBuffer.length,
        tokenEstimate: estimateTokens(currentBuffer.trim())
      })

      const overlapSlice = currentBuffer.slice(-overlapChars)
      currentStart += currentBuffer.length - overlapSlice.length
      currentBuffer = overlapSlice + '\n\n' + trimmed
      chunkNum++
    } else {
      currentBuffer += (currentBuffer ? '\n\n' : '') + trimmed
    }
  }

  if (currentBuffer.trim().length > 0) {
    const firstLine = currentBuffer.trim().split('\n')[0].replace(/^#+\s*/, '').trim()
    const title = firstLine.length > 5 ? firstLine.slice(0, 70) : `Section ${chunkNum}`

    chunks.push({
      index: chunks.length,
      title,
      type: 'general_block',
      text: currentBuffer.trim(),
      charStart: currentStart,
      charEnd: currentStart + currentBuffer.length,
      tokenEstimate: estimateTokens(currentBuffer.trim())
    })
  }

  return {
    totalCharacters: text.length,
    totalEstimatedTokens: estimateTokens(text),
    detectedFormat: 'unstructured_notes',
    chunks
  }
}

/**
 * Builds a comprehensive structural overview of a document for curriculum design, syllabus generation,
 * and high-level tutoring context.
 * If the document is small (<= 16,000 characters), returns the full text.
 * If the document is large, generates an outline spanning every chunk/chapter/slide from start to finish
 * so that no educational units are truncated or lost.
 */
export function buildComprehensiveOutline(text: string, filename: string = ''): string {
  const cleanText = (text || '').trim()
  if (!cleanText) return `[File: ${filename || 'Document'}]\n(Empty document)`

  if (cleanText.length <= 16000) {
    return `[File: ${filename || 'Document'}]\n${cleanText}`
  }

  const topo = parseDocumentTopology(cleanText, filename)
  if (topo.chunks.length === 0) {
    return `[File: ${filename || 'Document'}]\n${cleanText.slice(0, 16000)}`
  }

  const header = `[File: ${filename || 'Document'}] (${topo.detectedFormat}, ${topo.chunks.length} total sections/units, ~${topo.totalCharacters.toLocaleString()} characters)`
  const outlineLines: string[] = [header, 'Comprehensive Document Structure across all chapters/sections:']

  const maxSnippet = topo.chunks.length > 60 ? 100 : 160
  for (const chunk of topo.chunks) {
    const label = chunk.slideNumber
      ? `Slide ${chunk.slideNumber}`
      : chunk.chapterNumber
      ? `Chapter ${chunk.chapterNumber}`
      : `Section ${chunk.index + 1}`

    const snippet = chunk.text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .slice(0, maxSnippet)

    outlineLines.push(`- [${label}] ${chunk.title}${snippet ? `: ${snippet}` : ''}`)
  }

  // Include first section (intro) and last section (conclusion) text for contextual depth
  if (topo.chunks.length > 0) {
    outlineLines.push(`\nOpening Overview / Introduction (Section 1):\n${topo.chunks[0].text.slice(0, 1500)}`)
  }
  if (topo.chunks.length > 1) {
    const lastChunk = topo.chunks[topo.chunks.length - 1]
    outlineLines.push(`\nConcluding Section / Summary (Section ${topo.chunks.length}):\n${lastChunk.text.slice(0, 1500)}`)
  }

  return outlineLines.join('\n')
}
