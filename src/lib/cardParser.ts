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

function cleanCardFront(rawFront: string): string {
  let cleaned = rawFront.trim()
  // Strip outer bold/italic if entire string is wrapped in **...** or *...*
  cleaned = cleaned.replace(/^\*{1,3}(.+?)\*{1,3}$/s, '$1').trim()
  // Strip leading numbering or bullet prefixes: "1. ", "1) ", "Card 1: ", "Q1: ", "- ", "• "
  cleaned = cleaned.replace(/^(?:(?:Card\s*\d+|Q\d+|\d+)[.:)]\s*|[-*•]\s*)/i, '').trim()
  // In case outer bold was after the number: "1. **Term**" -> "**Term**" -> "Term"
  cleaned = cleaned.replace(/^\*{1,3}(.+?)\*{1,3}$/s, '$1').trim()
  return cleaned
}

function cleanCardBack(rawBack: string): string {
  let cleaned = rawBack.trim()
  // Strip leading bullet or dash if present
  cleaned = cleaned.replace(/^[-*•]\s*/, '').trim()
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
