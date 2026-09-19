import type {
  ExtractedPracticeProblem,
  PracticeProblem,
  DistractorStrategy
} from '../types'

export interface PracticeProblemQualityScorecard {
  valid: boolean
  quality_score: number // 0.0 to 1.0
  cover_test_passed: boolean
  iwfs_detected: string[] // Item-Writing Flaws
  issues: string[]
  strengths: string[]
  recommended_actions: string[]
  distractor_diagnostics?: {
    option_key: string
    text: string
    strategy: DistractorStrategy
    misconception_exposed?: string
  }[]
}

/**
 * Haladyna & Downing Item-Writing Flaw (IWF) definitions
 */
export const PROHIBITED_OPEN_STEM_PATTERNS = [
  /which of the following is (?:true|false|correct|incorrect|accurate|inaccurate)/i,
  /which of the following statements is (?:true|false|correct|incorrect)/i,
  /which of the following are (?:true|false|correct|incorrect)/i,
  /all of the following are (?:true|correct) except/i,
  /select the (?:correct|true|false) statement/i
]

export const EXTREME_DETERMINERS = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bentirely\b/i,
  /\bcompletely\b/i,
  /\bin all cases\b/i,
  /\bunder no circumstances\b/i,
  /\bwithout exception\b/i
]

export const COMPOUND_CHOICE_PATTERNS = [
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\ball of these\b/i,
  /\bnone of these\b/i,
  /\bboth [a-d] and [a-d]\b/i,
  /\bneither [a-d] nor [a-d]\b/i,
  /\b[a-d] and [a-d]\b/i,
  /\b[a-d], [a-d], and [a-d]\b/i
]

/**
 * 1. The Cover Test (NBME / Haladyna Gold Standard):
 * If a knowledgeable learner covers the answer choices and reads only the stimulus and the prompt,
 * they must be capable of generating a clear, unprompted answer before looking at options.
 */
export function passesCoverTest(stemOrPrompt: string): { passed: boolean; reason?: string } {
  const trimmed = stemOrPrompt.trim()
  if (!trimmed) {
    return { passed: false, reason: 'Stem is empty' }
  }

  for (const pattern of PROHIBITED_OPEN_STEM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        passed: false,
        reason: 'Stem fails the Cover Test: open-concept fragment forces true/false evaluation across options instead of a focused problem space.'
      }
    }
  }

  // A focused stem should end in an interrogative sentence or explicit command
  const hasQuestionMark = trimmed.endsWith('?')
  const hasCommand = /^(?:calculate|determine|derive|find|compute|explain|identify|formulate|predict|evaluate|diagnose|prove|construct)\b/i.test(trimmed)

  if (!hasQuestionMark && !hasCommand) {
    return {
      passed: false,
      reason: 'Stem does not end in a question mark or clear operational imperative command.'
    }
  }

  return { passed: true }
}

/**
 * 2. Clang Association Detection:
 * Flags when unusual/technical stem words appear exclusively in the correct answer,
 * signaling the key to test-wise students.
 */
export function detectClangAssociations(
  stem: string,
  correctOptionText: string,
  distractorTexts: string[]
): { hasClang: boolean; matchedTerms: string[] } {
  if (!stem || !correctOptionText) return { hasClang: false, matchedTerms: [] }

  const commonStopwords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'what', 'which', 'when',
    'where', 'how', 'why', 'are', 'was', 'were', 'will', 'have', 'has', 'had',
    'does', 'did', 'than', 'more', 'less', 'most', 'into', 'over', 'under', 'between'
  ])

  // Extract significant words (>= 4 chars) from stem
  const stemWords = stem
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !commonStopwords.has(w))

  const keyWords = new Set(
    correctOptionText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !commonStopwords.has(w))
  )

  const distractorWords = new Set(
    distractorTexts
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !commonStopwords.has(w))
  )

  const clangs: string[] = []
  for (const word of stemWords) {
    // Word appears in correct key but NOT in any distractor
    if (keyWords.has(word) && !distractorWords.has(word)) {
      clangs.push(word)
    }
  }

  return {
    hasClang: clangs.length >= 2,
    matchedTerms: clangs
  }
}

/**
 * 3. Option Length Homogeneity & Visual Bias:
 * Checks if the correct key is noticeably longer, more qualified, or descriptive than distractors.
 */
export function evaluateOptionHomogeneity(
  options: Record<string, string> | string[],
  correctKeyIndexOrLetter?: string | number
): { isHomogeneous: boolean; lengthRatio: number; issue?: string } {
  const optionList: { key: string; text: string }[] = []

  if (Array.isArray(options)) {
    options.forEach((opt, idx) => {
      optionList.push({ key: String.fromCharCode(65 + idx), text: opt.trim() })
    })
  } else {
    for (const [k, v] of Object.entries(options)) {
      if (typeof v === 'string') {
        optionList.push({ key: k, text: v.trim() })
      }
    }
  }

  if (optionList.length < 2) {
    return { isHomogeneous: true, lengthRatio: 1 }
  }

  const lengths = optionList.map(o => o.text.length)

  // Check correct key length if known
  if (correctKeyIndexOrLetter !== undefined) {
    const keyStr = String(correctKeyIndexOrLetter).toUpperCase()
    const targetOpt = optionList.find(
      o => o.key.toUpperCase() === keyStr || o.key === String.fromCharCode(65 + Number(correctKeyIndexOrLetter))
    )
    if (targetOpt) {
      const distractors = optionList.filter(o => o !== targetOpt)
      const avgDistractorLength = distractors.reduce((a, b) => a + b.text.length, 0) / Math.max(1, distractors.length)
      const ratio = targetOpt.text.length / Math.max(1, avgDistractorLength)

      if (ratio > 1.8 && targetOpt.text.length > 30) {
        return {
          isHomogeneous: false,
          lengthRatio: Number(ratio.toFixed(2)),
          issue: `Length Bias: Correct key (${targetOpt.key}) is ${ratio.toFixed(1)}x longer than distractors, flagging it visually.`
        }
      }
    }
  }

  // General variance check
  const maxLen = Math.max(...lengths)
  const minLen = Math.min(...lengths)
  const ratio = maxLen / Math.max(1, minLen)

  if (ratio > 3.0 && maxLen > 40) {
    return {
      isHomogeneous: false,
      lengthRatio: Number(ratio.toFixed(2)),
      issue: `Option length variance is high (${minLen} chars vs ${maxLen} chars). Options should be syntactically homogeneous.`
    }
  }

  return { isHomogeneous: true, lengthRatio: Number(ratio.toFixed(2)) }
}

/**
 * 4. Extreme Determiners Check:
 * Flags absolute words ("always", "never", "completely") that test-wise students eliminate.
 */
export function detectExtremeDeterminers(text: string): { hasExtreme: boolean; match?: string } {
  for (const pattern of EXTREME_DETERMINERS) {
    const match = text.match(pattern)
    if (match) {
      return { hasExtreme: true, match: match[0] }
    }
  }
  return { hasExtreme: false }
}

/**
 * 5. Compound Choices Check:
 * Prohibits "All of the above", "None of the above", and Type K clusters.
 */
export function detectCompoundChoices(options: Record<string, string> | string[]): { hasCompound: boolean; match?: string } {
  const values = Array.isArray(options) ? options : Object.values(options)
  for (const val of values) {
    if (typeof val !== 'string') continue
    for (const pattern of COMPOUND_CHOICE_PATTERNS) {
      const m = val.match(pattern)
      if (m) {
        return { hasCompound: true, match: m[0] }
      }
    }
  }
  return { hasCompound: false }
}

/**
 * 6. Negative Stem Check:
 * Flags negative phrasing ("NOT", "EXCEPT", "FALSE") that creates unnecessary cognitive load.
 */
export function detectNegativeStem(stem: string): { isNegative: boolean; match?: string } {
  const match = stem.match(/\b(?:NOT|EXCEPT|FALSE|INCORRECT|NEVER)\b/i)
  if (match) {
    return { isNegative: true, match: match[0] }
  }
  return { isNegative: false }
}

/**
 * 7. Classify Distractor Strategy:
 * Maps an incorrect option and its explanation to authentic cognitive error archetypes.
 */
export function classifyDistractorStrategy(
  distractorText: string,
  misconceptionExplanation?: string
): DistractorStrategy {
  const text = `${distractorText} ${misconceptionExplanation || ''}`.toLowerCase()

  if (/sign|direction|negative|positive|inverting|vector|conservation|opposite/i.test(text)) {
    return 'sign_inversion'
  }
  if (/intermediate|preliminary|halfway|unfinished|before dividing|step 1 result/i.test(text)) {
    return 'intermediate_step'
  }
  if (/phonetic|sound|morpholog|clang|surface|colloquial|similar name|conflated/i.test(text)) {
    return 'nominal_conflation'
  }
  if (/boundary|unrestricted|generaliz|assum|domain|outside of|edge case/i.test(text)) {
    return 'boundary_overextension'
  }
  if (/revers|cause|effect|post hoc|antecedent|consequence|temporal/i.test(text)) {
    return 'causal_reversal'
  }
  return 'other'
}

/**
 * Comprehensive Psychometric Quality Evaluation for Practice Problems
 */
export function evaluatePracticeProblemQuality(
  problem: ExtractedPracticeProblem | PracticeProblem
): PracticeProblemQualityScorecard {
  const iwfs: string[] = []
  const issues: string[] = []
  const strengths: string[] = []
  const recommendations: string[] = []

  let qualityScore = 1.0

  const stem = problem.stem_lead_in || problem.problem_text || ''

  // 1. Cover Test Check
  const coverResult = passesCoverTest(stem)
  if (!coverResult.passed) {
    qualityScore -= 0.25
    iwfs.push('Cover Test Failure')
    issues.push(coverResult.reason || 'Stem fails the Cover Test')
    recommendations.push('Rewrite the stem into a direct, focused interrogative question ending in a question mark.')
  } else {
    strengths.push('Stem passes the Cover Test with an explicit, focused problem space.')
  }

  // 2. Negative Stem Check
  const negResult = detectNegativeStem(stem)
  if (negResult.isNegative) {
    qualityScore -= 0.15
    iwfs.push('Negative Stem Phrasing')
    issues.push(`Stem contains negative phrasing ("${negResult.match}").`)
    recommendations.push('Rephrase into a positive interrogative problem statement.')
  }

  // Multiple Choice / Two-Tier specific checks
  let optionsObj: Record<string, string> | undefined
  if ('options' in problem && problem.options) {
    optionsObj = problem.options as Record<string, string>
  } else if ('options_json' in problem && problem.options_json) {
    try {
      optionsObj = JSON.parse(problem.options_json)
    } catch {}
  }

  const distractorDiagnostics: PracticeProblemQualityScorecard['distractor_diagnostics'] = []

  if (optionsObj && Object.keys(optionsObj).length >= 2) {
    const correctKey = problem.correct_key || 'A'
    const correctText = optionsObj[correctKey] || ''
    const distractors = Object.entries(optionsObj)
      .filter(([k]) => k.toUpperCase() !== correctKey.toUpperCase())
      .map(([, v]) => v)

    // 3. Clang Association Check
    const clangResult = detectClangAssociations(stem, correctText, distractors)
    if (clangResult.hasClang) {
      qualityScore -= 0.2
      iwfs.push('Clang Association')
      issues.push(`Clang association detected: terms [${clangResult.matchedTerms.join(', ')}] appear in the stem and exclusively in the correct option.`)
      recommendations.push('Ensure key terms from the stem are balanced across distractors or replaced with conceptual descriptions.')
    }

    // 4. Option Homogeneity & Length Bias
    const homoResult = evaluateOptionHomogeneity(optionsObj, correctKey)
    if (!homoResult.isHomogeneous) {
      qualityScore -= 0.15
      iwfs.push('Option Length / Syntax Disparity')
      issues.push(homoResult.issue || 'Options lack homogeneous length and syntactic equivalence.')
      recommendations.push('Equalize option lengths and match grammatical structures across all choices.')
    }

    // 5. Extreme Determiners
    for (const [k, v] of Object.entries(optionsObj)) {
      const ext = detectExtremeDeterminers(v)
      if (ext.hasExtreme) {
        qualityScore -= 0.1
        iwfs.push('Extreme Determiner in Options')
        issues.push(`Option ${k} contains extreme determiner ("${ext.match}"), allowing test-wise elimination.`)
        recommendations.push('Remove absolute qualifiers like "always" or "never" from options.')
      }
    }

    // 6. Compound Choices
    const compoundResult = detectCompoundChoices(optionsObj)
    if (compoundResult.hasCompound) {
      qualityScore -= 0.25
      iwfs.push('Prohibited Compound Choice')
      issues.push(`Prohibited compound choice detected ("${compoundResult.match}").`)
      recommendations.push('Replace "All/None of the above" and combo choices with distinct, single-proposition distractors.')
    }

    // 7. Distractor Diagnostics
    let validationAnalysis: Record<string, any> = {}
    if ('item_validation' in problem && problem.item_validation?.distractor_analysis) {
      validationAnalysis = problem.item_validation.distractor_analysis
    } else if ('item_validation_json' in problem && problem.item_validation_json) {
      try {
        const parsed = JSON.parse(problem.item_validation_json)
        if (parsed.distractor_analysis) validationAnalysis = parsed.distractor_analysis
      } catch {}
    }

    Object.entries(optionsObj).forEach(([k, text]) => {
      if (k.toUpperCase() !== correctKey.toUpperCase()) {
        const analysis = validationAnalysis[`distractor_${k.toLowerCase()}`] || validationAnalysis[k] || validationAnalysis[`distractor_${Object.keys(optionsObj).indexOf(k)}`]
        const strategy = classifyDistractorStrategy(text, analysis?.misconception_exposed)
        distractorDiagnostics.push({
          option_key: k,
          text,
          strategy,
          misconception_exposed: analysis?.misconception_exposed
        })
      }
    })

    if (distractorDiagnostics.some(d => d.strategy !== 'other' || d.misconception_exposed)) {
      strengths.push('Distractors operate as targeted cognitive probes modeling authentic student error states.')
    }
  }

  // Solution and Derivation Completeness
  if (problem.solution_steps && problem.solution_steps.length > 20) {
    strengths.push('Includes rigorous step-by-step derivation with milestone reasoning.')
  } else {
    qualityScore -= 0.1
    issues.push('Solution steps are brief or missing.')
    recommendations.push('Provide complete intermediate derivation steps and subgoal milestones.')
  }

  // Final Answer Verification
  if (!problem.final_answer || problem.final_answer.trim().length === 0) {
    qualityScore -= 0.1
    issues.push('Final answer is missing.')
  }

  qualityScore = Math.max(0.1, Math.min(1.0, Number(qualityScore.toFixed(2))))

  return {
    valid: issues.length === 0 || qualityScore >= 0.7,
    quality_score: qualityScore,
    cover_test_passed: coverResult.passed,
    iwfs_detected: iwfs,
    issues,
    strengths,
    recommended_actions: recommendations,
    distractor_diagnostics: distractorDiagnostics.length > 0 ? distractorDiagnostics : undefined
  }
}
