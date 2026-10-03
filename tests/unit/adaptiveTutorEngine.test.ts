import {
  decideAdaptiveDifficulty,
  defaultAdaptiveState,
  initialAdaptiveScore,
  levelForScore,
  updateAdaptiveState
} from '../../src/lib/adaptiveTutorEngine'

describe('adaptiveTutorEngine', () => {
  it('starts conservatively for an unknown learner and lower for never-studied content', () => {
    expect(initialAdaptiveScore({ masteryProb: 0.3, retention: 0.3 })).toBeGreaterThan(20)
    expect(initialAdaptiveScore({ masteryProb: 0.3, retention: 0.3, neverStudied: true })).toBeLessThanOrEqual(25)
  })

  it('updates challenge evidence conservatively and discounts assistance', () => {
    const state = defaultAdaptiveState(1, 2, 'elasticity')
    const assisted = updateAdaptiveState(state, { outcome: 'correct', confidence: 1, assistanceLevel: 'worked_example' })
    const independent = updateAdaptiveState(state, { outcome: 'correct', confidence: 1, assistanceLevel: 'none' })
    expect(assisted.score).toBeLessThan(independent.score)
    expect(independent.observations).toBe(1)
    expect(updateAdaptiveState(state, { outcome: 'unassessed' }).score).toBe(state.score)
  })

  it('uses retention and misconceptions to choose retrieval or remediation', () => {
    const state = defaultAdaptiveState(1, 2, 'concept')
    expect(decideAdaptiveDifficulty({ concept: 'concept', mode: 'adaptive', state, retention: 0.2, due: true }).action).toBe('interleaved_review')
    expect(decideAdaptiveDifficulty({ concept: 'concept', mode: 'adaptive', state, misconceptionRisk: 0.8 }).action).toBe('hint_scaffold')
  })

  it('keeps manual levels fixed and applies hysteresis', () => {
    expect(decideAdaptiveDifficulty({ concept: 'x', mode: 'fixed', fixedLevel: 1, neverStudied: true }).visibleLevel).toBe(1)
    expect(levelForScore(41, 3)).toBe(3)
    expect(levelForScore(66, 3)).toBe(4)
    expect(levelForScore(64, 4)).toBe(4)
  })
})
