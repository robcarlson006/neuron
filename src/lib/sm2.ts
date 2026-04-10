import type { SM2Result, CardSchedule } from '../types'

/**
 * SM-2 Spaced Repetition Algorithm
 * Given a quality score (0-5), computes the next interval, repetitions, and ease factor
 */
export function sm2(
  quality: number,
  schedule: Pick<CardSchedule, 'interval' | 'repetitions' | 'ease_factor'>
): SM2Result {
  let { interval, repetitions, ease_factor } = schedule

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * ease_factor)
    }
    repetitions += 1
  } else {
    repetitions = 0
    interval = 1
  }

  // Update ease factor
  ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

  // Clamp ease factor to minimum 1.3
  ease_factor = Math.max(1.3, ease_factor)

  // Calculate due date
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + interval)
  const due_date = dueDate.toISOString().split('T')[0]

  return {
    interval,
    repetitions,
    ease_factor,
    due_date
  }
}

/**
 * Map confidence choice to quality score
 */
export function confidenceToQuality(confidence: 'perfect' | 'hesitation' | 'almost' | 'forgot'): number {
  const map: Record<string, number> = {
    perfect: 5,
    hesitation: 4,
    almost: 3,
    forgot: 1
  }
  return map[confidence] ?? 1
}

/**
 * Get default schedule for a new card.
 * ease_factor starts at the minimum (1.3) so unreviewed cards are treated as
 * unknown (section 1) until the user completes diagnostics or a study session.
 * The ease_factor rises naturally as the user demonstrates knowledge.
 */
export function defaultSchedule(cardId: number, userId: number): Omit<CardSchedule, 'id'> {
  const today = new Date().toISOString().split('T')[0]
  return {
    card_id: cardId,
    user_id: userId,
    interval: 1,
    repetitions: 0,
    ease_factor: 1.3,
    due_date: today,
    last_reviewed_at: undefined
  }
}

/**
 * Check if a card is due today or overdue
 */
export function isDue(dueDate: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  return dueDate <= today
}

/**
 * Check if a card is in maintenance mode (ongoing subjects)
 * Maintenance: interval >= 30 and ease_factor >= 2.5
 */
export function isMaintenanceMode(schedule: CardSchedule): boolean {
  return schedule.interval >= 30 && schedule.ease_factor >= 2.5
}

/**
 * Boost review frequency for exam preparation (within 7 days of exam)
 * Caps the interval at half the time remaining until exam
 */
export function boostForExam(interval: number, daysUntilExam: number): number {
  if (daysUntilExam <= 7 && daysUntilExam > 0) {
    return Math.min(interval, Math.max(1, Math.floor(daysUntilExam / 2)))
  }
  return interval
}
