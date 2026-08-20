/**
 * Renderer-safe text chunking utilities for RAG.
 * Splits documents into chunks suitable for embedding and retrieval.
 */

export interface Chunk {
  text: string
  index: number
}

export interface ChunkOptions {
  chunkSize?: number    // default: 500 chars
  chunkOverlap?: number // default: 50 chars
}

/**
 * Split text into chunks with intelligent boundary detection.
 *
 * Strategy:
 * 1. Split by paragraphs first
 * 2. If a paragraph exceeds chunkSize, split it by sentences
 * 3. If a sentence still exceeds chunkSize, split by character with overlap
 * 4. Preserve word boundaries in character splits
 */
export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize ?? 500
  const chunkOverlap = options?.chunkOverlap ?? 50

  if (!text || text.trim().length === 0) return []

  // Split by paragraphs (double newlines, then single newlines)
  const paragraphs = splitIntoParagraphs(text)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= chunkSize) {
      chunks.push(para)
    } else {
      // Paragraph is too long — split by sentences
      const sentences = splitIntoSentences(para)
      let current = ''

      for (const sentence of sentences) {
        if (sentence.length > chunkSize) {
          // Sentence is too long — flush current buffer then split by character
          if (current.trim()) {
            chunks.push(current.trim())
            current = ''
          }
          const charChunks = splitByCharacter(sentence, chunkSize, chunkOverlap)
          chunks.push(...charChunks)
        } else if (current.length + sentence.length <= chunkSize) {
          current += sentence
        } else {
          // Current buffer is full — flush and start new
          if (current.trim()) {
            chunks.push(current.trim())
          }
          current = sentence
        }
      }

      if (current.trim()) {
        chunks.push(current.trim())
      }
    }
  }

  return chunks.map((text, index) => ({ text, index }))
}

/**
 * Split text into paragraphs (by double newline, then single newline).
 */
function splitIntoParagraphs(text: string): string[] {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n')

  // Split by double newlines first (paragraph breaks)
  const doubleBreak = normalized.split(/\n\s*\n/)
  const result: string[] = []

  for (const block of doubleBreak) {
    const trimmed = block.trim()
    if (!trimmed) continue

    // If block is still large, split by single newlines
    if (trimmed.includes('\n')) {
      const lines = trimmed.split('\n').filter(l => l.trim())
      for (const line of lines) {
        if (line.trim()) result.push(line.trim())
      }
    } else {
      result.push(trimmed)
    }
  }

  return result
}

/**
 * Split text into sentences with basic boundary detection.
 * Handles common abbreviations to avoid false splits.
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence-splitting regex that handles common abbreviations
  const sentenceEnders = /(?<=[.!?])\s+(?=[A-Z"'(])/g

  // Protect common abbreviations
  const protectedText = text
    .replace(/\b(e\.g\.)/g, 'EG_PLACEHOLDER')
    .replace(/\b(i\.e\.)/g, 'IE_PLACEHOLDER')
    .replace(/\b(etc\.)/g, 'ETC_PLACEHOLDER')
    .replace(/\b(vs\.)/g, 'VS_PLACEHOLDER')
    .replace(/\b(Dr\.)/g, 'DR_PLACEHOLDER')
    .replace(/\b(Mr\.)/g, 'MR_PLACEHOLDER')
    .replace(/\b(Mrs\.)/g, 'MRS_PLACEHOLDER')
    .replace(/\b(Prof\.)/g, 'PROF_PLACEHOLDER')

  const parts = protectedText.split(sentenceEnders).filter(s => s.trim().length > 0)

  // Restore abbreviations
  return parts.map(p =>
    p
      .replace(/EG_PLACEHOLDER/g, 'e.g.')
      .replace(/IE_PLACEHOLDER/g, 'i.e.')
      .replace(/ETC_PLACEHOLDER/g, 'etc.')
      .replace(/VS_PLACEHOLDER/g, 'vs.')
      .replace(/DR_PLACEHOLDER/g, 'Dr.')
      .replace(/MR_PLACEHOLDER/g, 'Mr.')
      .replace(/MRS_PLACEHOLDER/g, 'Mrs.')
      .replace(/PROF_PLACEHOLDER/g, 'Prof.')
      .trim()
  )
}

/**
 * Split text by character count with word-boundary awareness and overlap.
 */
function splitByCharacter(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize

    if (end >= text.length) {
      // Last chunk
      chunks.push(text.slice(start).trim())
      break
    }

    // Try to break at a word boundary
    const boundary = findWordBoundary(text, end)
    if (boundary > start) {
      end = boundary
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap

    // Prevent infinite loop if overlap >= chunkSize
    if (start < 0) start = 0
    if (start >= text.length - 1) break
  }

  return chunks.filter(c => c.length > 0)
}

/**
 * Find the last word boundary (space) before or at the given position.
 * Returns position if found, otherwise returns the original position.
 */
function findWordBoundary(text: string, position: number): number {
  if (position >= text.length) return text.length

  // If we're already at a space, try to find the sentence end
  if (/\s/.test(text[position])) {
    return position
  }

  // Look backward for a space within 30 chars
  const lookBackStart = Math.max(0, position - 30)
  for (let i = position; i >= lookBackStart; i--) {
    if (/\s/.test(text[i])) {
      return i
    }
  }

  // Look forward for a space within 30 chars
  const lookAheadEnd = Math.min(text.length, position + 30)
  for (let i = position; i < lookAheadEnd; i++) {
    if (/\s/.test(text[i])) {
      return i
    }
  }

  // No word boundary found — split at position anyway
  return position
}

/**
 * Split text into paragraph-level chunks (each paragraph is a chunk).
 */
export function chunkByParagraph(text: string, maxChunkSize?: number): string[] {
  const paragraphs = splitIntoParagraphs(text)
  if (!maxChunkSize) return paragraphs

  const result: string[] = []
  for (const para of paragraphs) {
    if (para.length <= maxChunkSize) {
      result.push(para)
    } else {
      // Split long paragraphs further
      const subChunks = splitByCharacter(para, maxChunkSize, 0)
      result.push(...subChunks)
    }
  }
  return result
}

/**
 * Split text into sentence-level chunks.
 */
export function chunkBySentence(text: string, maxChunkSize?: number): string[] {
  const sentences = splitIntoSentences(text)
  if (!maxChunkSize) return sentences

  const result: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChunkSize) {
      if (current.trim()) {
        result.push(current.trim())
        current = ''
      }
      result.push(sentence)
    } else if (current.length + sentence.length <= maxChunkSize) {
      current += sentence
    } else {
      if (current.trim()) result.push(current.trim())
      current = sentence
    }
  }

  if (current.trim()) result.push(current.trim())
  return result
}
