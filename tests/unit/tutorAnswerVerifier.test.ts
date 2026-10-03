import { verifyTutorAnswer } from '../../src/lib/tutorAnswerVerifier'

describe('Tutor answer verification', () => {
  const evidence = [{ materialId: 2, chunkIndex: 5, sourceLabel: 'Lecture 1', text: 'A claim', score: 0.9 }]

  it('accepts citations that refer to selected evidence', () => {
    const result = verifyTutorAnswer('The claim follows from [SOURCE 2:5].', evidence)
    expect(result.grounded).toBe(true)
    expect(result.invalidCitations).toHaveLength(0)
    expect(result.needsAbstention).toBe(false)
  })

  it('flags citations that were not retrieved', () => {
    const result = verifyTutorAnswer('The answer is [SOURCE 9:1].', evidence)
    expect(result.grounded).toBe(false)
    expect(result.needsAbstention).toBe(true)
    expect(result.invalidCitations).toEqual([{ materialId: 9, chunkIndex: 1 }])
  })

  it('recognizes an explicit evidence-limited response', () => {
    const result = verifyTutorAnswer('I do not have enough evidence in the supplied material to answer that.', evidence)
    expect(result.grounded).toBe(true)
    expect(result.needsAbstention).toBe(false)
  })
})
