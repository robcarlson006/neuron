/**
 * FSRS-5 scheduler (Free Spaced Repetition Scheduler, version 5).
 *
 * Replaces SM-2. Tracks Difficulty (1-10) and Stability (days) per card,
 * schedules next review to hit a user-configurable retention target.
 *
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy.
 */

export type FSRSRating = 1 | 2 | 3 | 4
export type FSRSState = 0 | 1 | 2 | 3  // new | learning | review | relearning

export interface FSRSMemory {
  stability: number     // days
  difficulty: number    // 1..10
  state: FSRSState
  lapses: number
  lastReview?: string   // ISO date
}

export interface FSRSNext extends FSRSMemory {
  interval: number
  dueDate: string       // YYYY-MM-DD
}

// FSRS-5 default weights (published defaults, optimised over large review corpora)
export const FSRS5_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698,
  0.2315, 2.9898, 0.51655, 0.6621
]

const DECAY = -0.5
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1  // ≈ 19/81

export interface FSRSParams {
  desiredRetention: number   // 0.80..0.98, default 0.90
  weights: readonly number[]
  maxInterval: number        // cap (days)
}

export const DEFAULT_FSRS_PARAMS: FSRSParams = {
  desiredRetention: 0.9,
  weights: FSRS5_DEFAULT_WEIGHTS,
  maxInterval: 36500
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Retrievability after t days given stability S. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY)
}

/** Days of stability needed to hit target retention. */
function nextInterval(stability: number, p: FSRSParams): number {
  const i = (stability / FACTOR) * (Math.pow(p.desiredRetention, 1 / DECAY) - 1)
  return clamp(Math.round(i), 1, p.maxInterval)
}

function initialStability(rating: FSRSRating, w: readonly number[]): number {
  return Math.max(0.1, w[rating - 1])
}

function initialDifficulty(rating: FSRSRating, w: readonly number[]): number {
  return clamp(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1, 10)
}

function nextDifficulty(d: number, rating: FSRSRating, w: readonly number[]): number {
  const deltaD = -w[6] * (rating - 3)
  const dPrime = d + deltaD * ((10 - d) / 9)
  const mean = w[7] * initialDifficulty(4, w) + (1 - w[7]) * dPrime
  return clamp(mean, 1, 10)
}

function stabilityAfterSuccess(
  d: number, s: number, r: number, rating: FSRSRating, w: readonly number[]
): number {
  const hardPenalty = rating === 2 ? w[15] : 1
  const easyBonus = rating === 4 ? w[16] : 1
  const factor = Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus
  return Math.max(0.1, s * (1 + factor))
}

function stabilityAfterLapse(
  d: number, s: number, r: number, w: readonly number[]
): number {
  const sMin = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
  return Math.max(0.1, Math.min(sMin, s))
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(fromISO: string, toISO: string): number {
  const ms = new Date(toISO).getTime() - new Date(fromISO).getTime()
  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

/**
 * Compute next FSRS state from a rating.
 * If mem has no lastReview (brand-new card), uses initial stability/difficulty for that rating.
 */
export function fsrsNext(
  mem: FSRSMemory,
  rating: FSRSRating,
  params: FSRSParams = DEFAULT_FSRS_PARAMS,
  nowISO: string = todayISO()
): FSRSNext {
  const w = params.weights

  // New card — first rating seeds stability/difficulty
  if (!mem.lastReview || mem.state === 0) {
    const s = initialStability(rating, w)
    const d = initialDifficulty(rating, w)
    const interval = nextInterval(s, params)
    return {
      stability: s,
      difficulty: d,
      state: rating === 1 ? 1 : 2,
      lapses: rating === 1 ? 1 : 0,
      lastReview: nowISO,
      interval,
      dueDate: addDaysISO(interval)
    }
  }

  const elapsed = daysBetween(mem.lastReview, nowISO)
  const r = retrievability(elapsed, mem.stability)
  const d1 = nextDifficulty(mem.difficulty, rating, w)

  let s1: number
  let state: FSRSState
  let lapses = mem.lapses
  if (rating === 1) {
    s1 = stabilityAfterLapse(d1, mem.stability, r, w)
    state = 3
    lapses += 1
  } else {
    s1 = stabilityAfterSuccess(d1, mem.stability, r, rating, w)
    state = 2
  }

  const interval = nextInterval(s1, params)
  return {
    stability: s1,
    difficulty: d1,
    state,
    lapses,
    lastReview: nowISO,
    interval,
    dueDate: addDaysISO(interval)
  }
}

/**
 * Map legacy SM-2 quality (0-5) to FSRS rating (1-4).
 */
export function qualityToRating(quality: number): FSRSRating {
  if (quality <= 1) return 1          // Again
  if (quality === 2) return 2         // Hard
  if (quality <= 4) return 3          // Good
  return 4                             // Easy
}

/**
 * Seed FSRS memory from legacy SM-2 schedule so existing cards keep their history.
 *   stability  ≈ interval (days since first learned ≈ days of retention)
 *   difficulty ≈ inverse of ease_factor, clamped into FSRS range
 */
export function seedFromSM2(
  interval: number,
  easeFactor: number,
  repetitions: number,
  lastReviewedAt?: string
): FSRSMemory {
  const stability = Math.max(0.1, interval || 1)
  // ease 1.3 → hardest (10), ease 2.5+ → easy end (~4)
  const difficulty = clamp(11 - ((easeFactor - 1.3) / 0.2) * 1.0, 1, 10)
  return {
    stability,
    difficulty,
    state: repetitions > 0 ? 2 : 0,
    lapses: 0,
    lastReview: lastReviewedAt?.split('T')[0]
  }
}

/**
 * Response-time-weighted adjustment to rating.
 * If the user says "Good" but took far longer than their personal average,
 * treat as Hard (implicit hesitation). If much faster, treat Good as Easy.
 * userAvgMs of 0 or missing → no adjustment.
 */
export function adjustRatingByResponseTime(
  rating: FSRSRating,
  responseTimeMs: number | undefined,
  userAvgMs: number | null | undefined
): FSRSRating {
  if (!responseTimeMs || !userAvgMs || userAvgMs <= 0) return rating
  if (rating !== 3) return rating
  const ratio = responseTimeMs / userAvgMs
  if (ratio > 2.2) return 2          // slow "Good" → Hard
  if (ratio < 0.45) return 4          // fast "Good" → Easy
  return rating
}

/** Exam-boost: cap interval at half the time until exam (within 7 days). */
export function boostForExam(interval: number, daysUntilExam: number): number {
  if (daysUntilExam <= 7 && daysUntilExam > 0) {
    return Math.min(interval, Math.max(1, Math.floor(daysUntilExam / 2)))
  }
  return interval
}

/**
 * Project mean retention per day over the next `horizonDays` for a set of memories.
 * Used for the Analytics retention forecast chart.
 */
export function projectRetention(
  memories: Array<{ stability: number; lastReview?: string }>,
  horizonDays: number = 30,
  nowISO: string = todayISO()
): { date: string; retention: number; count: number }[] {
  const out: { date: string; retention: number; count: number }[] = []
  if (memories.length === 0) return out
  for (let d = 0; d <= horizonDays; d++) {
    const date = addDaysISO(d - 0)  // d days from today
    const target = new Date(nowISO)
    target.setDate(target.getDate() + d)
    const targetISO = target.toISOString().split('T')[0]
    let sum = 0
    let n = 0
    for (const m of memories) {
      if (!m.lastReview || m.stability <= 0) continue
      const elapsed = daysBetween(m.lastReview, targetISO)
      sum += retrievability(elapsed, m.stability)
      n += 1
    }
    out.push({ date: targetISO, retention: n ? sum / n : 0, count: n })
    void date
  }
  return out
}
