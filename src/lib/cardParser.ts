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

export function parseCardsFromText(text: string): ParsedCard[] {
  const cards: ParsedCard[] = []

  // Split into logical segments
  const segments = splitSegments(text)

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed.length < 10) continue

    // Pattern 1: **Front** → Back (markdown bold arrow)
    const boldArrowMatch = trimmed.match(/^\*\*(.+?)\*\*\s*(?:→|->|=>|—|–|-)\s*(.+)$/s)
    if (boldArrowMatch) {
      cards.push({
        type: 'flashcard',
        front: boldArrowMatch[1].trim(),
        back: boldArrowMatch[2].trim()
      })
      continue
    }

    // Pattern 2: Front: ... Back: ... or Question: ... Answer: ...
    const labeledMatch = trimmed.match(/^(?:Front|Question|Term|Q)\s*[:：]\s*(.+?)\s*(?:Back|Answer|Definition|A)\s*[:：]\s*(.+)$/is)
    if (labeledMatch) {
      const front = labeledMatch[1].trim()
      const back = labeledMatch[2].trim()
      const isRecall = /^(?:Question|Q)\s*[:：]/i.test(trimmed)
      cards.push({
        type: isRecall ? 'active_recall' : 'flashcard',
        front,
        back
      })
      continue
    }

    // Pattern 3: [Q] ... [A] ... or [Front] ... [Back] ...
    const bracketMatch = trimmed.match(/^\[(?:Q|Question)\]\s*(.+?)\s*\[(?:A|Answer)\]\s*(.+)$/is)
    if (bracketMatch) {
      cards.push({
        type: 'active_recall',
        front: bracketMatch[1].trim(),
        back: bracketMatch[2].trim()
      })
      continue
    }

    // Pattern 4: Q: ... A: ...
    const simpleLabelMatch = trimmed.match(/^Q\s*[:：]\s*(.+?)\s*A\s*[:：]\s*(.+)$/is)
    if (simpleLabelMatch) {
      cards.push({
        type: 'active_recall',
        front: simpleLabelMatch[1].trim(),
        back: simpleLabelMatch[2].trim()
      })
      continue
    }

    // Pattern 5: term ... definition (separated by · or • or — or – or →)
    const sepMatch = trimmed.match(/^(.+?)\s*(?:·|•|[·•]|—|–|-{2,3}|→)\s*(.+)$/s)
    if (sepMatch) {
      const front = sepMatch[1].trim()
      const back = sepMatch[2].trim()
      if (!/^(Flashcard|Active Recall|Question|Answer|Here are|Generated|Summary|Note|Tip)/i.test(front) && front.length < 200 && back.length > 5) {
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
  // Try numbered splitting first: "1. ... 2. ... 3. ..."
  const numberedMatch = text.match(/^\d+[.)]\s/m)
  if (numberedMatch) {
    const segments = text.split(/\n\s*(?=\d+[.)]\s)/)
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
