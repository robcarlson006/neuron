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

function normalizeTopicTitle(title: string | null | undefined): string {
  return (title || '').trim().toLocaleLowerCase()
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
    modules = [],
    nowISO = new Date().toISOString().slice(0, 10)
  } = input

  const daysRemaining = Math.max(0, daysBetweenDates(nowISO, examDateISO))

  // Resolve explicit topic links first. Legacy concept text is accepted only when
  // it identifies exactly one syllabus topic; ambiguous/unmatched cards stay unassigned.
  const syllabusTopics: { id?: number; title: string }[] = []
  modules.forEach(m => {
    (m.topics || []).forEach(t => {
      syllabusTopics.push({ id: t.id, title: t.title })
    })
  })

  const topicMap = new Map<string, { topicId?: number; total: number; mastered: number; sumR: number }>()
  const topicTitles = new Map<string, string>()
  const syllabusById = new Map<number, { id?: number; title: string }>()
  const syllabusByTitle = new Map<string, { id?: number; title: string }[]>()
  syllabusTopics.forEach(topic => {
    const key = `topic:${topic.id ?? `title:${normalizeTopicTitle(topic.title)}`}`
    if (!topicMap.has(key)) topicMap.set(key, { topicId: topic.id, total: 0, mastered: 0, sumR: 0 })
    topicTitles.set(key, topic.title)
    if (topic.id != null) syllabusById.set(topic.id, topic)
    const titleKey = normalizeTopicTitle(topic.title)
    syllabusByTitle.set(titleKey, [...(syllabusByTitle.get(titleKey) || []), topic])
  })

  // 1. Aggregate observed card evidence by its resolved syllabus topic.
  cards.forEach(card => {
    const topicById = card.topic_id != null ? syllabusById.get(card.topic_id) : undefined
    const titleMatches = syllabusByTitle.get(normalizeTopicTitle(card.concept)) || []
    const matchedTopic = topicById || (titleMatches.length === 1 ? titleMatches[0] : undefined)
    const topicKey = matchedTopic
      ? `topic:${matchedTopic.id ?? `title:${normalizeTopicTitle(matchedTopic.title)}`}`
      : 'unassigned'
    const topicTitle = matchedTopic?.title || 'Unassigned cards'
    const r = predictCardRetrievabilityAtDate(card, examDateISO)
    const stats = topicMap.get(topicKey) || { topicId: undefined, total: 0, mastered: 0, sumR: 0 }
    stats.total += 1
    if (r >= 0.85) stats.mastered += 1
    stats.sumR += r
    topicMap.set(topicKey, stats)
    topicTitles.set(topicKey, topicTitle)
  })

  const topicBreakdowns: TopicReadinessBreakdown[] = []
  topicMap.forEach((val, topicKey) => {
    const avgR = val.total > 0 ? val.sumR / val.total : 0
    let status: 'strong' | 'moderate' | 'weak' | 'gap' = 'moderate'
    if (val.total === 0) {
      status = 'gap'
    } else if (avgR >= 0.85) {
      status = 'strong'
    } else if (avgR >= 0.6) {
      status = 'moderate'
    } else {
      status = 'weak'
    }

    topicBreakdowns.push({
      topicId: val.topicId,
      topicTitle: topicTitles.get(topicKey) || 'Unassigned cards',
      cardCount: val.total,
      masteredCount: val.mastered,
      retrievability: Number(avgR.toFixed(2)),
      status,
      priorityRank: 0
    })
  })

  // Rank topics by deficit (gap / weak first)
  topicBreakdowns.sort((a, b) => a.retrievability - b.retrievability)
  topicBreakdowns.forEach((t, idx) => {
    t.priorityRank = idx + 1
  })

  const weakTopics = topicBreakdowns.filter(t => t.status === 'weak' || t.status === 'gap')

  // 3. Curriculum Coverage calculation
  const totalSyllabusTopicCount = syllabusTopics.length
  const coveredTopicIds = new Set(cards.flatMap(card => {
    if (card.topic_id != null && syllabusById.has(card.topic_id)) return [card.topic_id]
    const matches = syllabusByTitle.get(normalizeTopicTitle(card.concept)) || []
    return matches.length === 1 && matches[0].id != null ? [matches[0].id] : []
  }))
  const coveredTopicTitles = new Set(cards.flatMap(card => {
    if (card.topic_id != null && syllabusById.has(card.topic_id)) return [syllabusById.get(card.topic_id)!.title]
    const matches = syllabusByTitle.get(normalizeTopicTitle(card.concept)) || []
    return matches.length === 1 ? [matches[0].title] : []
  }))
  const coveragePercent = totalSyllabusTopicCount > 0
    ? Math.min(100, Math.round((syllabusTopics.filter(topic => topic.id != null
      ? coveredTopicIds.has(topic.id)
      : coveredTopicTitles.has(topic.title)).length / totalSyllabusTopicCount) * 100))
    : undefined

  return {
    subjectId,
    deadlineId: deadline?.id,
    deadlineLabel: deadline?.label || 'Target Exam',
    examDate: examDateISO,
    daysRemaining,
    coveragePercent,
    evidenceStatus: cards.length > 0 ? 'available' : 'no_evidence',
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

  return {
    dailyMinutes,
    daysCount,
    totalCardsToReview,
    dailyPlan
  }
}
