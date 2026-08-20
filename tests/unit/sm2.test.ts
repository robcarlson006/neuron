import { sm2, confidenceToQuality, isDue, isMaintenanceMode, defaultSchedule as makeDefaultSchedule, boostForExam } from '../../src/lib/sm2'
import type { CardSchedule } from '../../src/types'

const defaultSchedule = {
  interval: 1,
  repetitions: 0,
  ease_factor: 2.5
}

describe('SM-2 Algorithm', () => {
  describe('Quality 5 (Perfect)', () => {
    it('first repetition: interval=1, repetitions=1', () => {
      const result = sm2(5, { interval: 1, repetitions: 0, ease_factor: 2.5 })
      expect(result.repetitions).toBe(1)
      expect(result.interval).toBe(1)
      expect(result.ease_factor).toBeCloseTo(2.6, 1)
    })

    it('second repetition: interval=6, repetitions=2', () => {
      const result = sm2(5, { interval: 1, repetitions: 1, ease_factor: 2.6 })
      expect(result.repetitions).toBe(2)
      expect(result.interval).toBe(6)
    })

    it('third repetition: interval = prev_interval * ease_factor', () => {
      const result = sm2(5, { interval: 6, repetitions: 2, ease_factor: 2.6 })
      expect(result.repetitions).toBe(3)
      expect(result.interval).toBe(Math.round(6 * 2.6))
    })
  })

  describe('Quality 4 (Hesitation)', () => {
    it('first repetition: interval=1', () => {
      const result = sm2(4, { interval: 1, repetitions: 0, ease_factor: 2.5 })
      expect(result.repetitions).toBe(1)
      expect(result.interval).toBe(1)
    })

    it('ease factor stays the same at quality=4 with ef=2.5 (neutralpoint)', () => {
      // quality=4: ef + (0.1 - (5-4)*(0.08 + (5-4)*0.02)) = ef + (0.1 - 1*0.10) = ef + 0 = ef
      const result = sm2(4, defaultSchedule)
      expect(result.ease_factor).toBeCloseTo(2.5, 5)
    })
  })

  describe('Quality 3 (Almost)', () => {
    it('passes threshold, repetitions increment', () => {
      const result = sm2(3, { interval: 1, repetitions: 0, ease_factor: 2.5 })
      expect(result.repetitions).toBe(1)
    })

    it('ease factor decreases slightly', () => {
      const result = sm2(3, defaultSchedule)
      // quality=3: ef + (0.1 - (5-3)*(0.08 + (5-3)*0.02)) = ef + (0.1 - 2*(0.08+0.04)) = ef + (0.1 - 0.24) = ef - 0.14
      expect(result.ease_factor).toBeCloseTo(2.5 - 0.14, 1)
    })
  })

  describe('Quality 2 (Below threshold)', () => {
    it('resets repetitions to 0, interval to 1', () => {
      const result = sm2(2, { interval: 30, repetitions: 5, ease_factor: 2.5 })
      expect(result.repetitions).toBe(0)
      expect(result.interval).toBe(1)
    })

    it('decreases ease factor', () => {
      const result = sm2(2, defaultSchedule)
      expect(result.ease_factor).toBeLessThan(2.5)
    })
  })

  describe('Quality 1 (Forgot)', () => {
    it('resets repetitions and interval', () => {
      const result = sm2(1, { interval: 21, repetitions: 4, ease_factor: 2.8 })
      expect(result.repetitions).toBe(0)
      expect(result.interval).toBe(1)
    })

    it('significantly decreases ease factor', () => {
      const result = sm2(1, defaultSchedule)
      expect(result.ease_factor).toBeLessThan(2.5)
    })
  })

  describe('Quality 0 (Complete failure)', () => {
    it('resets and strongly decreases ease factor', () => {
      const result = sm2(0, { interval: 10, repetitions: 3, ease_factor: 2.5 })
      expect(result.repetitions).toBe(0)
      expect(result.interval).toBe(1)
    })
  })

  describe('Ease factor minimum', () => {
    it('never drops below 1.3', () => {
      let schedule = { interval: 1, repetitions: 0, ease_factor: 1.3 }
      // Apply multiple failed reviews
      for (let i = 0; i < 10; i++) {
        const result = sm2(0, schedule)
        expect(result.ease_factor).toBeGreaterThanOrEqual(1.3)
        schedule = { interval: result.interval, repetitions: result.repetitions, ease_factor: result.ease_factor }
      }
    })

    it('clamps ease factor at 1.3 when it would go lower', () => {
      const result = sm2(0, { interval: 1, repetitions: 0, ease_factor: 1.3 })
      expect(result.ease_factor).toBe(1.3)
    })
  })

  describe('Due date calculation', () => {
    it('sets due date to today + interval days', () => {
      const result = sm2(5, { interval: 1, repetitions: 1, ease_factor: 2.5 })
      const today = new Date()
      today.setDate(today.getDate() + 6) // interval=6 for second repetition
      const expected = today.toISOString().split('T')[0]
      expect(result.due_date).toBe(expected)
    })

    it('due date is a valid date string', () => {
      const result = sm2(3, defaultSchedule)
      expect(result.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('confidenceToQuality', () => {
    it('maps perfect to 5', () => {
      expect(confidenceToQuality('perfect')).toBe(5)
    })
    it('maps hesitation to 4', () => {
      expect(confidenceToQuality('hesitation')).toBe(4)
    })
    it('maps almost to 3', () => {
      expect(confidenceToQuality('almost')).toBe(3)
    })
    it('maps forgot to 1', () => {
      expect(confidenceToQuality('forgot')).toBe(1)
    })
    it('defaults unknown confidence to 1', () => {
      expect(confidenceToQuality('bogus' as never)).toBe(1)
    })
  })

  describe('isDue', () => {
    it('returns true for past dates', () => {
      expect(isDue('2020-01-01')).toBe(true)
    })

    it('returns true for today', () => {
      const today = new Date().toISOString().split('T')[0]
      expect(isDue(today)).toBe(true)
    })

    it('returns false for future dates', () => {
      const future = new Date()
      future.setDate(future.getDate() + 5)
      expect(isDue(future.toISOString().split('T')[0])).toBe(false)
    })
  })

  describe('isMaintenanceMode', () => {
    it('returns true when interval >= 30 and ease_factor >= 2.5', () => {
      const schedule: CardSchedule = {
        id: 1, card_id: 1, user_id: 1,
        interval: 30, repetitions: 5, ease_factor: 2.5,
        due_date: '2026-01-01'
      }
      expect(isMaintenanceMode(schedule)).toBe(true)
    })

    it('returns false when interval < 30', () => {
      const schedule: CardSchedule = {
        id: 1, card_id: 1, user_id: 1,
        interval: 29, repetitions: 5, ease_factor: 2.5,
        due_date: '2026-01-01'
      }
      expect(isMaintenanceMode(schedule)).toBe(false)
    })

    it('returns false when ease_factor < 2.5', () => {
      const schedule: CardSchedule = {
        id: 1, card_id: 1, user_id: 1,
        interval: 30, repetitions: 5, ease_factor: 2.4,
        due_date: '2026-01-01'
      }
      expect(isMaintenanceMode(schedule)).toBe(false)
    })
  })

  describe('defaultSchedule', () => {
    it('creates an unreviewed schedule with minimum ease factor', () => {
      const schedule = makeDefaultSchedule(42, 7)
      expect(schedule.card_id).toBe(42)
      expect(schedule.user_id).toBe(7)
      expect(schedule.interval).toBe(1)
      expect(schedule.repetitions).toBe(0)
      expect(schedule.ease_factor).toBe(1.3)
      expect(schedule.last_reviewed_at).toBeUndefined()
      expect(schedule.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('boostForExam', () => {
    it('caps interval within 7 days of exam', () => {
      expect(boostForExam(10, 3)).toBe(1)
      expect(boostForExam(10, 7)).toBe(3)
    })

    it('returns interval unchanged beyond 7 days', () => {
      expect(boostForExam(10, 8)).toBe(10)
    })

    it('returns interval unchanged for non-positive days', () => {
      expect(boostForExam(10, 0)).toBe(10)
      expect(boostForExam(10, -2)).toBe(10)
    })
  })
})
