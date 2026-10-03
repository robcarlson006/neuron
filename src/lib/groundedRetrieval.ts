import type { RAGSearchResult } from '../types'

export interface RetrievalCandidate {
  text: string
  materialId: number
  subjectId?: number
  materialName: string
  chunkIndex: number
  score?: number
}

export interface GroundedEvidence extends RAGSearchResult {
  sourceLabel: string
  matchedTerms: string[]
  retrievalMode: 'semantic' | 'lexical'
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'being', 'could', 'does',
  'from', 'have', 'into', 'more', 'most', 'other', 'should', 'that', 'their',
  'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with',
  'would', 'your', 'explain', 'please', 'help', 'does'
])

export function tokenizeForRetrieval(value: string): string[] {
  const lower = value.toLowerCase()
  const formulaQuery = /[=^_]|\\(?:frac|sqrt|sum|int|times|cdot)\b/.test(lower)
  const tokens = lower.match(/\\[a-z]+|[a-z]+(?:\d+)?|\d+(?:\.\d+)?/g) || []
  return Array.from(new Set(tokens.filter(token => {
    const plain = token.replace(/^\\/, '')
    return (formulaQuery ? plain.length >= 1 : plain.length >= 3) && !STOP_WORDS.has(plain)
  })))
}

export function normalizeFormula(value: string): string {
  return value
    .toLowerCase()
    .replace(/\$\$?|\\\(|\\\)/g, '')
    .replace(/\\(?:cdot|times)\b/g, '*')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\s+/g, '')
    .replace(/[{}]/g, '')
    .replace(/[−–—]/g, '-')
}

export function extractFormulaFingerprints(value: string): string[] {
  const normalized = normalizeFormula(value)
  if (!/[=^_*/]|\\(?:sqrt|sum|int|alpha|beta|gamma|Delta)\b/.test(normalized)) return []
  return Array.from(new Set(normalized.match(/[a-z0-9().+\-*/_^]+=[a-z0-9().+\-*/_^]+/g) || [normalized]))
    .filter(formula => formula.length >= 3)
}

export function lexicalScore(query: string, text: string): { score: number; matchedTerms: string[] } {
  const queryTerms = tokenizeForRetrieval(query)
  const formulaMatches = extractFormulaFingerprints(query).filter(formula => extractFormulaFingerprints(text).includes(formula))
  if (queryTerms.length === 0 && formulaMatches.length === 0) return { score: 0, matchedTerms: [] }

  const haystack = text.toLowerCase()
  const matchedTerms = queryTerms.filter(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(haystack)
  })
  const phraseBonus = query.trim().length > 8 && haystack.includes(query.trim().toLowerCase()) ? 0.25 : 0
  const formulaBonus = formulaMatches.length > 0 ? 0.75 : 0
  const termScore = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0
  return {
    score: Math.min(1, termScore + phraseBonus + formulaBonus),
    matchedTerms: [...matchedTerms, ...formulaMatches.map(formula => `formula:${formula}`)]
  }
}

/**
 * Deterministic local retrieval fallback. This is deliberately small and
 * side-effect free so it can be used in tests and when no embedding provider
 * is configured.
 */
export function rankLexicalCandidates(
  query: string,
  candidates: RetrievalCandidate[],
  limit = 8
): GroundedEvidence[] {
  return candidates
    .map(candidate => {
      const lexical = lexicalScore(query, candidate.text)
      return {
        ...candidate,
        score: lexical.score,
        sourceLabel: `${candidate.materialName} · section ${candidate.chunkIndex + 1}`,
        matchedTerms: lexical.matchedTerms,
        retrievalMode: 'lexical' as const
      }
    })
    .filter(result => result.score >= 0.12)
    .sort((a, b) => b.score - a.score || a.materialId - b.materialId || a.chunkIndex - b.chunkIndex)
    .slice(0, Math.max(1, limit))
}

export function mergeGroundedResults(
  semantic: RAGSearchResult[],
  lexical: GroundedEvidence[],
  limit = 8
): GroundedEvidence[] {
  const merged = new Map<string, GroundedEvidence>()
  for (const item of semantic) {
    const key = `${item.materialId}:${item.chunkIndex}`
    merged.set(key, {
      ...item,
      sourceLabel: `${item.materialName} · section ${item.chunkIndex + 1}`,
      matchedTerms: [],
      retrievalMode: 'semantic'
    })
  }
  for (const item of lexical) {
    const key = `${item.materialId}:${item.chunkIndex}`
    const existing = merged.get(key)
    if (!existing || item.score > existing.score) merged.set(key, item)
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.materialId - b.materialId || a.chunkIndex - b.chunkIndex)
    .slice(0, Math.max(1, limit))
}

export function hasSufficientEvidence(results: GroundedEvidence[], minimumScore = 0.16): boolean {
  return results.length > 0 && results[0].score >= minimumScore
}

export function buildEvidenceContext(results: GroundedEvidence[], maxCharacters = 18000): string {
  let used = 0
  const blocks: string[] = []
  for (const result of results) {
    const block = `[SOURCE ${result.materialId}:${result.chunkIndex}] ${result.sourceLabel}\n${result.text.trim()}`
    if (used + block.length > maxCharacters) break
    blocks.push(block)
    used += block.length
  }
  return blocks.join('\n\n---\n\n')
}
