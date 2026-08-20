/**
 * Validated card after quality checks
 */
export interface ValidatedCard {
  front: string
  back: string
  type: 'flashcard' | 'active_recall'
}

/**
 * Result of card validation
 */
export interface CardValidationResult {
  valid: boolean
  cards: ValidatedCard[] // may be split if compound
  issues: string[]
}

/**
 * Validate a generated card against quality criteria.
 * Checks: non-empty, self-containment, Minimum Information Principle,
 * question format, and sufficient detail.
 * Compound cards (lists of 3+) are split into individual cards.
 */
export function validateCardQuality(card: {
  front: string
  back: string
  type?: string
}): CardValidationResult {
  const issues: string[] = []
  const type = (card.type === 'active_recall' ? 'active_recall' : 'flashcard') as 'flashcard' | 'active_recall'

  // Check 1: Front and back must be non-empty
  if (!card.front?.trim()) {
    return { valid: false, cards: [], issues: ['Card front is empty'] }
  }
  if (!card.back?.trim()) {
    return { valid: false, cards: [], issues: ['Card back is empty'] }
  }

  // Check 2: Self-containment — no vague references
  if (!isSelfContained(card.front)) {
    issues.push('Front contains vague reference (e.g., "as discussed above")')
  }
  if (!isSelfContained(card.back)) {
    issues.push('Back contains vague reference (e.g., "in this context")')
  }

  // Check 3: Minimum Information Principle — detect compound answers
  const mipResult = checkMinimumInformationPrinciple(card.front, card.back)
  issues.push(...mipResult.issues)

  // If compound answer detected with 3+ items, split into multiple cards
  if (!mipResult.passes) {
    const items = detectCompoundAnswer(card.back)
    if (items.length >= 3) {
      const splitCards: ValidatedCard[] = items.map((item) => ({
        front: `${card.front.trim().replace(/[?:.!]+$/, '')} — ${item}`,
        back: item,
        type
      }))
      return { valid: true, cards: splitCards, issues }
    }
  }

  // Check 4: Front should be a question/cloze/prompt
  const hasQuestionFormat =
    card.front.includes('?') ||
    card.front.includes('___') ||
    /^(what|how|why|when|where|which|explain|describe|define|compare|contrast|list|name)/i.test(card.front.trim())
  if (!hasQuestionFormat) {
    issues.push('Front may not be in question format (no "?" or "___" found)')
  }

  // Check 5: Back should have sufficient detail
  if (card.back.trim().length < 15) {
    issues.push('Back is too short (less than 15 characters)')
  }

  // A card is valid if it has content and doesn't fail the hard checks
  const valid = card.front.trim().length > 0 && card.back.trim().length > 0

  return {
    valid,
    cards: valid ? [{ front: card.front.trim(), back: card.back.trim(), type }] : [],
    issues
  }
}

/**
 * Check if text is self-contained (no vague references like "as discussed above")
 */
export function isSelfContained(text: string): boolean {
  const vaguePatterns = [
    /\bas discussed\b/i,
    /\bin this context\b/i,
    /\bas we learned\b/i,
    /\babove\b/i,
    /\bas mentioned\b/i,
    /\bpreviously\b/i,
    /\bas seen\b/i
  ]
  for (const pattern of vaguePatterns) {
    if (pattern.test(text)) return false
  }
  return true
}

/**
 * Detect compound answers (lists of items).
 * Returns list items if the back contains a list of 3+ items, otherwise empty array.
 */
export function detectCompoundAnswer(text: string): string[] {
  // Match numbered lists, bullet points, or dash-separated items
  const listItems = text.match(/(?:\d+\.\s|\*\s|-\s)[^-.\n]{5,}/g)
  if (listItems && listItems.length >= 3) {
    return listItems.map(item => item.replace(/^(?:\d+\.\s|\*\s|-\s)/, '').trim())
  }

  // Also detect items separated by semicolons with numbers (e.g., "1) X; 2) Y; 3) Z")
  const numberedItems = text.match(/\d+\)\s[^;]+/g)
  if (numberedItems && numberedItems.length >= 3) {
    return numberedItems.map(item => item.replace(/^\d+\)\s/, '').trim())
  }

  return []
}

/**
 * Check if a card violates the Minimum Information Principle.
 * MIP states each card should test exactly one piece of information.
 * Violations include: lists of items in the back, multiple questions in the front.
 */
export function checkMinimumInformationPrinciple(
  front: string,
  back: string
): { passes: boolean; issues: string[] } {
  const issues: string[] = []

  // Check for lists in back (compound answers)
  const items = detectCompoundAnswer(back)
  if (items.length >= 3) {
    issues.push(`Back contains a list of ${items.length} items (violates Minimum Information Principle)`)
    return { passes: false, issues }
  }

  // Check for multiple questions in front
  const questionMarks = (front.match(/\?/g) || []).length
  if (questionMarks > 1) {
    issues.push('Front contains multiple questions (consider splitting into separate cards)')
  }

  return { passes: issues.length === 0, issues }
}
