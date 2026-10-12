/**
 * Pure, deterministic functions for concept-level coverage, rubric scoring,
 * topological teaching order sequencing, and session planning.
 */

import type {
  TopicConcept,
  ConceptProgressState,
  ConceptCoveragePlan,
  TopicCoverageRollup
} from '../../types'

export interface RubricEvaluationInput {
  keyPointsTotal: number
  keyPointsHit: number[]
  hasMaterialMisconception?: boolean
  assistanceLevel?: 'none' | 'hint' | 'scaffold' | 'worked_example' | 'direct_answer' | 'unassessed'
}

/**
 * Compute 0-10 score based on rubric key points hit and assistance level caps:
 * raw = 10 * (keyPointsHit / keyPointsTotal)
 * raw -= 2 if material misconception (min 0)
 * cap = none: 10 | hint: 8 | scaffold: 7 | worked_example: 5 | direct_answer: 0 | unassessed: 0
 * score = min(raw, cap), rounded to nearest 0.5
 */
export function computeRubricScore(input: RubricEvaluationInput): number {
  if (input.assistanceLevel === 'unassessed' || input.assistanceLevel === 'direct_answer') {
    return 0
  }
  if (!input.keyPointsTotal || input.keyPointsTotal <= 0) {
    return 0
  }

  const validHitsCount = (input.keyPointsHit || []).filter(
    (idx) => idx >= 0 && idx < input.keyPointsTotal
  ).length

  let raw = (10 * validHitsCount) / input.keyPointsTotal
  if (input.hasMaterialMisconception) {
    raw = Math.max(0, raw - 2)
  }

  const caps: Record<string, number> = {
    none: 10,
    hint: 8,
    scaffold: 7,
    worked_example: 5
  }
  const cap = caps[input.assistanceLevel || 'none'] ?? 10
  const capped = Math.min(raw, cap)

  // Round to nearest 0.5
  return Math.round(capped * 2) / 2
}

/**
 * Compute concept mastery score out of 10 from historical assessment scores.
 * Recency-weighted mean with decay factor 0.8:
 * weights: 1.0, 0.8, 0.64, 0.512, ... (newest to oldest)
 *
 * ACCURACY GUARDRAIL:
 * - If assessments count == 0: returns null (not yet assessed)
 * - If assessments count < 2: score is capped strictly at 8.0 (cannot claim mastery >= 8.0 on a single lucky answer)
 */
export function computeConceptMastery(scoresNewestFirst: number[]): {
  masteryScore10: number | null
  count: number
} {
  if (!scoresNewestFirst || scoresNewestFirst.length === 0) {
    return { masteryScore10: null, count: 0 }
  }

  let weightedSum = 0
  let totalWeight = 0
  let currentWeight = 1.0

  for (const score of scoresNewestFirst) {
    weightedSum += score * currentWeight
    totalWeight += currentWeight
    currentWeight *= 0.8
  }

  let finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Guardrail: Scores > 8 require at least 2 independent assessments
  if (scoresNewestFirst.length < 2 && finalScore > 8.0) {
    finalScore = 8.0
  }

  const rounded = Math.round(finalScore * 10) / 10
  return {
    masteryScore10: Math.max(0, Math.min(10, rounded)),
    count: scoresNewestFirst.length
  }
}

/**
 * Rollup topic-level coverage and mastery.
 * Topic mastery is the mean of assessed concepts' mastery scores.
 * Coverage is assessed_concepts / total_concepts.
 */
export function computeTopicRollup(
  topicId: number,
  concepts: TopicConcept[]
): TopicCoverageRollup {
  if (!concepts || concepts.length === 0) {
    return {
      topic_id: topicId,
      total_concepts: 0,
      assessed_concepts: 0,
      introduced_concepts: 0,
      unseen_concepts: 0,
      coverage_percentage: 0,
      mastery_score_10: null,
      has_concept_data: false
    }
  }

  let assessedCount = 0
  let introducedCount = 0
  let unseenCount = 0
  let totalAssessedScore = 0

  for (const c of concepts) {
    const state: ConceptProgressState = c.progress_state || 'unseen'
    if (state === 'assessed') {
      assessedCount++
      if (c.mastery_score_10 !== null && c.mastery_score_10 !== undefined) {
        totalAssessedScore += c.mastery_score_10
      }
    } else if (state === 'introduced') {
      introducedCount++
    } else {
      unseenCount++
    }
  }

  const coverage = Math.round((assessedCount / concepts.length) * 100)
  const averageMastery =
    assessedCount > 0
      ? Math.round((totalAssessedScore / assessedCount) * 10) / 10
      : null

  return {
    topic_id: topicId,
    total_concepts: concepts.length,
    assessed_concepts: assessedCount,
    introduced_concepts: introducedCount,
    unseen_concepts: unseenCount,
    coverage_percentage: coverage,
    mastery_score_10: averageMastery,
    has_concept_data: true
  }
}

export interface ExtractedRawConcept {
  label: string
  summary?: string
  key_points: string[]
  source_chunk_ids: string[]
  prerequisite_labels?: string[]
  teach_order_hint?: number
}

/**
 * Validate and topologically sort concepts into optimal pedagogical teaching order.
 * - Resolves prerequisite labels to matched concept labels
 * - Eliminates self-dependencies and unknown labels
 * - Detects and breaks cycles gracefully (using teach_order_hint as tie-breaker)
 * - Returns concepts in strict topological order with clean integer teach_order (1, 2, 3...)
 */
export function validateTeachingOrder(
  rawConcepts: ExtractedRawConcept[]
): Array<ExtractedRawConcept & { teach_order: number; resolved_prereq_indices: number[] }> {
  if (!rawConcepts || rawConcepts.length === 0) return []

  const n = rawConcepts.length
  // Map lowercase label to index
  const labelToIndex = new Map<string, number>()
  rawConcepts.forEach((c, idx) => {
    labelToIndex.set(c.label.trim().toLowerCase(), idx)
  })

  // Build adjacency list for prerequisites: u -> v means u requires v (v must come before u)
  // For topological sort, edge from v -> u (v is prerequisite of u)
  const inDegree = new Array(n).fill(0)
  const adj: number[][] = Array.from({ length: n }, () => [])
  const resolvedPrereqs: number[][] = Array.from({ length: n }, () => [])

  rawConcepts.forEach((c, u) => {
    const prereqLabels = c.prerequisite_labels || []
    const prereqSet = new Set<number>()
    for (const pLabel of prereqLabels) {
      const v = labelToIndex.get(pLabel.trim().toLowerCase())
      if (v !== undefined && v !== u) {
        prereqSet.add(v)
      }
    }
    const prereqList = Array.from(prereqSet)
    resolvedPrereqs[u] = prereqList
    for (const v of prereqList) {
      adj[v].push(u)
      inDegree[u]++
    }
  })

  // Kahn's algorithm with priority based on teach_order_hint / original index
  const available: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) available.push(i)
  }

  const sortAvailable = (arr: number[]) => {
    arr.sort((a, b) => {
      const hintA = rawConcepts[a].teach_order_hint ?? a
      const hintB = rawConcepts[b].teach_order_hint ?? b
      return hintA - hintB
    })
  }
  sortAvailable(available)

  const orderedIndices: number[] = []
  const visited = new Set<number>()

  while (available.length > 0) {
    const curr = available.shift()!
    orderedIndices.push(curr)
    visited.add(curr)

    for (const next of adj[curr]) {
      inDegree[next]--
      if (inDegree[next] === 0) {
        available.push(next)
      }
    }
    sortAvailable(available)
  }

  // If cycle exists, append unvisited items in order of original hint
  if (orderedIndices.length < n) {
    const remaining: number[] = []
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) remaining.push(i)
    }
    remaining.sort((a, b) => (rawConcepts[a].teach_order_hint ?? a) - (rawConcepts[b].teach_order_hint ?? b))
    orderedIndices.push(...remaining)
  }

  return orderedIndices.map((idx, orderRank) => ({
    ...rawConcepts[idx],
    teach_order: orderRank + 1,
    resolved_prereq_indices: resolvedPrereqs[idx]
  }))
}

/**
 * Builds coverage plan for a tutor session.
 *
 * Rules:
 * 1. REVIEW: Concepts with mastery < 8.0, or is_due_for_review === true.
 *    Capped at 5 concepts max, sorted lowest mastery first (weakest first).
 * 2. NEW: Concepts that are unseen or introduced, sorted by teach_order.
 *    If an upcoming new concept has an unseen prerequisite, that prerequisite is pulled forward first.
 *    If an upcoming new concept has an assessed but weak prerequisite (mastery < 6.0),
 *    it is added to refresherPrerequisites.
 * 3. DONE: Concepts with mastery >= 8.0, assessed >= 2 times, and not due for review.
 */
export function buildCoveragePlan(concepts: TopicConcept[]): ConceptCoveragePlan {
  if (!concepts || concepts.length === 0) {
    return { review: [], newConcepts: [], done: [], refresherPrerequisites: [] }
  }

  const conceptMap = new Map<number, TopicConcept>()
  concepts.forEach((c) => conceptMap.set(c.id, c))

  const reviewCandidates: TopicConcept[] = []
  const newCandidates: TopicConcept[] = []
  const doneCandidates: TopicConcept[] = []
  const refreshers: TopicConcept[] = []

  // Classify each concept
  for (const c of concepts) {
    const state = c.progress_state || 'unseen'
    const mastery = c.mastery_score_10
    const count = c.assessment_count || 0
    const isDue = Boolean(c.is_due_for_review)

    if (state === 'assessed') {
      if (isDue || mastery === null || mastery === undefined || mastery < 8.0 || count < 2) {
        reviewCandidates.push(c)
      } else {
        doneCandidates.push(c)
      }
    } else {
      // unseen or introduced
      newCandidates.push(c)
    }
  }

  // REVIEW list: sort lowest score first, tie-break by is_due_for_review
  reviewCandidates.sort((a, b) => {
    const scoreA = a.mastery_score_10 ?? 0
    const scoreB = b.mastery_score_10 ?? 0
    if (scoreA !== scoreB) return scoreA - scoreB
    if (a.is_due_for_review && !b.is_due_for_review) return -1
    if (!a.is_due_for_review && b.is_due_for_review) return 1
    return a.teach_order - b.teach_order
  })
  const review = reviewCandidates.slice(0, 5)

  // NEW list: order by teach_order, ensuring prerequisites come before dependents
  newCandidates.sort((a, b) => a.teach_order - b.teach_order)

  const plannedNew: TopicConcept[] = []
  const addedNewIds = new Set<number>()

  for (const c of newCandidates) {
    // Check prerequisites
    if (c.prerequisite_ids && c.prerequisite_ids.length > 0) {
      for (const pId of c.prerequisite_ids) {
        const prereq = conceptMap.get(pId)
        if (prereq) {
          const pState = prereq.progress_state || 'unseen'
          if (pState !== 'assessed') {
            // Unseen prerequisite: pull forward before c if not already added
            if (!addedNewIds.has(prereq.id)) {
              plannedNew.push(prereq)
              addedNewIds.add(prereq.id)
            }
          } else {
            // Assessed prerequisite: if weak (< 6.0), add to refresher
            const pScore = prereq.mastery_score_10 ?? 0
            if (pScore < 6.0 && !refreshers.some((r) => r.id === prereq.id)) {
              refreshers.push(prereq)
            }
          }
        }
      }
    }

    if (!addedNewIds.has(c.id)) {
      plannedNew.push(c)
      addedNewIds.add(c.id)
    }
  }

  return {
    review,
    newConcepts: plannedNew,
    done: doneCandidates,
    refresherPrerequisites: refreshers
  }
}

/**
 * Extracts [CONCEPT:123] tag from tutor AI response.
 * Returns the conceptId as number or null.
 */
export function parseConceptTag(text: string, allowedConceptIds?: Set<number>): number | null {
  if (!text) return null
  const regex = /\[CONCEPT:\s*(\d+)\]/i
  const match = regex.exec(text)
  if (!match) return null

  const id = parseInt(match[1], 10)
  if (isNaN(id)) return null
  if (allowedConceptIds && !allowedConceptIds.has(id)) return null

  return id
}

/**
 * Strips [CONCEPT:123] tags from user-facing text cleanly.
 */
export function stripConceptTags(text: string): string {
  if (!text) return ''
  return text.replace(/\[CONCEPT:\s*\d+\]/gi, '').trim()
}
