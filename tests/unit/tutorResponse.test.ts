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

  it('recognizes questions formatted with markdown bold, italics, or quotes', () => {
    expect(hasFinalActiveRecallQuestion('Active recall: **What is the opportunity cost?**')).toBe(true)
    expect(hasFinalActiveRecallQuestion('Active recall: *Why does the curve shift right?*')).toBe(true)
    expect(hasFinalActiveRecallQuestion('Active recall: "How would you define inflation?"')).toBe(true)
  })

  it('recognizes questions followed by parenthetical notes or guidance', () => {
    expect(hasFinalActiveRecallQuestion('Active recall: What is the opportunity cost? (Explain in your own words.)')).toBe(true)
    expect(hasFinalActiveRecallQuestion('Active recall: What is the law of demand? Take a moment to think.')).toBe(true)
  })

  it('recognizes explicit active recall headings with retrieval tasks', () => {
    expect(hasFinalActiveRecallQuestion('**Active Recall:** Describe the mechanism behind photosynthesis.')).toBe(true)
    expect(hasFinalActiveRecallQuestion('### Active Recall\nExplain how price elasticity affects revenue.')).toBe(true)
  })

  it('appends a guaranteed active recall question when fallbackConcept is provided', () => {
    const draft = 'Opportunity cost is the value of the next best alternative forgone.'
    const result = chooseFinalTutorResponse(draft, null, 'Opportunity Cost')
    expect(result).not.toBeNull()
    expect(result).toContain(draft)
    expect(result).toContain('Opportunity Cost')
    expect(hasFinalActiveRecallQuestion(result!)).toBe(true)
  })

  it('handles general fallback concept gracefully', () => {
    const draft = 'Here is the explanation.'
    const result = chooseFinalTutorResponse(draft, null, 'General')
    expect(result).not.toBeNull()
    expect(result).toContain('this concept')
    expect(hasFinalActiveRecallQuestion(result!)).toBe(true)
  })
})

