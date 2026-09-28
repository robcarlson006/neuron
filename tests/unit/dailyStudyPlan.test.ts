import { buildDailyStudyPlan, DEFAULT_DAILY_STUDY_LIMITS } from '../../src/lib/dailyStudyPlan'

const card = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  subject_id: id % 2,
  due_date: '2026-09-28',
  repetitions: 2,
  interval: 3,
  stability: 3,
  difficulty: 6,
  lapses: 0,
  ...overrides
})

describe('buildDailyStudyPlan', () => {
  it('caps the daily workload and keeps new cards within their smaller allowance', () => {
    const cards = [
      ...Array.from({ length: 20 }, (_, i) => card(i + 1)),
      ...Array.from({ length: 10 }, (_, i) => card(i + 30, { repetitions: 0, state: 0 }))
    ]
    const plan = buildDailyStudyPlan(cards, '2026-09-28', { maxCardsPerDay: 8, maxNewCardsPerDay: 2 })

    expect(plan.cards).toHaveLength(8)
    expect(plan.newCards).toHaveLength(0) // reviews fill the budget first
    expect(plan.deferredDue).toHaveLength(22)
  })

  it('uses the new-card allowance after reviews and interleaves subjects', () => {
    const cards = [
      card(1, { subject_id: 1 }),
      card(2, { subject_id: 2 }),
      card(3, { subject_id: 1, repetitions: 0, state: 0 }),
      card(4, { subject_id: 2, repetitions: 0, state: 0 })
    ]
    const plan = buildDailyStudyPlan(cards, '2026-09-28', { maxCardsPerDay: 4, maxNewCardsPerDay: 2 })

    expect(plan.cards.map(c => c.subject_id)).toEqual([1, 2, 1, 2])
    expect(plan.newCards).toHaveLength(2)
    expect(plan.isLimitReached).toBe(false)
  })

  it('does not repeat cards already reviewed today', () => {
    const cards = [card(1), card(2), card(3)]
    const plan = buildDailyStudyPlan(cards, '2026-09-28', DEFAULT_DAILY_STUDY_LIMITS, new Set([1, 2]))

    expect(plan.cards.map(c => c.id)).toEqual([3])
  })

  it('prioritizes overdue and lapsed reviews', () => {
    const cards = [
      card(1, { due_date: '2026-09-28' }),
      card(2, { due_date: '2026-09-20' }),
      card(3, { due_date: '2026-09-28', lapses: 2 })
    ]
    const plan = buildDailyStudyPlan(cards, '2026-09-28', { maxCardsPerDay: 2, maxNewCardsPerDay: 0 })

    expect(plan.cards.map(c => c.id)).toEqual([2, 3])
  })
})
