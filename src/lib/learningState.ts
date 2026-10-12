/**
 * Versioned, explainable concept-state derivation. This module deliberately
 * returns categorical states and evidence counts rather than an uncalibrated
 * mastery probability.
 */

export const LEARNING_STATE_VERSION = 'evidence-rules-v1'

export type LearningOutcome = 'correct' | 'partial' | 'incorrect' | 'unassessed'
export type AssistanceLevel = 'none' | 'hint' | 'scaffold' | 'worked_example' | 'direct_answer' | 'unassessed'
export type ProficiencyState = 'not_assessed' | 'needs_work' | 'developing' | 'demonstrated' | 'strong_evidence'
export type CoverageState = 'not_introduced' | 'introduced' | 'practised'
export type ReviewState = 'no_retention_evidence' | 'review_not_due' | 'review_due' | 'review_overdue'
export type EvidenceConfidence = 'insufficient_evidence' | 'limited_evidence' | 'moderate_evidence' | 'strong_evidence'

export interface ConceptAssessmentEvidence {
  id: number | string
  outcome: LearningOutcome
  score?: number | null
  scoreScale?: number
  assistanceLevel?: AssistanceLevel | string | null
  questionKey?: string | null
  taskType?: string | null
  misconception?: string | null
  occurredAt: string
  /** True only for an assessment that occurred at least one day after an earlier assessment. */
  delayedReview?: boolean
}

export interface ConceptLearningState {
  conceptId: number
  conceptLabel: string
  coverage: CoverageState
  proficiency: ProficiencyState
  review: ReviewState
  confidence: EvidenceConfidence
  counts: {
    assessments: number
    independentCorrect: number
    assistedCorrect: number
    partial: number
    incorrect: number
    delayedAssessments: number
  }
  lastAssessedAt?: string
  misconceptions: string[]
  explanation: string[]
  calculationVersion: typeof LEARNING_STATE_VERSION
}

export interface DeriveConceptStateInput {
  conceptId: number
  conceptLabel: string
  introducedAt?: string | null
  assessments: ConceptAssessmentEvidence[]
  now?: Date
  reviewAfterDays?: number
}

function isIndependent(assessment: ConceptAssessmentEvidence): boolean {
  return !assessment.assistanceLevel || assessment.assistanceLevel === 'none'
}

function scoreAsFraction(assessment: ConceptAssessmentEvidence): number | null {
  if (assessment.score == null || !Number.isFinite(assessment.score)) return null
  const scale = assessment.scoreScale || 1
  return Math.max(0, Math.min(1, assessment.score / scale))
}

function effectiveOutcome(assessment: ConceptAssessmentEvidence): LearningOutcome {
  if (assessment.outcome !== 'unassessed') return assessment.outcome
  const score = scoreAsFraction(assessment)
  if (score == null) return 'unassessed'
  return score >= 0.8 ? 'correct' : score > 0 ? 'partial' : 'incorrect'
}

function dayDifference(first: string, second: string): number {
  const elapsed = Date.parse(second) - Date.parse(first)
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed / 86_400_000 : 0
}

export function deriveConceptLearningState(input: DeriveConceptStateInput): ConceptLearningState {
  const now = input.now || new Date()
  const ordered = [...input.assessments].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  // Repeated submissions of the same question count as attempts but only the
  // first response to that question can contribute independent proficiency.
  const seenQuestions = new Set<string>()
  const unique = ordered.filter(item => {
    const key = item.questionKey?.trim()
    if (!key) return true
    if (seenQuestions.has(key)) return false
    seenQuestions.add(key)
    return true
  })
  const scored = unique.filter(item => effectiveOutcome(item) !== 'unassessed')
  const independentCorrect = scored.filter(item => effectiveOutcome(item) === 'correct' && isIndependent(item) && (scoreAsFraction(item) ?? 1) >= 0.8)
  const assistedCorrect = scored.filter(item => effectiveOutcome(item) === 'correct' && !isIndependent(item))
  const partial = scored.filter(item => effectiveOutcome(item) === 'partial')
  const incorrect = scored.filter(item => effectiveOutcome(item) === 'incorrect')
  const last = ordered[ordered.length - 1]
  const latestOutcome = last ? effectiveOutcome(last) : 'unassessed'
  const independentDays = independentCorrect.map(item => item.occurredAt).sort()
  const spansTwoDays = independentDays.length >= 2 && dayDifference(independentDays[0], independentDays[independentDays.length - 1]) >= 1
  const includesTransfer = independentCorrect.some(item => /transfer|application|novel/i.test(item.taskType || ''))

  let proficiency: ProficiencyState = 'not_assessed'
  if (scored.length) {
    if (latestOutcome === 'incorrect' || (incorrect.length >= 2 && independentCorrect.length === 0)) proficiency = 'needs_work'
    else if (independentCorrect.length >= 3 && spansTwoDays && includesTransfer) proficiency = 'strong_evidence'
    else if (independentCorrect.length >= 2 && spansTwoDays) proficiency = 'demonstrated'
    else proficiency = 'developing'
  }

  const lastDate = last ? Date.parse(last.occurredAt) : NaN
  const elapsedDays = Number.isFinite(lastDate) ? (now.getTime() - lastDate) / 86_400_000 : 0
  const reviewAfterDays = input.reviewAfterDays ?? 7
  let review: ReviewState = 'no_retention_evidence'
  if (scored.length) {
    if (elapsedDays >= reviewAfterDays * 2) review = 'review_overdue'
    else if (elapsedDays >= reviewAfterDays) review = 'review_due'
    else review = 'review_not_due'
  }
  const delayedAssessments = ordered.filter(item => item.delayedReview && effectiveOutcome(item) === 'correct').length
  const confidence: EvidenceConfidence = independentCorrect.length >= 3 && spansTwoDays
    ? 'strong_evidence'
    : independentCorrect.length >= 2
      ? 'moderate_evidence'
      : scored.length > 0
        ? 'limited_evidence'
        : 'insufficient_evidence'
  const coverage: CoverageState = scored.length ? 'practised' : input.introducedAt ? 'introduced' : 'not_introduced'
  const misconceptions = Array.from(new Set(scored.map(item => item.misconception?.trim()).filter((value): value is string => Boolean(value))))
  const explanation: string[] = []
  if (!scored.length) explanation.push(input.introducedAt ? 'Concept was introduced; no assessable answer evidence is recorded.' : 'No introduction or assessment evidence is recorded.')
  else {
    explanation.push(`${scored.length} distinct assessment${scored.length === 1 ? '' : 's'} contributed evidence.`)
    explanation.push(`${independentCorrect.length} independent correct response${independentCorrect.length === 1 ? '' : 's'} met the 80% rubric threshold.`)
    if (assistedCorrect.length) explanation.push(`${assistedCorrect.length} correct response${assistedCorrect.length === 1 ? '' : 's'} required assistance and do not count as independent demonstrations.`)
    if (partial.length) explanation.push(`${partial.length} partial response${partial.length === 1 ? '' : 's'} recorded.`)
    if (incorrect.length) explanation.push(`${incorrect.length} incorrect response${incorrect.length === 1 ? '' : 's'} recorded.`)
    if (delayedAssessments) explanation.push(`${delayedAssessments} assessment${delayedAssessments === 1 ? '' : 's'} followed an interval of at least one day; this is retention evidence.`)
    else explanation.push('Delayed recall has not been verified.')
  }

  return {
    conceptId: input.conceptId,
    conceptLabel: input.conceptLabel,
    coverage,
    proficiency,
    review,
    confidence,
    counts: {
      assessments: scored.length,
      independentCorrect: independentCorrect.length,
      assistedCorrect: assistedCorrect.length,
      partial: partial.length,
      incorrect: incorrect.length,
      delayedAssessments
    },
    lastAssessedAt: last?.occurredAt,
    misconceptions,
    explanation,
    calculationVersion: LEARNING_STATE_VERSION
  }
}
