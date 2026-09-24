import {
  calculateExamReadiness,
  generateCramOptimizationPlan,
  predictCardRetrievabilityAtDate,
  daysBetweenDates,
  type CardWithSchedule
} from '../../src/lib/readinessEngine'

describe('Exam Readiness Predictor & Cram Optimizer', () => {
  describe('daysBetweenDates & predictCardRetrievabilityAtDate', () => {
    it('calculates days between two ISO dates', () => {
      expect(daysBetweenDates('2026-05-01', '2026-05-10')).toBe(9)
      expect(daysBetweenDates('2026-05-10', '2026-05-01')).toBe(-9)
      expect(daysBetweenDates('2026-05-01', '2026-05-01')).toBe(0)
    })

    it('returns baseline retention for unreviewed cards', () => {
      const card: CardWithSchedule = {
        id: 1,
        subject_id: 10,
        type: 'flashcard',
        front: 'Front',
        back: 'Back',
        is_manual: 0,
        created_at: '2026-05-01'
      }
      expect(predictCardRetrievabilityAtDate(card, '2026-05-10')).toBe(0.25)
    })

    it('decays retrievability as exam date moves further into future', () => {
      const card: CardWithSchedule = {
        id: 1,
        subject_id: 10,
        type: 'flashcard',
        front: 'Front',
        back: 'Back',
        is_manual: 0,
        created_at: '2026-05-01',
        stability: 10,
        last_reviewed_at: '2026-05-01'
      }
      const rNear = predictCardRetrievabilityAtDate(card, '2026-05-05')
      const rFar = predictCardRetrievabilityAtDate(card, '2026-05-30')
      expect(rNear).toBeGreaterThan(rFar)
      expect(rFar).toBeGreaterThan(0)
    })
  })

  describe('calculateExamReadiness', () => {
    it('calculates readiness score for mastered subject', () => {
      const cards: CardWithSchedule[] = [
        {
          id: 1,
          subject_id: 1,
          type: 'flashcard',
          front: 'Q1',
          back: 'A1',
          is_manual: 0,
          created_at: '2026-05-01',
          stability: 40,
          interval: 40,
          last_reviewed_at: '2026-05-01',
          concept: 'Cell Biology'
        },
        {
          id: 2,
          subject_id: 1,
          type: 'flashcard',
          front: 'Q2',
          back: 'A2',
          is_manual: 0,
          created_at: '2026-05-01',
          stability: 50,
          interval: 50,
          last_reviewed_at: '2026-05-01',
          concept: 'Cell Biology'
        }
      ]

      const res = calculateExamReadiness({
        subjectId: 1,
        examDateISO: '2026-05-05',
        nowISO: '2026-05-01',
        cards,
        concepts: [{ id: 1, user_id: 1, subject_id: 1, concept: 'Cell Biology', mastery_prob: 0.95, observations: 10, updated_at: '2026-05-01' }]
      })

      expect(res.projectedScore).toBeGreaterThanOrEqual(85)
      expect(res.tier).toBe('ready')
      expect(res.daysRemaining).toBe(4)
      expect(res.weakTopics.length).toBe(0)
    })

    it('flags weak topics and drops score when cards have low stability and missing coverage', () => {
      const cards: CardWithSchedule[] = [
        {
          id: 1,
          subject_id: 1,
          type: 'flashcard',
          front: 'Q1',
          back: 'A1',
          is_manual: 0,
          created_at: '2026-05-01',
          stability: 1,
          interval: 1,
          last_reviewed_at: '2026-04-01', // reviewed a month ago
          concept: 'Krebs Cycle'
        }
      ]

      const modules = [
        {
          id: 1,
          subject_id: 1,
          title: 'Metabolism',
          status: 'in_progress' as const,
          hours_estimated: 5,
          sort_order: 1,
          created_at: '2026-05-01',
          topics: [
            { id: 101, module_id: 1, title: 'Krebs Cycle', hours_estimated: 2, sort_order: 1, is_completed: 0, mastery_target: 80, created_at: '2026-05-01' },
            { id: 102, module_id: 1, title: 'Glycolysis', hours_estimated: 3, sort_order: 2, is_completed: 0, mastery_target: 80, created_at: '2026-05-01' } // gap topic (no cards)
          ]
        }
      ]

      const res = calculateExamReadiness({
        subjectId: 1,
        examDateISO: '2026-05-20',
        nowISO: '2026-05-01',
        cards,
        modules
      })

      expect(res.projectedScore).toBeLessThan(60)
      expect(res.tier === 'borderline' || res.tier === 'critical').toBe(true)
      expect(res.coveragePercent).toBe(50) // 1 of 2 topics covered
      expect(res.weakTopics.length).toBeGreaterThan(0)
    })
  })

  describe('generateCramOptimizationPlan', () => {
    it('allocates study time and boosts projected grade', () => {
      const cards: CardWithSchedule[] = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        subject_id: 1,
        type: 'flashcard',
        front: `Q${i + 1}`,
        back: `A${i + 1}`,
        is_manual: 0,
        created_at: '2026-05-01',
        stability: 3,
        last_reviewed_at: '2026-04-20',
        concept: i % 2 === 0 ? 'Genetics' : 'Microbiology'
      }))

      const readiness = calculateExamReadiness({
        subjectId: 1,
        examDateISO: '2026-05-06',
        nowISO: '2026-05-01',
        cards
      })

      const plan = generateCramOptimizationPlan({
        readiness,
        cards,
        dailyMinutes: 45,
        nowISO: '2026-05-01'
      })

      expect(plan.daysCount).toBe(5)
      expect(plan.dailyPlan.length).toBe(5)
      expect(plan.projectedBoostedScore).toBeGreaterThan(plan.currentScore)
      expect(plan.scoreDelta).toBeGreaterThan(0)
      expect(plan.dailyPlan[0].cardIds.length).toBeGreaterThan(0)
      expect(plan.dailyPlan[0].focusTitle).toContain('Day 1')
    })
  })
})
