import {
  retrievability,
  fsrsNext,
  qualityToRating,
  seedFromSM2,
  adjustRatingByResponseTime,
  boostForExam,
  projectRetention,
  suggestRetention,
  DEFAULT_FSRS_PARAMS,
  FSRS5_DEFAULT_WEIGHTS,
  type FSRSMemory
} from '../../src/lib/fsrs'

const W = FSRS5_DEFAULT_WEIGHTS

function newMemory(overrides: Partial<FSRSMemory> = {}): FSRSMemory {
  return {
    stability: 5,
    difficulty: 5,
    state: 2,
    lapses: 0,
    lastReview: '2026-01-01',
    ...overrides
  }
}

describe('FSRS-5 scheduler', () => {
  describe('retrievability', () => {
    it('returns 1 at zero elapsed days', () => {
      expect(retrievability(0, 5)).toBeCloseTo(1, 5)
    })

    it('returns 0.9 when elapsed equals stability (by FSRS design)', () => {
      expect(retrievability(5, 5)).toBeCloseTo(0.9, 5)
    })

    it('returns 0 for non-positive stability', () => {
      expect(retrievability(10, 0)).toBe(0)
      expect(retrievability(10, -3)).toBe(0)
    })

    it('decreases as elapsed time grows', () => {
      expect(retrievability(10, 5)).toBeLessThan(retrievability(5, 5))
      expect(retrievability(10, 5)).toBeGreaterThan(0)
      expect(retrievability(10, 5)).toBeLessThan(1)
    })
  })

  describe('fsrsNext — new card (no prior review)', () => {
    it('seeds stability and difficulty from rating', () => {
      const next = fsrsNext(newMemory({ lastReview: undefined, state: 0 }), 3, DEFAULT_FSRS_PARAMS, '2026-01-01')
      expect(next.stability).toBeCloseTo(W[2], 5)
      expect(next.difficulty).toBeGreaterThanOrEqual(1)
      expect(next.difficulty).toBeLessThanOrEqual(10)
      expect(next.lastReview).toBe('2026-01-01')
      expect(next.interval).toBeGreaterThanOrEqual(1)
    })

    it('rating 1 (Again) puts card in learning state with a lapse', () => {
      const next = fsrsNext(newMemory({ lastReview: undefined }), 1, DEFAULT_FSRS_PARAMS, '2026-01-01')
      expect(next.state).toBe(1)
      expect(next.lapses).toBe(1)
    })

    it('rating 2-4 puts new card in review state with no lapse', () => {
      for (const rating of [2, 3, 4] as const) {
        const next = fsrsNext(newMemory({ lastReview: undefined }), rating, DEFAULT_FSRS_PARAMS, '2026-01-01')
        expect(next.state).toBe(2)
        expect(next.lapses).toBe(0)
      }
    })

    it('produces a future due date', () => {
      const next = fsrsNext(newMemory({ lastReview: undefined }), 4, DEFAULT_FSRS_PARAMS, '2026-01-01')
      expect(next.dueDate > '2026-01-01').toBe(true)
    })
  })

  describe('fsrsNext — existing card', () => {
    it('rating 1 (Again) → relearning state and increments lapses', () => {
      const next = fsrsNext(newMemory({ lapses: 2 }), 1, DEFAULT_FSRS_PARAMS, '2026-01-05')
      expect(next.state).toBe(3)
      expect(next.lapses).toBe(3)
    })

    it('rating 2-4 → review state and preserves lapses', () => {
      for (const rating of [2, 3, 4] as const) {
        const next = fsrsNext(newMemory({ lapses: 2 }), rating, DEFAULT_FSRS_PARAMS, '2026-01-05')
        expect(next.state).toBe(2)
        expect(next.lapses).toBe(2)
      }
    })

    it('keeps difficulty within [1, 10] across many reviews', () => {
      let mem: FSRSMemory = newMemory({ lastReview: undefined })
      for (let i = 0; i < 50; i++) {
        const rating = (i % 4 + 1) as 1 | 2 | 3 | 4
        mem = fsrsNext(mem, rating, DEFAULT_FSRS_PARAMS, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`)
        expect(mem.difficulty).toBeGreaterThanOrEqual(1)
        expect(mem.difficulty).toBeLessThanOrEqual(10)
        expect(mem.stability).toBeGreaterThan(0)
      }
    })

    it('rating 4 (Easy) yields a larger interval than rating 2 (Hard)', () => {
      const hard = fsrsNext(newMemory(), 2, DEFAULT_FSRS_PARAMS, '2026-01-05')
      const easy = fsrsNext(newMemory(), 4, DEFAULT_FSRS_PARAMS, '2026-01-05')
      expect(easy.interval).toBeGreaterThanOrEqual(hard.interval)
    })
  })

  describe('fsrsNext default timestamp', () => {
    it('uses today when nowISO is omitted', () => {
      const next = fsrsNext(newMemory({ lastReview: undefined }), 3)
      expect(next.lastReview).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(next.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('qualityToRating', () => {
    it('maps legacy SM-2 quality to FSRS rating', () => {
      expect(qualityToRating(0)).toBe(1)
      expect(qualityToRating(1)).toBe(1)
      expect(qualityToRating(2)).toBe(2)
      expect(qualityToRating(3)).toBe(3)
      expect(qualityToRating(4)).toBe(3)
      expect(qualityToRating(5)).toBe(4)
    })
  })

  describe('seedFromSM2', () => {
    it('maps interval to stability', () => {
      const mem = seedFromSM2(10, 2.5, 3, '2026-01-01T12:00:00Z')
      expect(mem.stability).toBeCloseTo(10, 5)
    })

    it('maps ease factor inversely to difficulty', () => {
      const hard = seedFromSM2(10, 1.3, 3)
      const easy = seedFromSM2(10, 2.5, 3)
      expect(hard.difficulty).toBeGreaterThan(easy.difficulty)
      expect(hard.difficulty).toBeLessThanOrEqual(10)
      expect(easy.difficulty).toBeGreaterThanOrEqual(1)
    })

    it('sets state to review when repetitions > 0, new otherwise', () => {
      expect(seedFromSM2(10, 2.5, 3).state).toBe(2)
      expect(seedFromSM2(10, 2.5, 0).state).toBe(0)
    })

    it('strips time from lastReviewedAt and defaults to undefined', () => {
      expect(seedFromSM2(10, 2.5, 3, '2026-01-01T12:00:00Z').lastReview).toBe('2026-01-01')
      expect(seedFromSM2(10, 2.5, 3).lastReview).toBeUndefined()
    })

    it('treats a zero interval as a fresh card with stability 1', () => {
      expect(seedFromSM2(0, 2.5, 0).stability).toBe(1)
    })
  })

  describe('adjustRatingByResponseTime', () => {
    it('returns rating unchanged when timing data is missing', () => {
      expect(adjustRatingByResponseTime(3, undefined, 100)).toBe(3)
      expect(adjustRatingByResponseTime(3, 100, null)).toBe(3)
      expect(adjustRatingByResponseTime(3, 100, 0)).toBe(3)
    })

    it('only adjusts "Good" (rating 3)', () => {
      expect(adjustRatingByResponseTime(2, 999, 100)).toBe(2)
      expect(adjustRatingByResponseTime(4, 1, 100)).toBe(4)
    })

    it('demotes slow "Good" to Hard', () => {
      expect(adjustRatingByResponseTime(3, 300, 100)).toBe(2)
    })

    it('promotes fast "Good" to Easy', () => {
      expect(adjustRatingByResponseTime(3, 10, 100)).toBe(4)
    })

    it('keeps "Good" within normal range', () => {
      expect(adjustRatingByResponseTime(3, 100, 100)).toBe(3)
    })
  })

  describe('boostForExam', () => {
    it('caps interval within 7 days of exam', () => {
      expect(boostForExam(10, 3)).toBe(1)
      expect(boostForExam(10, 7)).toBe(3)
    })

    it('does not boost beyond 7 days', () => {
      expect(boostForExam(10, 8)).toBe(10)
    })

    it('does not boost for non-positive days', () => {
      expect(boostForExam(10, 0)).toBe(10)
      expect(boostForExam(10, -5)).toBe(10)
    })
  })

  describe('projectRetention', () => {
    it('returns empty array for no memories', () => {
      expect(projectRetention([], 30)).toEqual([])
    })

    it('returns horizon+1 points', () => {
      const points = projectRetention([{ stability: 5, lastReview: '2026-01-01' }], 30)
      expect(points).toHaveLength(31)
    })

    it('skips memories with no lastReview or non-positive stability', () => {
      const points = projectRetention([
        { stability: 5, lastReview: '2026-01-01' },
        { stability: 5 },
        { stability: 0, lastReview: '2026-01-01' }
      ], 5)
      expect(points[0].count).toBe(1)
    })
  })

  describe('suggestRetention', () => {
    it('returns default retention with no probes', () => {
      expect(suggestRetention([])).toBe(DEFAULT_FSRS_PARAMS.desiredRetention)
    })

    it('picks the candidate closest to its observed actual recall', () => {
      const probes = [
        { desired: 0.80, actual: 0.81 },
        { desired: 0.90, actual: 0.50 },
        { desired: 0.95, actual: 0.94 }
      ]
      // 0.80 candidate gap |0.80-0.81|=0.01 vs 0.95 gap |0.95-0.94|=0.01
      // 0.80 is checked first and tied, so it wins; assert a candidate is returned.
      expect(suggestRetention(probes)).toBe(0.80)
    })
  })
})
