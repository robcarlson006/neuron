import { cleanCardBrackets, extractContextTag } from './cardParser'
import type { ConceptualLens, BloomLevel, CardTypology } from '../types'

/**
 * Validated card after quality checks
 */
export interface ValidatedCard {
  front: string
  back: string
  type: 'flashcard' | 'active_recall'
  quality_score?: number
  conceptual_lens?: ConceptualLens
  bloom_level?: BloomLevel
  card_type?: CardTypology
  pedagogical_rationale?: string
}

/**
 * Result of card validation
 */
export interface CardValidationResult {
  valid: boolean
  cards: ValidatedCard[] // may be split if compound or spoiler
  issues: string[]
  quality_score: number
  anti_patterns_detected: string[]
}

/**
 * Andy Matuschak's 5 Foundational Properties for Retrieval Prompts
 */
export interface MatuschakPromptEvaluation {
  focus: number        // Atomicity: exactly one cognitive step / proposition
  precision: number    // Unambiguous horizon & expected answer shape
  consistency: number  // Stable conceptual target across spaced intervals
  tractability: number // Answerable without guessing idiosyncratic phrasing
  effortfulness: number// Active reconstruction vs superficial recognition
  overallScore: number // Composite quality score 0.0 - 1.0
}

/**
 * Detect binary (Yes/No, True/False) prompts.
 * Binary questions carry 50% guessing probability and foster superficial recognition.
 */
export function isBinaryPrompt(text: string): boolean {
  const trimmed = text.trim()
  if (/\((?:yes\/no|true\/false|y\/n|t\/f)\)/i.test(trimmed)) return true
  if (/^(?:is|are|does|do|can|will|should|has|have|was|were)\b/i.test(trimmed) && !/\b(?:how|why|which|what|where|when|compare|contrast|explain)\b/i.test(trimmed)) {
    // If it's a simple "Does increasing substrate overcome non-competitive inhibition?" without mechanism query
    if (trimmed.endsWith('?') && !trimmed.toLowerCase().includes('and why') && !trimmed.toLowerCase().includes('explain')) {
      return true
    }
  }
  return false
}

/**
 * Detect enumeration / set prompts (e.g. "List the 5 primary stages of...").
 * Unordered lists trigger serial position interference and leeches.
 */
export function isEnumerationPrompt(text: string): boolean {
  return /\b(?:list\s+(?:the\s+)?(?:\d+|all|five|four|three|six|seven|eight|several|primary|main)\b|what\s+are\s+the\s+\d+\s+|name\s+the\s+\d+\s+)/i.test(text)
}

/**
 * Detect spoiler prompts (e.g., "Why does factor X cause condition Y?").
 * Giving away the association weakens the retrieval effect.
 */
export function isSpoilerPrompt(text: string): { isSpoiler: boolean; factor?: string; consequence?: string } {
  // Pattern: "Why does X cause/lead to/produce Y?" or "How does X cause Y?"
  const match = text.match(/^(?:Why|How)\s+does\s+(.+?)\s+(?:cause|lead to|produce|result in|induce|trigger)\s+(.+?)(?:\?|$)/i)
  if (match) {
    return {
      isSpoiler: true,
      factor: match[1].trim(),
      consequence: match[2].trim()
    }
  }
  return { isSpoiler: false }
}

/**
 * Detect dense card backs (the "Paragraph Trap").
 * Stacking long summaries or slide excerpts onto the back creates an illusion of competence.
 */
export function isDenseCardBack(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  // Backs over 40 words or with 3+ dense sentences violate answer conciseness
  if (words.length > 40) return true
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15)
  return sentences.length >= 4
}

/**
 * Evaluate Andy Matuschak's 5 Qualitative Criteria for a prompt
 */
export function evaluateMatuschakCriteria(front: string, back: string): MatuschakPromptEvaluation {
  let focus = 1.0
  let precision = 1.0
  let consistency = 1.0
  let tractability = 1.0
  let effortfulness = 1.0

  // 1. Focus (Atomicity)
  const compoundItems = detectCompoundAnswer(back)
  if (compoundItems.length >= 2) focus -= 0.3
  if ((front.match(/\?/g) || []).length > 1) focus -= 0.3
  if (isEnumerationPrompt(front)) focus -= 0.4

  // 2. Precision (Horizon & Domain Context)
  const { tag } = extractContextTag(front)
  if (tag) precision = Math.min(1.0, precision + 0.1)
  if (isAmbiguousPrompt(front)) precision -= 0.4

  // 3. Consistency
  if (isDenseCardBack(back)) consistency -= 0.3
  if (isSpoilerPrompt(front).isSpoiler) consistency -= 0.25

  // 4. Tractability
  if (!isSelfContained(front) || !isSelfContained(back)) tractability -= 0.3

  // 5. Effortfulness
  if (isBinaryPrompt(front)) effortfulness -= 0.5
  if (isSyntacticCloze(front, back)) effortfulness -= 0.3

  focus = Math.max(0.1, Math.min(1.0, focus))
  precision = Math.max(0.1, Math.min(1.0, precision))
  consistency = Math.max(0.1, Math.min(1.0, consistency))
  tractability = Math.max(0.1, Math.min(1.0, tractability))
  effortfulness = Math.max(0.1, Math.min(1.0, effortfulness))

  const overallScore = Number(((focus * 0.25) + (precision * 0.2) + (consistency * 0.2) + (tractability * 0.15) + (effortfulness * 0.2)).toFixed(2))

  return {
    focus,
    precision,
    consistency,
    tractability,
    effortfulness,
    overallScore
  }
}

/**
 * Detect ambiguous horizon questions with undefined answer shapes
 */
export function isAmbiguousPrompt(text: string): boolean {
  // e.g. "What is significant about X?", "Tell me about Y", "Discuss Z"
  return /^(?:what\s+is\s+significant\s+about|tell\s+me\s+about|discuss\s+|what\s+about)\b/i.test(text.trim())
}

/**
 * Detect superficial syntactic cloze / pattern matching
 */
export function isSyntacticCloze(front: string, back: string): boolean {
  if (front.includes('___') && front.length > 100 && back.split(/\s+/).length === 1) {
    // If it's a giant verbatim sentence with a single arbitrary blank
    return true
  }
  return false
}

/**
 * Validate a generated card against rigorous cognitive science and psychometric criteria.
 * Checks: non-empty, self-containment, Minimum Information Principle,
 * binary prohibition, spoiler avoidance, answer conciseness, and question formatting.
 * Automatically decomposes compound items and spoilers into high-yield atomic cards.
 */
export function validateCardQuality(card: {
  front: string
  back: string
  type?: string
  concept?: string | null
  conceptual_lens?: ConceptualLens
  bloom_level?: BloomLevel
  card_type?: CardTypology
  pedagogical_rationale?: string
}): CardValidationResult {
  const issues: string[] = []
  const antiPatterns: string[] = []
  const type = (card.type === 'active_recall' ? 'active_recall' : 'flashcard') as 'flashcard' | 'active_recall'

  const cleanedFront = cleanCardBrackets(card.front || '')
  const cleanedBack = cleanCardBrackets(card.back || '')

  // Check 1: Front and back must be non-empty
  if (!cleanedFront.trim()) {
    return { valid: false, cards: [], issues: ['Card front is empty'], quality_score: 0, anti_patterns_detected: ['Empty Front'] }
  }
  if (!cleanedBack.trim()) {
    return { valid: false, cards: [], issues: ['Card back is empty'], quality_score: 0, anti_patterns_detected: ['Empty Back'] }
  }

  // Check 2: Self-containment — no vague references
  if (!isSelfContained(cleanedFront)) {
    issues.push('Front contains vague reference (e.g., "as discussed above")')
    antiPatterns.push('Vague Reference in Front')
  }
  if (!isSelfContained(cleanedBack)) {
    issues.push('Back contains vague reference (e.g., "in this context")')
    antiPatterns.push('Vague Reference in Back')
  }

  // Check 3: Binary framing (Yes/No, True/False)
  if (isBinaryPrompt(cleanedFront)) {
    issues.push('Binary question detected (Yes/No or True/False violates desirable difficulty)')
    antiPatterns.push('Binary Framing')
  }

  // Check 4: Unordered set / Enumeration ("List the 5...")
  if (isEnumerationPrompt(cleanedFront)) {
    issues.push('Enumeration prompt detected (violates Minimum Information Principle)')
    antiPatterns.push('Enumeration / Set Prompt')
  }

  // Check 5: Dense Card Back / Paragraph Trap
  if (isDenseCardBack(cleanedBack)) {
    issues.push('Dense card back (>40 words / paragraph trap creates illusion of mastery)')
    antiPatterns.push('Dense Card Back')
  }

  // Check 6: Ambiguous Horizon
  if (isAmbiguousPrompt(cleanedFront)) {
    issues.push('Ambiguous horizon without explicit domain context or answer shape')
    antiPatterns.push('Ambiguous Horizon')
  }

  // Check 7: Minimum Information Principle & Auto-Decomposition
  const mipResult = checkMinimumInformationPrinciple(cleanedFront, cleanedBack)
  issues.push(...mipResult.issues)

  // Auto-decompose compound lists (3+ items)
  if (!mipResult.passes) {
    const items = detectCompoundAnswer(cleanedBack)
    if (items.length >= 2) {
      const basePrompt = cleanedFront.trim().replace(/[?:.!]+$/, '')
      const splitCards: ValidatedCard[] = items.map((item, idx) => {
        const colonIdx = item.indexOf(':')
        const dashMatch = item.match(/\s+[—–-]\s+/)
        const splitIdx = colonIdx > 0 ? colonIdx : (dashMatch?.index !== undefined ? dashMatch.index : -1)

        if (splitIdx > 0 && splitIdx < item.length - 1) {
          const term = item.slice(0, splitIdx).trim()
          const desc = item.slice(splitIdx + (colonIdx > 0 ? 1 : (dashMatch?.[0].length || 1))).trim()
          return {
            front: cleanCardBrackets(`${basePrompt} — which element corresponds to: "${desc}"?`),
            back: cleanCardBrackets(term),
            type,
            quality_score: 0.92,
            conceptual_lens: 'Parts_Wholes',
            bloom_level: 'Understanding',
            card_type: 'Basic_QA',
            pedagogical_rationale: `Atomic decomposition of component ${idx + 1} of ${items.length}`
          }
        }

        return {
          front: cleanCardBrackets(`${basePrompt} (Component ${idx + 1} of ${items.length})?`),
          back: cleanCardBrackets(item),
          type,
          quality_score: 0.88,
          conceptual_lens: 'Parts_Wholes',
          bloom_level: 'Understanding',
          card_type: 'Basic_QA',
          pedagogical_rationale: `Isolated atomic component from compound set`
        }
      })
      return {
        valid: true,
        cards: splitCards,
        issues,
        quality_score: 0.9,
        anti_patterns_detected: ['Compound List (Auto-Decomposed)']
      }
    }
  }

  // Auto-decompose Spoiler Prompts ("Why does X cause Y?" -> Association + Mechanism)
  const spoilerCheck = isSpoilerPrompt(cleanedFront)
  if (spoilerCheck.isSpoiler && spoilerCheck.factor && spoilerCheck.consequence) {
    antiPatterns.push('Spoiler Prompt (Auto-Decomposed)')
    const card1: ValidatedCard = {
      front: cleanCardBrackets(`What condition or effect is produced by ${spoilerCheck.factor}?`),
      back: cleanCardBrackets(spoilerCheck.consequence),
      type,
      quality_score: 0.95,
      conceptual_lens: 'Causes_Effects',
      bloom_level: 'Understanding',
      card_type: 'Basic_QA',
      pedagogical_rationale: `Tests association without revealing target relationship`
    }
    const card2: ValidatedCard = {
      front: cleanCardBrackets(`By what mechanism does ${spoilerCheck.factor} produce ${spoilerCheck.consequence}?`),
      back: cleanCardBrackets(cleanedBack),
      type: 'active_recall',
      quality_score: 0.95,
      conceptual_lens: 'Causes_Effects',
      bloom_level: 'Analyzing',
      card_type: 'Basic_QA',
      pedagogical_rationale: `Tests underlying physiological or theoretical mechanism`
    }
    return {
      valid: true,
      cards: [card1, card2],
      issues,
      quality_score: 0.95,
      anti_patterns_detected: antiPatterns
    }
  }

  // Calculate Matuschak 5-Criteria Quality Score
  const evalResult = evaluateMatuschakCriteria(cleanedFront, cleanedBack)
  const qualityScore = evalResult.overallScore

  // Basic question format check
  const hasQuestionFormat =
    cleanedFront.includes('?') ||
    cleanedFront.includes('___') ||
    /^(what|how|why|when|where|which|explain|describe|define|compare|contrast|list|name)/i.test(cleanedFront.trim()) ||
    /^\[.+?\]\s*(what|how|why|when|where|which|explain|describe|define|compare|contrast|list|name)/i.test(cleanedFront.trim())
  if (!hasQuestionFormat) {
    issues.push('Front may not be in question format (no "?" or "___" found)')
  }

  const valid = cleanedFront.trim().length > 0 && cleanedBack.trim().length > 0

  return {
    valid,
    cards: valid
      ? [
          {
            front: cleanedFront.trim(),
            back: cleanedBack.trim(),
            type,
            quality_score: qualityScore,
            conceptual_lens: card.conceptual_lens,
            bloom_level: card.bloom_level,
            card_type: card.card_type,
            pedagogical_rationale: card.pedagogical_rationale
          }
        ]
      : [],
    issues,
    quality_score: qualityScore,
    anti_patterns_detected: antiPatterns
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
    /\bas seen\b/i,
    /\bthe latter\b/i,
    /\bthis method\b/i
  ]
  for (const pattern of vaguePatterns) {
    if (pattern.test(text)) return false
  }
  return true
}

/**
 * Detect compound answers (lists of items).
 * Returns list items if the back contains a list of 2+ items, otherwise empty array.
 */
export function detectCompoundAnswer(text: string): string[] {
  // Check multiline lists (1., 1), *, -, •)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const listItemsFromLines: string[] = []
  for (const line of lines) {
    const match = line.match(/^(?:\d+[\.)]|\*|-|•)\s*(.+)$/)
    if (match && match[1].trim().length > 0) {
      listItemsFromLines.push(match[1].trim())
    }
  }
  if (listItemsFromLines.length >= 2) {
    return listItemsFromLines
  }

  // Also detect inline items separated by semicolons or numbers (e.g., "1) X; 2) Y; 3) Z" or "1. X; 2. Y; 3. Z")
  const numberedItems = text.match(/\d+[\.)]\s+[^;,\n]+/g)
  if (numberedItems && numberedItems.length >= 2) {
    return numberedItems.map(item => item.replace(/^\d+[\.)]\s+/, '').trim())
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
  if (items.length >= 2) {
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
