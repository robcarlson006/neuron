import { retrievability } from './fsrs'
import type {
  Card,
  ConceptMastery,
  SyllabusModule,
  ModuleTopic,
  Deadline,
  ExamReadinessResult,
  TopicReadinessBreakdown,
  CramOptimizationResult,
  CramPlanDay
} from '../types'

export interface CardWithSchedule extends Card {
  interval?: number
  stability?: number | null
  difficulty?: number | null
  state?: number | null
  last_reviewed_at?: string
  due_date?: string
  repetitions?: number
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

export function daysBetweenDates(fromISO: string, toISO: string): number {
  const from = parseDateOnly(fromISO)
  const to = parseDateOnly(toISO)
  const diffMs = to.getTime() - from.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Predicts the retrievability of a card on the exam horizon date.
 */
export function predictCardRetrievabilityAtDate(
  card: CardWithSchedule,
  examDateISO: string
): number {
  const stability = card.stability ?? (card.interval && card.interval > 0 ? card.interval : 0)

  // Unreviewed or newly created card with no review history
  if (!stability || stability <= 0 || !card.last_reviewed_at) {
    return 0.25 // Baseline unassisted retention
  }

  const lastReviewDate = card.last_reviewed_at.slice(0, 10)
  const elapsedDaysToExam = Math.max(0, daysBetweenDates(lastReviewDate, examDateISO))

  return retrievability(elapsedDaysToExam, stability)
}

export interface ExamReadinessInput {
  subjectId: number
  deadline?: Deadline
  examDateISO: string
  cards: CardWithSchedule[]
  concepts?: ConceptMastery[]
  modules?: (SyllabusModule & { topics?: ModuleTopic[] })[]
  nowISO?: string
}

/**
 * Calculates comprehensive exam readiness for a given subject and exam date.
 */
export function calculateExamReadiness(input: ExamReadinessInput): ExamReadinessResult {
  const {
    subjectId,
    deadline,
    examDateISO,
    cards,
    concepts = [],
    modules = [],
    nowISO = new Date().toISOString().slice(0, 10)
  } = input

  const daysRemaining = Math.max(0, daysBetweenDates(nowISO, examDateISO))

  // Map concept mastery for quick lookup
  const conceptMap = new Map<string, number>()
  concepts.forEach(c => {
    if (c.concept) {
      conceptMap.set(c.concept.toLowerCase().trim(), c.mastery_prob)
    }
  })

  // 1. Calculate retrievability & blended score for each card
  const cardScores: { cardId: number; topicName: string; retrievability: number; score: number }[] = []

  cards.forEach(card => {
    const r = predictCardRetrievabilityAtDate(card, examDateISO)
    const topicKey = (card.concept || card.tags || 'General').trim()
    const masteryProb = conceptMap.get(topicKey.toLowerCase()) ?? (card.interval && card.interval >= 21 ? 0.9 : 0.4)

    // Blend: 70% projected retrievability at exam time + 30% empirical concept mastery
    const blendedScore = Math.min(1, Math.max(0, 0.7 * r + 0.3 * masteryProb))
    cardScores.push({
      cardId: card.id,
      topicName: topicKey,
      retrievability: r,
      score: blendedScore
    })
  })

  // 2. Aggregate by topic / syllabus
  const topicMap = new Map<string, { topicId?: number; total: number; mastered: number; sumR: number; sumScore: number }>()

  // Pre-seed with syllabus topics if available
  const allSyllabusTopics: { id?: number; title: string }[] = []
  modules.forEach(m => {
    (m.topics || []).forEach(t => {
      allSyllabusTopics.push({ id: t.id, title: t.title })
      if (!topicMap.has(t.title)) {
        topicMap.set(t.title, { topicId: t.id, total: 0, mastered: 0, sumR: 0, sumScore: 0 })
      }
    })
  })

  cardScores.forEach(cs => {
    const existing = topicMap.get(cs.topicName) || {
      topicId: undefined,
      total: 0,
      mastered: 0,
      sumR: 0,
      sumScore: 0
    }
    existing.total += 1
    if (cs.retrievability >= 0.85) existing.mastered += 1
    existing.sumR += cs.retrievability
    existing.sumScore += cs.score
    topicMap.set(cs.topicName, existing)
  })

  const topicBreakdowns: TopicReadinessBreakdown[] = []
  topicMap.forEach((val, topicTitle) => {
    const avgR = val.total > 0 ? val.sumR / val.total : 0.2
    const projectedTopicScore = val.total > 0 ? Math.round((val.sumScore / val.total) * 100) : 15

    let status: 'strong' | 'moderate' | 'weak' | 'gap' = 'moderate'
    if (val.total === 0) {
      status = 'gap'
    } else if (projectedTopicScore >= 80) {
      status = 'strong'
    } else if (projectedTopicScore >= 60) {
      status = 'moderate'
    } else {
      status = 'weak'
    }

    topicBreakdowns.push({
      topicId: val.topicId,
      topicTitle,
      cardCount: val.total,
      masteredCount: val.mastered,
      retrievability: Number(avgR.toFixed(2)),
      projectedScore: projectedTopicScore,
      status,
      priorityRank: 0
    })
  })

  // Rank topics by deficit (gap / weak first)
  topicBreakdowns.sort((a, b) => a.projectedScore - b.projectedScore)
  topicBreakdowns.forEach((t, idx) => {
    t.priorityRank = idx + 1
  })

  const weakTopics = topicBreakdowns.filter(t => t.status === 'weak' || t.status === 'gap')

  // 3. Curriculum Coverage calculation
  const totalSyllabusTopicCount = allSyllabusTopics.length
  let coveragePercent = 100
  if (totalSyllabusTopicCount > 0) {
    const coveredTopicCount = topicBreakdowns.filter(t => t.cardCount > 0).length
    coveragePercent = Math.min(100, Math.round((coveredTopicCount / totalSyllabusTopicCount) * 100))
  }

  // 4. Overall Projected Exam Score
  let baseScore = 50
  if (cardScores.length > 0) {
    const meanScore = cardScores.reduce((acc, c) => acc + c.score, 0) / cardScores.length
    baseScore = meanScore * 100
  }

  // Coverage weighting: missing 40% of syllabus topics reduces projected score
  const coverageFactor = totalSyllabusTopicCount > 0 ? 0.7 + 0.3 * (coveragePercent / 100) : 1.0
  const finalProjectedScore = Math.max(10, Math.min(100, Math.round(baseScore * coverageFactor)))

  // 5. Confidence Margin & Tier
  const n = Math.max(1, cards.length)
  const confidenceMargin = Math.max(2, Math.min(10, Math.round(15 / Math.sqrt(n))))

  let tier: 'ready' | 'proficient' | 'borderline' | 'critical' = 'borderline'
  let tierLabel = 'Borderline / Review Needed'

  if (finalProjectedScore >= 85) {
    tier = 'ready'
    tierLabel = 'Exam Ready (Targeting A / High Distinction)'
  } else if (finalProjectedScore >= 70) {
    tier = 'proficient'
    tierLabel = 'Proficient (Targeting Pass / B Grade)'
  } else if (finalProjectedScore >= 55) {
    tier = 'borderline'
    tierLabel = 'Borderline (Needs Targeted Review)'
  } else {
    tier = 'critical'
    tierLabel = 'Critical Risk (High Exam Hazard)'
  }

  return {
    subjectId,
    deadlineId: deadline?.id,
    deadlineLabel: deadline?.label || 'Target Exam',
    examDate: examDateISO,
    daysRemaining,
    projectedScore: finalProjectedScore,
    confidenceMargin,
    tier,
    tierLabel,
    coveragePercent,
    totalCards: cards.length,
    weakTopics,
    allTopics: topicBreakdowns
  }
}

export interface CramOptimizationInput {
  readiness: ExamReadinessResult
  cards: CardWithSchedule[]
  dailyMinutes: number
  nowISO?: string
}

/**
 * Optimizes study schedule across remaining days until exam.
 */
export function generateCramOptimizationPlan(input: CramOptimizationInput): CramOptimizationResult {
  const { readiness, cards, dailyMinutes, nowISO = new Date().toISOString().slice(0, 10) } = input
  const daysCount = Math.max(1, readiness.daysRemaining)

  // Rank cards by retrieval deficit (lowest projected retrievability first)
  const scoredCards = cards.map(c => ({
    card: c,
    r: predictCardRetrievabilityAtDate(c, readiness.examDate),
    topic: (c.concept || c.tags || 'General').trim()
  }))

  scoredCards.sort((a, b) => a.r - b.r)

  // Assume avg 45 seconds (0.75 min) per card active review
  const cardsPerDay = Math.max(5, Math.round(dailyMinutes / 0.75))
  const totalCapacity = cardsPerDay * daysCount
  const totalCardsToReview = Math.min(scoredCards.length, totalCapacity)

  const dailyPlan: CramPlanDay[] = []

  let cardCursor = 0
  for (let day = 1; day <= daysCount; day++) {
    const dayDate = new Date(parseDateOnly(nowISO))
    dayDate.setDate(dayDate.getDate() + (day - 1))
    const dateStr = dayDate.toISOString().slice(0, 10)

    const sliceCount = Math.min(cardsPerDay, scoredCards.length - cardCursor)
    const dayCards = scoredCards.slice(cardCursor, cardCursor + sliceCount)
    cardCursor = (cardCursor + sliceCount) % Math.max(1, scoredCards.length)

    const dayTopics = Array.from(new Set(dayCards.map(sc => sc.topic))).slice(0, 4)

    let focusType: 'critical_gaps' | 'weak_reinforce' | 'retention_polish' | 'mock_drill' = 'weak_reinforce'
    let focusTitle = `Day ${day}: Reinforce Priority Concepts`

    if (day === 1 && readiness.weakTopics.length > 0) {
      focusType = 'critical_gaps'
      focusTitle = 'Day 1: Address High-Risk Topic Deficits'
    } else if (day === daysCount) {
      focusType = 'mock_drill'
      focusTitle = `Day ${day}: Final High-Yield Refresh & Confidence Boost`
    } else if (day === daysCount - 1) {
      focusType = 'retention_polish'
      focusTitle = `Day ${day}: Rapid Consolidation of Borderline Items`
    }

    dailyPlan.push({
      dayNumber: day,
      date: dateStr,
      focusTitle,
      topics: dayTopics.length > 0 ? dayTopics : ['High-Yield Review'],
      cardIds: dayCards.map(sc => sc.card.id),
      estimatedMinutes: dailyMinutes,
      targetCardCount: dayCards.length,
      focusType
    })
  }

  // Estimated boost in retention from focused cramming
  // More study minutes & coverage of weak cards yields higher boost
  const studyEffortFactor = Math.min(1.0, (dailyMinutes * daysCount) / (Math.max(10, cards.length) * 1.5))
  const maxPossibleBoost = Math.max(0, 98 - readiness.projectedScore)
  const scoreDelta = Math.round(maxPossibleBoost * 0.75 * studyEffortFactor)
  const projectedBoostedScore = Math.min(99, readiness.projectedScore + scoreDelta)

  return {
    dailyMinutes,
    daysCount,
    totalCardsToReview,
    currentScore: readiness.projectedScore,
    projectedBoostedScore,
    scoreDelta,
    dailyPlan
  }
}
