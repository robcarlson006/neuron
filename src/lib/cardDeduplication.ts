/**
 * Utilities for flashcard and active recall question deduplication.
 * Detects duplicates using markdown stripping, text normalization, token overlap,
 * character n-gram Dice coefficient, and intra-batch comparisons.
 */

export interface DuplicateCheckResult {
  isDuplicate: boolean
  reason?: string
  matchedFront?: string
  similarity?: number
}

/**
 * Remove markdown formatting, latex tags, brackets, and bullet points
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''
  return text
    // Remove math/latex delimiters first to avoid subscript interference
    .replace(/\$\$(.*?)\$\$/g, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    // Remove bold/italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Remove code formatting
    .replace(/`([^`]+)`/g, '$1')
    // Remove bracket labels like [Q], [A], [Front], [Back]
    .replace(/^\[(Q|A|Front|Back|Question|Answer|Term|Definition)\]\s*/i, '')
    // Remove prefixes like "Q:", "A:", "Front:", "Back:", "Term:", "Definition:"
    .replace(/^(?:Front|Question|Term|Q|Back|Answer|Definition|A)\s*[:：]\s*/i, '')
    // Remove list numbering and bullet points (e.g. "1.", "1)", "-", "*", "•", "·")
    .replace(/^\s*(?:\d+[.)]|\*|-|•|·)\s*/, '')
    .trim()
}

/**
 * Common question and concept boilerplate prefixes to strip for semantic comparison
 */
const QUESTION_PREFIXES = [
  /^(?:what\s+(?:is|are|was|were|does|do)|explain(?:\s+the\s+concept\s+of)?|describe(?:\s+the)?|define|summarize|what\s+is\s+meant\s+by|how\s+(?:does|do|is|are)|why\s+(?:is|does|do|are)|tell\s+me\s+about|give\s+the\s+definition\s+of|definition\s+of|the\s+concept\s+of|can\s+you\s+explain)[:：]?\s+/i,
  /^(?:the|a|an)\s+/i
]

/**
 * Normalize card text for duplicate detection:
 * - Strips markdown and labels
 * - Lowercases
 * - Strips question boilerplate prefixes
 * - Removes punctuation and collapses whitespace
 */
export function normalizeCardText(text: string, stripQuestionBoilerplate = true): string {
  if (!text) return ''
  let cleaned = stripMarkdown(text).toLowerCase()

  if (stripQuestionBoilerplate) {
    for (const prefix of QUESTION_PREFIXES) {
      cleaned = cleaned.replace(prefix, '')
    }
  }

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[?.!:,;—–-]+$/, '')

  // Replace remaining punctuation with space, keep alphanumeric
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ')

  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim()
}

/**
 * Extract non-trivial word tokens from text
 */
export function extractTokens(text: string): string[] {
  const normalized = normalizeCardText(text, true)
  if (!normalized) return []
  return normalized
    .split(' ')
    .filter(token => token.length > 1)
}

/**
 * Calculate Jaccard similarity between two token sets
 */
export function calculateJaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1.0
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Calculate Overlap (Szymkiewicz–Simpson) coefficient between two token sets
 */
export function calculateOverlapCoefficient(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1.0
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }

  const minSize = Math.min(setA.size, setB.size)
  return minSize > 0 ? intersection / minSize : 0
}

/**
 * Calculate character bigram Dice coefficient for typo-tolerant fuzzy matching
 */
export function calculateDiceCoefficient(strA: string, strB: string): number {
  const normA = strA.toLowerCase().replace(/\s+/g, '')
  const normB = strB.toLowerCase().replace(/\s+/g, '')

  if (normA === normB) return 1.0
  if (normA.length < 2 || normB.length < 2) return normA === normB ? 1.0 : 0.0

  const bigramsA = new Map<string, number>()
  for (let i = 0; i < normA.length - 1; i++) {
    const bigram = normA.substring(i, i + 2)
    bigramsA.set(bigram, (bigramsA.get(bigram) || 0) + 1)
  }

  let intersection = 0
  for (let i = 0; i < normB.length - 1; i++) {
    const bigram = normB.substring(i, i + 2)
    const count = bigramsA.get(bigram) || 0
    if (count > 0) {
      bigramsA.set(bigram, count - 1)
      intersection++
    }
  }

  return (2.0 * intersection) / (normA.length - 1 + (normB.length - 1))
}

export interface DuplicateOptions {
  similarityThreshold?: number
}

/**
 * Check if a single candidate card is a duplicate of an existing card
 */
export function isDuplicateCard(
  candidate: { front: string; back: string },
  existing: { front: string; back: string },
  options: DuplicateOptions = {}
): { isDuplicate: boolean; reason?: string; similarity: number } {
  const threshold = options.similarityThreshold ?? 0.80

  const rawCandidateFront = candidate.front?.trim() || ''
  const rawExistingFront = existing.front?.trim() || ''
  const rawCandidateBack = candidate.back?.trim() || ''
  const rawExistingBack = existing.back?.trim() || ''

  // 1. Exact string match (case-insensitive)
  if (rawCandidateFront.toLowerCase() === rawExistingFront.toLowerCase()) {
    return { isDuplicate: true, reason: 'Identical card front', similarity: 1.0 }
  }

  if (rawCandidateBack && rawExistingBack && rawCandidateBack.toLowerCase() === rawExistingBack.toLowerCase()) {
    return { isDuplicate: true, reason: 'Identical card back', similarity: 1.0 }
  }

  // 2. Normalized text match (stripping markdown, labels, and question boilerplate)
  const normCandidateFront = normalizeCardText(rawCandidateFront, true)
  const normExistingFront = normalizeCardText(rawExistingFront, true)

  if (normCandidateFront && normExistingFront && normCandidateFront === normExistingFront) {
    return { isDuplicate: true, reason: 'Equivalent concept / question', similarity: 1.0 }
  }

  // 3. Substring containment for concise terms
  if (normCandidateFront && normExistingFront) {
    const minLen = Math.min(normCandidateFront.length, normExistingFront.length)
    const maxLen = Math.max(normCandidateFront.length, normExistingFront.length)

    if (minLen >= 4 && maxLen > 0 && minLen / maxLen >= 0.60) {
      if (normCandidateFront.includes(normExistingFront) || normExistingFront.includes(normCandidateFront)) {
        return { isDuplicate: true, reason: 'Near-identical term or concept', similarity: 0.95 }
      }
    }
  }

  // 4. Token-level similarity
  const tokensCandidateFront = extractTokens(rawCandidateFront)
  const tokensExistingFront = extractTokens(rawExistingFront)

  const jaccardFront = calculateJaccardSimilarity(tokensCandidateFront, tokensExistingFront)
  const overlapFront = calculateOverlapCoefficient(tokensCandidateFront, tokensExistingFront)
  const diceFront = calculateDiceCoefficient(normCandidateFront, normExistingFront)

  // High token or Dice similarity on front
  if (diceFront >= threshold || jaccardFront >= 0.75) {
    const sim = Math.max(diceFront, jaccardFront)
    return { isDuplicate: true, reason: 'High similarity to existing question', similarity: sim }
  }

  // Overlap coefficient handles when one card is a concise version of another
  if (tokensCandidateFront.length >= 2 && tokensExistingFront.length >= 2 && overlapFront >= 0.85 && diceFront >= 0.70) {
    return { isDuplicate: true, reason: 'Overlap with existing question keywords', similarity: overlapFront }
  }

  // 5. Back (Answer) similarity combined with moderate front similarity
  const normCandidateBack = normalizeCardText(rawCandidateBack, false)
  const normExistingBack = normalizeCardText(rawExistingBack, false)

  if (normCandidateBack && normExistingBack) {
    const diceBack = calculateDiceCoefficient(normCandidateBack, normExistingBack)
    const tokensCandidateBack = extractTokens(rawCandidateBack)
    const tokensExistingBack = extractTokens(rawExistingBack)
    const jaccardBack = calculateJaccardSimilarity(tokensCandidateBack, tokensExistingBack)

    if ((diceBack >= 0.85 || jaccardBack >= 0.80) && (jaccardFront >= 0.40 || diceFront >= 0.50 || overlapFront >= 0.50)) {
      return { isDuplicate: true, reason: 'Substantially identical answer and concept', similarity: Math.max(diceBack, jaccardBack) }
    }
  }

  return { isDuplicate: false, similarity: Math.max(diceFront, jaccardFront) }
}

/**
 * Find all duplicates in a batch of candidate cards against existing cards
 * and against other candidates within the same batch (intra-batch deduplication).
 */
export function findCardDuplicates(
  candidates: { front: string; back: string }[],
  existingCards: { front: string; back: string }[],
  options: DuplicateOptions = {}
): DuplicateCheckResult[] {
  const results: DuplicateCheckResult[] = []

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    let foundDuplicate: DuplicateCheckResult | null = null

    // 1. Check against existing cards in the deck
    for (const existing of existingCards) {
      const match = isDuplicateCard(candidate, existing, options)
      if (match.isDuplicate) {
        foundDuplicate = {
          isDuplicate: true,
          reason: `Already in deck: "${existing.front.substring(0, 50)}${existing.front.length > 50 ? '...' : ''}"`,
          matchedFront: existing.front,
          similarity: match.similarity
        }
        break
      }
    }

    // 2. If not found in existing cards, check against earlier cards in this batch
    if (!foundDuplicate) {
      for (let j = 0; j < i; j++) {
        const earlierCandidate = candidates[j]
        const match = isDuplicateCard(candidate, earlierCandidate, options)
        if (match.isDuplicate) {
          foundDuplicate = {
            isDuplicate: true,
            reason: `Duplicate of card #${j + 1} generated in this session`,
            matchedFront: earlierCandidate.front,
            similarity: match.similarity
          }
          break
        }
      }
    }

    results.push(foundDuplicate || { isDuplicate: false })
  }

  return results
}
