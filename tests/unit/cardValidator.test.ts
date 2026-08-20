import {
  validateCardQuality,
  isSelfContained,
  detectCompoundAnswer,
  checkMinimumInformationPrinciple
} from '../../src/lib/cardValidator'

describe('validateCardQuality', () => {
  it('rejects empty front', () => {
    const result = validateCardQuality({ front: '', back: 'Some answer' })
    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Card front is empty')
  })

  it('rejects empty back', () => {
    const result = validateCardQuality({ front: 'Question?', back: '' })
    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Card back is empty')
  })

  it('accepts a valid simple card', () => {
    const result = validateCardQuality({ front: 'What is 2+2?', back: 'The answer is four' })
    expect(result.valid).toBe(true)
    expect(result.cards).toHaveLength(1)
  })

  it('flags vague self-references', () => {
    const result = validateCardQuality({ front: 'As discussed above, what is X?', back: 'A long enough answer here' })
    expect(result.issues.some((i) => i.includes('vague reference'))).toBe(true)
  })

  it('splits compound answers with 3+ numbered items', () => {
    const result = validateCardQuality({
      front: 'What are the first three Greek letters?',
      back: '1. Alpha\n2. Bravo\n3. Gamma'
    })
    expect(result.valid).toBe(true)
    expect(result.cards.length).toBe(3)
  })

  it('flags non-question fronts', () => {
    const result = validateCardQuality({ front: 'just a phrase', back: 'A sufficiently detailed answer here' })
    expect(result.issues.some((i) => i.includes('question format'))).toBe(true)
  })

  it('flags too-short backs', () => {
    const result = validateCardQuality({ front: 'What is X?', back: 'short' })
    expect(result.issues.some((i) => i.includes('too short'))).toBe(true)
  })

  it('normalizes type to flashcard when unrecognized', () => {
    const result = validateCardQuality({ front: 'What is X?', back: 'A sufficiently detailed answer', type: 'unknown' })
    expect(result.cards[0].type).toBe('flashcard')
  })
})

describe('isSelfContained', () => {
  it('detects vague references', () => {
    expect(isSelfContained('as discussed above')).toBe(false)
    expect(isSelfContained('in this context')).toBe(false)
    expect(isSelfContained('as mentioned previously')).toBe(false)
  })

  it('accepts self-contained text', () => {
    expect(isSelfContained('The capital of France is Paris')).toBe(true)
  })
})

describe('detectCompoundAnswer', () => {
  it('detects numbered lists of 3+', () => {
    const items = detectCompoundAnswer('1. Alpha\n2. Bravo\n3. Gamma')
    expect(items).toEqual(['Alpha', 'Bravo', 'Gamma'])
  })

  it('detects bulleted lists', () => {
    const items = detectCompoundAnswer('* Alpha\n* Bravo\n* Gamma')
    expect(items).toHaveLength(3)
  })

  it('returns empty for fewer than 3 items', () => {
    expect(detectCompoundAnswer('1. Alpha\n2. Bravo')).toEqual([])
  })

  it('returns empty for plain text', () => {
    expect(detectCompoundAnswer('Just a single answer')).toEqual([])
  })
})

describe('checkMinimumInformationPrinciple', () => {
  it('fails when back has a 3+ item list', () => {
    const result = checkMinimumInformationPrinciple('Question?', '1. Alpha\n2. Bravo\n3. Charlie')
    expect(result.passes).toBe(false)
  })

  it('flags multiple questions in front', () => {
    const result = checkMinimumInformationPrinciple('What is X? What is Y?', 'An answer long enough here')
    expect(result.issues.some((i) => i.includes('multiple questions'))).toBe(true)
  })

  it('passes a simple single-concept card', () => {
    const result = checkMinimumInformationPrinciple('What is X?', 'A single answer')
    expect(result.passes).toBe(true)
  })
})
