import { duplicateRate, evaluateGroundedResponse } from '../../src/lib/aiEvaluation'

describe('AI evaluation fixtures', () => {
  it('flags unsupported non-abstaining answers', () => {
    const result = evaluateGroundedResponse({ answer: 'The answer is 42.', evidence: [], expectedTerms: ['42'], abstained: false })
    expect(result.unsupportedClaimRate).toBe(1)
    expect(result.correctAbstention).toBe(false)
  })

  it('measures duplicate generated items deterministically', () => {
    expect(duplicateRate(['A', 'a', 'B'])).toBeCloseTo(1 / 3)
  })
})
