import { deriveConceptLearningState } from '../../src/lib/learningState'

const base = { conceptId: 10, conceptLabel: 'Opportunity cost', now: new Date('2026-10-12T12:00:00Z') }

describe('deriveConceptLearningState', () => {
  it('keeps introduction separate from proficiency', () => {
    const state = deriveConceptLearningState({ ...base, introducedAt: '2026-10-10T12:00:00Z', assessments: [] })
    expect(state.coverage).toBe('introduced')
    expect(state.proficiency).toBe('not_assessed')
    expect(state.review).toBe('no_retention_evidence')
  })

  it('does not call one correct independent response demonstrated', () => {
    const state = deriveConceptLearningState({ ...base, assessments: [
      { id: 1, outcome: 'correct', score: 1, occurredAt: '2026-10-11T12:00:00Z', questionKey: 'q1' }
    ] })
    expect(state.coverage).toBe('practised')
    expect(state.proficiency).toBe('developing')
    expect(state.confidence).toBe('limited_evidence')
  })

  it('requires distinct questions and a day gap for demonstrated proficiency', () => {
    const state = deriveConceptLearningState({ ...base, assessments: [
      { id: 1, outcome: 'correct', score: 1, occurredAt: '2026-10-10T10:00:00Z', questionKey: 'q1' },
      { id: 2, outcome: 'correct', score: 1, occurredAt: '2026-10-10T11:00:00Z', questionKey: 'q1' },
      { id: 3, outcome: 'correct', score: 1, occurredAt: '2026-10-11T10:00:00Z', questionKey: 'q2' }
    ] })
    expect(state.counts.assessments).toBe(2)
    expect(state.proficiency).toBe('demonstrated')
  })

  it('does not count assisted correct answers as independent mastery evidence', () => {
    const state = deriveConceptLearningState({ ...base, assessments: [
      { id: 1, outcome: 'correct', score: 1, assistanceLevel: 'worked_example', occurredAt: '2026-10-11T12:00:00Z' }
    ] })
    expect(state.counts.assistedCorrect).toBe(1)
    expect(state.counts.independentCorrect).toBe(0)
    expect(state.proficiency).toBe('developing')
  })

  it('keeps recent incorrect performance in needs-work state and flags review timing', () => {
    const state = deriveConceptLearningState({ ...base, assessments: [
      { id: 1, outcome: 'incorrect', score: 0, occurredAt: '2026-09-20T12:00:00Z', misconception: 'Confuses cost with price' }
    ] })
    expect(state.proficiency).toBe('needs_work')
    expect(state.review).toBe('review_overdue')
    expect(state.misconceptions).toEqual(['Confuses cost with price'])
  })

  it('requires transfer evidence before strong evidence', () => {
    const assessments = [
      { id: 1, outcome: 'correct' as const, score: 1, occurredAt: '2026-10-01T12:00:00Z', questionKey: 'a' },
      { id: 2, outcome: 'correct' as const, score: 1, occurredAt: '2026-10-03T12:00:00Z', questionKey: 'b' },
      { id: 3, outcome: 'correct' as const, score: 1, occurredAt: '2026-10-04T12:00:00Z', questionKey: 'c', taskType: 'transfer' }
    ]
    const state = deriveConceptLearningState({ ...base, assessments })
    expect(state.proficiency).toBe('strong_evidence')
    expect(state.confidence).toBe('strong_evidence')
  })
})
