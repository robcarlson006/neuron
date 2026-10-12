import {
  buildTutorRepairPrompt,
  chooseFinalTutorResponse,
  countTutorWords,
  hasFinalActiveRecallQuestion,
  isDocumentIdentifier,
  sanitizeConceptName,
  validateTutorResponse,
} from '../../src/lib/tutorResponse'

describe('tutor response finalization', () => {
  it('uses the repaired response as one canonical response', () => {
    const draft = 'The explanation is useful, but it stops before the question.'
    const repaired = 'The explanation is useful and connects the key idea to a practical example.\n\nActive recall: Explain the mechanism in your own words?'

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
    expect(result).toMatch(/opportunity cost/i)
    expect(hasFinalActiveRecallQuestion(result!)).toBe(true)
  })

  it('handles general fallback concept gracefully', () => {
    const draft = 'Here is the explanation.'
    const result = chooseFinalTutorResponse(draft, null, 'General')
    expect(result).not.toBeNull()
    expect(result).toContain('this topic')
    expect(hasFinalActiveRecallQuestion(result!)).toBe(true)
  })

  it('recognizes and sanitizes document labels instead of treating them as concepts', () => {
    expect(isDocumentIdentifier('Material: Chapter 3 Microeconomics.pdf')).toBe(true)
    expect(isDocumentIdentifier('notes.pdf')).toBe(true)
    expect(isDocumentIdentifier('weak preference')).toBe(false)
    expect(sanitizeConceptName('Material: Chapter 3 Microeconomics.pdf')).toBe('this topic')
    expect(sanitizeConceptName('notes.pdf')).toBe('this topic')
  })

  it('never generates a generic question about a material filename', () => {
    const draft = 'The document contains the relevant material for this lesson.'
    const result = chooseFinalTutorResponse(draft, null, 'Material: Chapter 3 Microeconomics.pdf')!
    expect(result).not.toMatch(/what is the key idea behind material:/i)
    expect(result).not.toMatch(/what is this (?:pdf|document) about/i)
    expect(result).not.toMatch(/key idea behind (?:this )?pdf/i)
    expect(result).toContain('this topic')
    expect(result).not.toContain('Chapter 3 Microeconomics')
  })

  it('preserves transitivity and cyclic preference explanations over generic document questions', () => {
    const transitivity = 'Transitivity means that if a person prefers A to B and B to C, they should prefer A to C. This property makes a ranking consistent across alternatives. What is this PDF about?'
    const result = chooseFinalTutorResponse(transitivity, null, 'Material: Chapter 3 Microeconomics.pdf')!
    expect(result).toContain('Transitivity means')
    expect(result).toContain('ranking consistent')
    expect(result).toContain('How does transitivity help you compare a chain of preferences?')
    expect(result).not.toMatch(/what is this pdf about/i)

    const cyclic = 'Cyclic preferences occur when A is preferred to B, B to C, and C back to A. The pairwise choices form a loop rather than a consistent ranking. What is the key idea behind Material: Chapter 3 Microeconomics.pdf?'
    const cyclicResult = chooseFinalTutorResponse(cyclic, null, 'Material: Chapter 3 Microeconomics.pdf')!
    expect(cyclicResult).toContain('Cyclic preferences occur')
    expect(cyclicResult).toContain('pairwise choices form a loop')
    expect(cyclicResult).toContain('How can cyclic preferences create a loop in pairwise choices?')
    expect(cyclicResult).not.toMatch(/key idea behind material:/i)
  })

  it('counts natural language while excluding tags, code, and LaTeX', () => {
    expect(countTutorWords('[CONCEPT:x] Supply changes when price changes. $x^2 + y^2 = z^2$ ```json {"a": 1}``` [TOPIC:math]')).toBe(5)
  })

  it('rejects responses over the hard word limit', () => {
    const response = `${'A useful explanation '.repeat(60)}What is the main idea?`
    expect(validateTutorResponse(response).issues).toContain('EXCEEDS_LENGTH')
  })

  it('accepts punchy feedback with one valid retrieval question', () => {
    const response = 'Correct. £24 is right. Now, what if the shift also offered valuable training?'
    expect(validateTutorResponse(response).isValid).toBe(true)
  })

  it('allows complex derivations up to 140 words and flags unclosed LaTeX', () => {
    const derivation = `${'Using the chain rule, differentiate each term and simplify the resulting expression. '.repeat(10)} Active recall: How does the derivative change? $$f(x)=x^2$$`
    expect(countTutorWords(derivation)).toBeLessThanOrEqual(140)
    expect(validateTutorResponse(derivation, { hasEquations: true }).isValid).toBe(true)
    expect(validateTutorResponse('Differentiate the expression $x^2 and explain the result?').issues).toContain('MALFORMED_LATEX')
  })

  it('rejects multiple questions and answer spoilers', () => {
    const multiple = 'A short explanation provides context. What is supply? And why does it change?'
    expect(validateTutorResponse(multiple).issues).toContain('MULTIPLE_QUESTIONS')
    const spoiler = 'Opportunity cost helps compare choices. What is opportunity cost, which is the value of the next best alternative?'
    expect(validateTutorResponse(spoiler).issues).toContain('ANSWER_SPOILER')
  })

  it('accepts a concise response with exactly one active recall question', () => {
    const response = 'Opportunity cost is the value of the next best option you give up when choosing something else. It helps compare tradeoffs by showing what a decision prevents you from doing. Active recall: How would you identify the opportunity cost in a real choice?'
    const result = validateTutorResponse(response)
    expect(result.isValid).toBe(true)
    expect(result.wordCount).toBeGreaterThanOrEqual(35)
    expect(result.wordCount).toBeLessThanOrEqual(80)
    expect(result.questionCount).toBe(1)
  })

  it('replaces an oversized draft with a clean concise fallback', () => {
    const draft = `${'A long lecture sentence. '.repeat(200)}What do you think?`
    const result = chooseFinalTutorResponse(draft, null, 'Opportunity Cost')!
    expect(result).not.toContain(draft)
    expect(countTutorWords(result)).toBeLessThanOrEqual(110)
    expect(hasFinalActiveRecallQuestion(result)).toBe(true)
  })

  it('preserves equations, topic context, and the draft question when an oversized draft cannot be repaired', () => {
    const draft = `For compound interest, the balance grows by applying the rate to the current amount. ${'This means growth accelerates over time. '.repeat(30)}The model is $A=P(1+r)^t$. How does compounding change growth over time?`
    const result = chooseFinalTutorResponse(draft, null, 'compound interest')!
    expect(result).toContain('compound interest')
    expect(result).toContain('$A=P(1+r)^t$')
    expect(result).toContain('How does compounding change growth over time?')
    expect(result).not.toContain('central mechanism')
  })

  it('prefers a valid repair and describes failures in its repair prompt', () => {
    const repaired = 'Inflation reduces purchasing power when prices rise faster than income. This changes what households can afford over time. Active recall: How does inflation affect purchasing power?'
    expect(chooseFinalTutorResponse('No question here.', repaired)).toBe(repaired)
    const validation = validateTutorResponse(`${'Too much detail. '.repeat(40)}What is the point?`)
    expect(buildTutorRepairPrompt('draft', validation)).toContain('Too long')
    expect(buildTutorRepairPrompt('draft', validation)).toContain('exactly ONE active-recall question')
    expect(buildTutorRepairPrompt('draft', validation)).toContain('Do NOT substitute generic filler or boilerplate questions')
  })
})
