import type { EvaluationResult } from '../types'

export interface AutoGradeResult {
  correct: boolean
  score: number           // 0.0 to 1.0 (percentage scale)
  rawScore?: number       // 0 to 5 (SM-2 / LLM raw scale)
  quality: number         // 1 (Wrong), 3 (Partially Right), 5 (Got It) for regular study
  diagnosticQuality: number // 0 to 4 (FSRS-5 diagnostic rating scale)
  feedback: string
  matchedConcepts: string[]
  missingConcepts: string[]
  tierUsed: 'exact' | 'ai' | 'local'
}

/**
 * Common English stopwords to ignore when measuring semantic overlap
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'that', 'this', 'these', 'those', 'it', 'its'
])

const NEGATION_WORDS = ['not', "n't", 'no', 'never', 'neither', 'nor', 'cannot', 'cant', 'without', 'false']

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Strip simple LaTeX tags and delimiters
    .replace(/\\(?:text|textbf|textit|mathbf|mathrm)\{([^}]+)\}/g, '$1')
    .replace(/[$]/g, '')
    // Replace punctuation with spaces
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = []
  for (let i = 0; i <= m; i++) {
    dp[i] = []
    for (let j = 0; j <= n; j++) {
      if (i === 0) dp[i][j] = j
      else if (j === 0) dp[i][j] = i
      else if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeText(a)
  const normB = normalizeText(b)
  const max = Math.max(normA.length, normB.length)
  if (max === 0) return 1
  return (max - levenshteinDistance(normA, normB)) / max
}

export function stem(word: string): string {
  if (word.length <= 3) return word
  return word
    .replace(/(?:ing|tions|tion|ed|es|s|ly|al|ment|ity|able|ible)$/, '')
    .replace(/(?:ate|ates|ated|ating)$/, '')
}

export function extractKeyConcepts(text: string): string[] {
  // Capture quoted terms, capitalized words, acronyms, or substantive words
  const clean = text.replace(/[$]/g, '')
  const quoted = clean.match(/"([^"]+)"|'([^']+)'/g)?.map(q => q.replace(/['"]/g, '').trim()) || []
  const capitalized = (clean.match(/\b[A-Z][a-zA-Z0-9_-]+\b/g) || [])
    .filter(w => !STOP_WORDS.has(w.toLowerCase()))
  const significantWords = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))

  const all = [...quoted, ...capitalized, ...significantWords]
  const unique = Array.from(new Set(all.map(w => w.toLowerCase())))
  return unique.slice(0, 8)
}

export function detectNegationMismatch(student: string, model: string): boolean {
  const studentLower = student.toLowerCase()
  const modelLower = model.toLowerCase()
  const studentHasNeg = NEGATION_WORDS.some(w => studentLower.includes(w))
  const modelHasNeg = NEGATION_WORDS.some(w => modelLower.includes(w))
  return studentHasNeg !== modelHasNeg
}

export function scoreToQuality(score: number): { quality: number; diagnosticQuality: number } {
  // Diagnostic scale (0 - 4):
  // 0: Don't know it, 1: Know a little, 2: I'm okay at this, 3: Know it well, 4: Mastered
  let diagnosticQuality = 0
  if (score >= 0.85) diagnosticQuality = 4
  else if (score >= 0.65) diagnosticQuality = 3
  else if (score >= 0.45) diagnosticQuality = 2
  else if (score >= 0.20) diagnosticQuality = 1

  // Regular study scale (1: Wrong, 3: Partially Right, 5: Got It):
  let quality = 1
  if (score >= 0.65) quality = 5
  else if (score >= 0.35) quality = 3

  return { quality, diagnosticQuality }
}

/**
 * Local deterministic & heuristic semantic evaluation (Tier 1 & Tier 2)
 */
export function evaluateSemantically(
  studentAnswer: string,
  modelAnswer: string,
  keyConcepts?: string[]
): AutoGradeResult {
  const normStudent = normalizeText(studentAnswer)
  const normModel = normalizeText(modelAnswer)

  if (!normStudent) {
    return {
      correct: false,
      score: 0,
      quality: 1,
      diagnosticQuality: 0,
      feedback: 'No answer provided.',
      matchedConcepts: [],
      missingConcepts: keyConcepts || extractKeyConcepts(modelAnswer),
      tierUsed: 'local'
    }
  }

  // Exact or near-exact check
  const sim = stringSimilarity(normStudent, normModel)
  if (normStudent === normModel || sim >= 0.92) {
    const concepts = keyConcepts || extractKeyConcepts(modelAnswer)
    const { quality, diagnosticQuality } = scoreToQuality(1.0)
    return {
      correct: true,
      score: 1.0,
      rawScore: 5,
      quality,
      diagnosticQuality,
      feedback: 'Spot-on! Exact match with the model answer.',
      matchedConcepts: concepts,
      missingConcepts: [],
      tierUsed: 'exact'
    }
  }

  const concepts = keyConcepts && keyConcepts.length > 0 ? keyConcepts : extractKeyConcepts(modelAnswer)
  const matchedConcepts: string[] = []
  const missingConcepts: string[] = []

  const studentTokens = normStudent.split(/\s+/).map(stem)
  const studentTokenSet = new Set(studentTokens)

  for (const c of concepts) {
    const normC = normalizeText(c)
    const stemC = stem(normC)
    const isMatched =
      normStudent.includes(normC) ||
      studentTokenSet.has(stemC) ||
      studentTokens.some(st => st.length >= 4 && (stemC.includes(st) || st.includes(stemC)))

    if (isMatched) {
      matchedConcepts.push(c)
    } else {
      missingConcepts.push(c)
    }
  }

  const wordOverlap = computeWordOverlap(normStudent, normModel)
  const conceptScore = concepts.length > 0 ? matchedConcepts.length / concepts.length : wordOverlap
  let combined = wordOverlap * 0.4 + conceptScore * 0.6

  // Check for negation mismatch penalty
  if (detectNegationMismatch(studentAnswer, modelAnswer)) {
    combined = Math.max(0, combined - 0.3)
  }

  const roundedScore = Math.round(combined * 100) / 100
  const { quality, diagnosticQuality } = scoreToQuality(roundedScore)

  let feedback = ''
  if (roundedScore >= 0.85) {
    feedback = 'Excellent answer! You captured all essential points.'
  } else if (roundedScore >= 0.65) {
    feedback = 'Strong answer. You understood the core concept well.'
  } else if (roundedScore >= 0.40) {
    const missingStr = missingConcepts.slice(0, 3).join(', ')
    feedback = missingStr
      ? `Good start. Missing key detail: ${missingStr}.`
      : 'Partially correct. Expand on the underlying mechanism.'
  } else {
    const keyStr = concepts.slice(0, 3).join(', ')
    feedback = keyStr
      ? `Needs more detail. Core concepts to include: ${keyStr}.`
      : 'Answer needs revision to match the model response.'
  }

  return {
    correct: roundedScore >= 0.60,
    score: roundedScore,
    rawScore: Math.round(roundedScore * 5),
    quality,
    diagnosticQuality,
    feedback,
    matchedConcepts,
    missingConcepts,
    tierUsed: 'local'
  }
}

export function computeWordOverlap(text1: string, text2: string): number {
  const words1 = text1.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w)).map(stem)
  const words2 = text2.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w)).map(stem)
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  if (set1.size === 0 || set2.size === 0) return 0
  let intersection = 0
  for (const w of set1) {
    if (set2.has(w)) intersection++
  }
  return (2 * intersection) / (set1.size + set2.size)
}

/**
 * Multi-tier auto-grader entry point:
 * Tier 1: Instant exact / fuzzy match.
 * Tier 2/3: LLM rubric call if window.electronAPI.evaluateAnswer is available.
 * Fallback: High-grade local semantic evaluation if AI fails, is unconfigured, or is offline.
 */
export async function evaluateStudentAnswer(
  question: string,
  modelAnswer: string,
  studentAnswer: string
): Promise<AutoGradeResult> {
  const trimmed = studentAnswer.trim()
  if (!trimmed) {
    return {
      correct: false,
      score: 0,
      quality: 1,
      diagnosticQuality: 0,
      feedback: 'No answer provided.',
      matchedConcepts: [],
      missingConcepts: extractKeyConcepts(modelAnswer),
      tierUsed: 'local'
    }
  }

  // Tier 1: Exact or high similarity check (< 1ms)
  const normStudent = normalizeText(trimmed)
  const normModel = normalizeText(modelAnswer)
  if (normStudent === normModel || stringSimilarity(normStudent, normModel) >= 0.94) {
    const concepts = extractKeyConcepts(modelAnswer)
    const { quality, diagnosticQuality } = scoreToQuality(1.0)
    return {
      correct: true,
      score: 1.0,
      rawScore: 5,
      quality,
      diagnosticQuality,
      feedback: 'Spot-on! Exact match with the model answer.',
      matchedConcepts: concepts,
      missingConcepts: [],
      tierUsed: 'exact'
    }
  }

  // Tier 3: Call AI if available in Electron environment
  if (typeof window !== 'undefined' && window.electronAPI?.evaluateAnswer) {
    try {
      const aiResult: EvaluationResult = await window.electronAPI.evaluateAnswer(
        question,
        modelAnswer,
        studentAnswer
      )

      if (aiResult && typeof aiResult.score === 'number') {
        const rawScore = Math.max(0, Math.min(5, aiResult.score))
        const normalizedScore = Math.round((rawScore / 5) * 100) / 100
        const { quality, diagnosticQuality } = scoreToQuality(normalizedScore)

        const allConcepts = extractKeyConcepts(modelAnswer)
        const matched = aiResult.matched_concepts || allConcepts.filter(c => normStudent.includes(normalizeText(c)))
        const missing = aiResult.missing_concepts || allConcepts.filter(c => !normStudent.includes(normalizeText(c)))

        return {
          correct: aiResult.correct ?? normalizedScore >= 0.6,
          score: normalizedScore,
          rawScore,
          quality,
          diagnosticQuality,
          feedback: aiResult.feedback || 'Evaluated by AI.',
          matchedConcepts: matched,
          missingConcepts: missing,
          tierUsed: 'ai'
        }
      }
    } catch {
      // Fallback silently to local semantic evaluation on any API or network issue
    }
  }

  // Tier 2: Local heuristic fallback
  return evaluateSemantically(studentAnswer, modelAnswer)
}
