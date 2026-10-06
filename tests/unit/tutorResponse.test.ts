import { chooseFinalTutorResponse, hasFinalActiveRecallQuestion } from '../../src/lib/tutorResponse'

describe('tutor response finalization', () => {
  it('uses the repaired response as one canonical response', () => {
    const draft = 'The explanation is useful, but it stops before the question.'
    const repaired = 'The explanation is useful.\n\nActive recall: Explain the mechanism in your own words?'

    expect(chooseFinalTutorResponse(draft, repaired)).toBe(repaired)
    expect(chooseFinalTutorResponse(draft, repaired)).not.toContain(`${draft}\n\n`)
  })

  it('requires the final response to end with a question', () => {
    expect(hasFinalActiveRecallQuestion('Active recall: What changes and why?')).toBe(true)
    expect(hasFinalActiveRecallQuestion('This response has no question.')).toBe(false)
    expect(chooseFinalTutorResponse('This response has no question.', null)).toBeNull()
  })
})
