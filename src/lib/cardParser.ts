/**
 * Parse flashcards and active recall questions from AI-generated text.
 * Supports multiple formats:
 * - **Term** → Definition (markdown bold arrow)
 * - Front: ... Back: ... (labeled format)
 * - [Q] ... [A] ... (bracket format)
 * - Q: ... A: ... (labeled format)
 * - term ... definition (separation by · or • or —)
 * - Numbered lists with Q/A or term/definition pairs
 */

import type { ParsedCard } from '../types'

/**
 * Strips unnecessary square brackets around terms, concepts, questions, or answers
 * (e.g. "[Mitochondria]" -> "Mitochondria", "[Action Potential] is ..." -> "Action Potential is ...",
 * "What is the role of [chloroplasts] in [photosynthesis]?" -> "What is the role of chloroplasts in photosynthesis?")
 * while preserving legitimate brackets such as:
 * - LaTeX math ($...$ or $$...$$)
 * - Code blocks and array indexing (arr[i])
 * - Markdown links ([text](url))
 * - Fill-in-the-blank placeholders ([___], [...])
 * - Numeric citations ([1], [2])
 */
export function cleanCardBrackets(text: string): string {
  if (!text || typeof text !== 'string') return ''

  // Step 1: Protect LaTeX math expressions ($...$ or $$...$$) and code blocks (`...`)
  const protectedBlocks: string[] = []
  let placeholderIndex = 0

  let protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|`[^`\n]+?`)/g, (match) => {
    const placeholder = `___PROTECTED_BLOCK_${placeholderIndex++}___`
    protectedBlocks.push(match)
    return placeholder
  })

  // Step 2: Protect markdown links [text](url)
  protectedText = protectedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    const placeholder = `___PROTECTED_BLOCK_${placeholderIndex++}___`
    protectedBlocks.push(match)
    return placeholder
  })

  // Step 3: Protect blank placeholders like [___], [...], [..], [?]
  protectedText = protectedText.replace(/\[([\s_.\-?]+)\]/g, (match) => {
    const placeholder = `___PROTECTED_BLOCK_${placeholderIndex++}___`
    protectedBlocks.push(match)
    return placeholder
  })

  // Step 4: Protect code array indices like arr[i], items[0], data[key]
  protectedText = protectedText.replace(/(\w+)\[([a-zA-Z0-9_$]+)\]/g, (_match, p1, p2) => {
    const placeholder = `___PROTECTED_BLOCK_${placeholderIndex++}___`
    protectedBlocks.push(`${p1}[${p2}]`)
    return placeholder
  })

  // Step 5: Clean unnecessary brackets wrapping whole text or individual terms/phrases
  let cleaned = protectedText.replace(/\[([^\]]+)\]/g, (_match, inner) => {
    return inner.trim()
  })

  // If text starts with [ and ends with ] that might have been unclosed or outer-wrapped
  cleaned = cleaned.replace(/^\[\s*(.*?)\s*\]$/, '$1')

  // Step 6: Restore protected blocks using function callback to avoid $$ string replacement escape
  for (let i = 0; i < protectedBlocks.length; i++) {
    cleaned = cleaned.replace(`___PROTECTED_BLOCK_${i}___`, () => protectedBlocks[i])
  }

  return cleaned.trim()
}

/**
 * Extract leading domain context tag (e.g., "[Cardiology: Anatomy]" -> "Cardiology: Anatomy")
 */
export function extractContextTag(text: string): { tag?: string; textWithoutTag: string } {
  const match = text.match(/^\s*\[([A-Za-z0-9\s:,\-_/]+)\]\s*(.*)$/)
  if (match) {
    return {
      tag: match[1].trim(),
      textWithoutTag: match[2].trim()
    }
  }
  return { textWithoutTag: text }
}

/**
 * Parse raw unadorned Tab-Separated Values (TSV) flashcards
 * Expected 4-field schema: ContextTag \t Question \t Answer \t Explanation
 * or 3-field: Question \t Answer \t Explanation
 * or 2-field: Front \t Back
 */
export function parseTSVFlashcards(tsvText: string): ParsedCard[] {
  const lines = tsvText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const cards: ParsedCard[] = []

  for (const line of lines) {
    // Skip comment lines or markdown fences
    if (line.startsWith('#') || line.startsWith('```')) continue

    const fields = line.split('\t').map(f => f.trim())
    if (fields.length >= 4) {
      const tag = fields[0]
      const question = fields[1]
      const answer = fields[2]
      const explanation = fields[3]
      const front = tag ? `[${tag}] ${cleanCardFront(question)}` : cleanCardFront(question)
      const back = explanation ? `${cleanCardBack(answer)}\n\n_Note: ${explanation}_` : cleanCardBack(answer)
      const isRecall = /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List|Which)/i.test(question) || question.endsWith('?')
      cards.push({
        type: isRecall ? 'active_recall' : 'flashcard',
        front,
        back
      })
    } else if (fields.length === 3) {
      const question = fields[0]
      const answer = fields[1]
      const explanation = fields[2]
      const front = cleanCardFront(question)
      const back = explanation ? `${cleanCardBack(answer)}\n\n_Note: ${explanation}_` : cleanCardBack(answer)
      const isRecall = /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List|Which)/i.test(question) || question.endsWith('?')
      cards.push({
        type: isRecall ? 'active_recall' : 'flashcard',
        front,
        back
      })
    } else if (fields.length === 2) {
      const front = cleanCardFront(fields[0])
      const back = cleanCardBack(fields[1])
      if (front && back) {
        const isRecall = /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List|Which)/i.test(front) || front.endsWith('?')
        cards.push({
          type: isRecall ? 'active_recall' : 'flashcard',
          front,
          back
        })
      }
    }
  }

  return cards
}

function cleanCardFront(rawFront: string): string {
  let cleaned = rawFront.trim()
  // Strip outer bold/italic if entire string is wrapped in **...** or *...*
  cleaned = cleaned.replace(/^\*{1,3}(.+?)\*{1,3}$/s, '$1').trim()
  // Strip leading numbering or bullet prefixes: "1. ", "1) ", "Card 1: ", "Q1: ", "- ", "• "
  cleaned = cleaned.replace(/^(?:(?:Card\s*\d+|Q\d+|\d+)[.:)]\s*|[-*•]\s*)/i, '').trim()
  // In case outer bold was after the number: "1. **Term**" -> "**Term**" -> "Term"
  cleaned = cleaned.replace(/^\*{1,3}(.+?)\*{1,3}$/s, '$1').trim()
  // Clean unnecessary brackets
  cleaned = cleanCardBrackets(cleaned)
  return cleaned
}

function cleanCardBack(rawBack: string): string {
  let cleaned = rawBack.trim()
  // Strip leading bullet or dash if present
  cleaned = cleaned.replace(/^[-*•]\s*/, '').trim()
  // Clean unnecessary brackets
  cleaned = cleanCardBrackets(cleaned)
  return cleaned
}

export function parseCardsFromText(text: string): ParsedCard[] {
  const cards: ParsedCard[] = []

  // Split into logical segments
  const segments = splitSegments(text)

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed.length < 10) continue

    // Pattern 1: [optional number/bullet] **Front** → Back (markdown bold arrow)
    const boldArrowMatch = trimmed.match(/^(?:(?:Card\s*\d+|Q\d+|\d+)[.:)]\s*|[-*•]\s*)?\*\*(.+?)\*\*\s*(?:→|->|=>|—|–|-)\s*(.+)$/s)
    if (boldArrowMatch) {
      const front = cleanCardFront(boldArrowMatch[1])
      const back = cleanCardBack(boldArrowMatch[2])
      if (front && back) {
        const isRecall = /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List|What is|What are|What does|Can you|Describe how)/i.test(front) || front.endsWith('?')
        cards.push({
          type: isRecall ? 'active_recall' : 'flashcard',
          front,
          back
        })
        continue
      }
    }

    // Pattern 2: Front: ... Back: ... or Question: ... Answer: ...
    const labeledMatch = trimmed.match(/^(?:Front|Question|Term|Q)\s*[:：]\s*(.+?)\s*(?:Back|Answer|Definition|A)\s*[:：]\s*(.+)$/is)
    if (labeledMatch) {
      const front = cleanCardFront(labeledMatch[1])
      const back = cleanCardBack(labeledMatch[2])
      if (front && back) {
        const isExplicitFront = /^(?:Front|Term)\s*[:：]/i.test(trimmed)
        const isRecall = !isExplicitFront && (/^(?:Question|Q)\s*[:：]/i.test(trimmed) || /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List)/i.test(front) || front.endsWith('?'))
        cards.push({
          type: isRecall ? 'active_recall' : 'flashcard',
          front,
          back
        })
        continue
      }
    }

    // Pattern 3: [Q] ... [A] ... or [Front] ... [Back] ...
    const bracketMatch = trimmed.match(/^\[(?:Q|Question)\]\s*(.+?)\s*\[(?:A|Answer)\]\s*(.+)$/is)
    if (bracketMatch) {
      const front = cleanCardFront(bracketMatch[1])
      const back = cleanCardBack(bracketMatch[2])
      if (front && back) {
        cards.push({
          type: 'active_recall',
          front,
          back
        })
        continue
      }
    }

    // Pattern 4: Q: ... A: ...
    const simpleLabelMatch = trimmed.match(/^Q\s*[:：]\s*(.+?)\s*A\s*[:：]\s*(.+)$/is)
    if (simpleLabelMatch) {
      const front = cleanCardFront(simpleLabelMatch[1])
      const back = cleanCardBack(simpleLabelMatch[2])
      if (front && back) {
        cards.push({
          type: 'active_recall',
          front,
          back
        })
        continue
      }
    }

    // Pattern 5: term ... definition (separated by · or • or — or – or →)
    const sepMatch = trimmed.match(/^(.+?)\s*(?:·|•|[·•]|—|–|-{2,3}|→)\s*(.+)$/s)
    if (sepMatch) {
      const front = cleanCardFront(sepMatch[1])
      const back = cleanCardBack(sepMatch[2])
      if (!/^(Flashcard|Active Recall|Question|Answer|Here are|Generated|Summary|Note|Tip)/i.test(front) && front.length < 200 && back.length > 5 && front.length > 0) {
        const isQuestion = /^(What|How|Why|Explain|Describe|Define|Compare|Contrast|List|What is|What are|What does|Can you|Describe how)/i.test(front) || front.endsWith('?')
        cards.push({
          type: isQuestion ? 'active_recall' : 'flashcard',
          front,
          back
        })
        continue
      }
    }
  }

  return cards
}

function splitSegments(text: string): string[] {
  // Try numbered splitting first: "1. ... 2. ... 3. ..." or "**1. ... **2. ..."
  const numberedMatch = text.match(/^(?:\*\*)?\d+[.)]\s/m)
  if (numberedMatch) {
    const segments = text.split(/\n\s*(?=(?:\*\*)?\d+[.)]\s)/)
    if (segments.length >= 2) return segments
  }

  // Try splitting by double newlines
  const doubleNewline = text.split(/\n\s*\n/).filter(s => s.trim().length > 0)
  if (doubleNewline.length >= 2) return doubleNewline

  // Try splitting by separator lines (--- or ***)
  const hrSplit = text.split(/\n[-*]{3,}\n/).filter(s => s.trim().length > 0)
  if (hrSplit.length >= 2) return hrSplit

  // Fallback
  return [text]
}

export function getCardTypeLabel(cards: ParsedCard[]): { flashcards: number; recall: number } {
  return {
    flashcards: cards.filter(c => c.type === 'flashcard').length,
    recall: cards.filter(c => c.type === 'active_recall').length
  }
}
