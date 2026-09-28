/**
 * Small, predictable daily review queue.
 *
 * The scheduler owns long-term spacing; this module owns today's workload.
 * Keeping those responsibilities separate prevents a large backlog from
 * turning every visit into an exhausting marathon.
 */

export interface DailyStudyCard {
  id: number
  subject_id?: number
  due_date: string
  repetitions?: number
  interval?: number
  stability?: number | null
  difficulty?: number | null
  lapses?: number | null
  state?: number | null
}

export interface DailyStudyLimits {
  maxCardsPerDay: number
  maxNewCardsPerDay: number
}

export const DEFAULT_DAILY_STUDY_LIMITS: DailyStudyLimits = {
  maxCardsPerDay: 20,
  maxNewCardsPerDay: 5
}

export interface DailyStudyPlan<T extends DailyStudyCard> {
  cards: T[]
  deferredDue: T[]
  newCards: T[]
  reviewCards: T[]
  isLimitReached: boolean
}

function isNewCard(card: DailyStudyCard): boolean {
  return (card.repetitions ?? 0) === 0 || (card.state != null && card.state === 0)
}

function overdueDays(card: DailyStudyCard, today: string): number {
  const due = new Date(`${card.due_date.slice(0, 10)}T12:00:00`).getTime()
  const now = new Date(`${today.slice(0, 10)}T12:00:00`).getTime()
  return Math.max(0, Math.floor((now - due) / 86400000))
}

/**
 * Rank cards by learning value, then choose a bounded and lightly interleaved
 * slice. Overdue/lapsed cards win, but one subject cannot consume the entire
 * daily budget when several subjects are ready.
 */
export function buildDailyStudyPlan<T extends DailyStudyCard>(
  dueCards: T[],
  today: string,
  limits: DailyStudyLimits = DEFAULT_DAILY_STUDY_LIMITS,
  reviewedTodayIds: ReadonlySet<number> = new Set()
): DailyStudyPlan<T> {
  const maxCards = Math.max(1, Math.floor(limits.maxCardsPerDay))
  const maxNewCards = Math.max(0, Math.min(maxCards, Math.floor(limits.maxNewCardsPerDay)))
  const remaining = dueCards.filter(card => !reviewedTodayIds.has(card.id))

  const priority = (card: T): number => {
    const overdue = overdueDays(card, today)
    const lapses = card.lapses ?? 0
    const stability = card.stability ?? card.interval ?? 0
    const difficulty = card.difficulty ?? 5
    // Overdue and lapsed cards should be protected from starvation. Lower
    // stability/difficulty means the memory is more fragile.
    return overdue * 100 + lapses * 20 + (10 - Math.min(10, difficulty)) + (10 - Math.min(10, stability)) / 10
  }

  const sortByPriority = (a: T, b: T): number => {
    const delta = priority(b) - priority(a)
    if (delta !== 0) return delta
    return a.due_date.localeCompare(b.due_date) || a.id - b.id
  }

  const newCards = remaining.filter(isNewCard).sort(sortByPriority)
  const reviewCards = remaining.filter(card => !isNewCard(card)).sort(sortByPriority)

  // Reviews are never displaced by new material. New cards fill unused space
  // and are independently capped so importing a large deck stays gentle.
  const selectedReviews = reviewCards.slice(0, maxCards)
  const roomForNew = Math.max(0, maxCards - selectedReviews.length)
  const selectedNew = newCards.slice(0, Math.min(maxNewCards, roomForNew))
  const selected = [...selectedReviews, ...selectedNew]

  // Interleave the selected cards by subject while preserving each card's
  // priority within its subject. This reduces context switching fatigue.
  const buckets = new Map<string, T[]>()
  for (const card of selected) {
    const key = String(card.subject_id ?? 'unknown')
    const bucket = buckets.get(key) ?? []
    bucket.push(card)
    buckets.set(key, bucket)
  }
  const interleaved: T[] = []
  while (buckets.size > 0) {
    for (const [key, bucket] of buckets) {
      const next = bucket.shift()
      if (next) interleaved.push(next)
      if (bucket.length === 0) buckets.delete(key)
    }
  }

  const selectedIds = new Set(interleaved.map(card => card.id))
  const deferredDue = remaining.filter(card => !selectedIds.has(card.id))
  return {
    cards: interleaved,
    deferredDue,
    newCards: selectedNew,
    reviewCards: selectedReviews,
    isLimitReached: deferredDue.length > 0 || (dueCards.length > 0 && interleaved.length === 0)
  }
}
