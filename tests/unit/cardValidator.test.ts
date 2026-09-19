import {
  validateCardQuality,
  isSelfContained,
  detectCompoundAnswer,
  checkMinimumInformationPrinciple,
  isBinaryPrompt,
  isSpoilerPrompt,
  isEnumerationPrompt,
  isDenseCardBack,
  evaluateMatuschakCriteria
} from '../../src/lib/cardValidator'

describe('validateCardQuality & Psychometric Retrieval Rules', () => {
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

  it('accepts a valid atomic card with high quality score', () => {
    const result = validateCardQuality({
      front: '[Biochemistry] What is the rate-limiting enzyme in hepatic ketogenesis?',
      back: 'Mitochondrial HMG-CoA synthase.'
    })
    expect(result.valid).toBe(true)
    expect(result.cards).toHaveLength(1)
    expect(result.quality_score).toBeGreaterThanOrEqual(0.85)
  })

  it('accepts concise atomic one-word answers without penalty', () => {
    const result = validateCardQuality({
      front: '[Cardiology] Which cardiac valve separates the right atrium from the right ventricle?',
      back: 'Tricuspid valve'
    })
    expect(result.valid).toBe(true)
    expect(result.cards[0].back).toBe('Tricuspid valve')
    expect(result.issues).not.toContain('Back is too short')
  })

  it('flags vague self-references', () => {
    const result = validateCardQuality({ front: 'As discussed above, what is X?', back: 'Valid answer here' })
    expect(result.issues.some((i) => i.includes('vague reference'))).toBe(true)
    expect(result.anti_patterns_detected).toContain('Vague Reference in Front')
  })

  it('detects binary (Yes/No, True/False) prompts', () => {
    const result = validateCardQuality({
      front: 'Does increasing substrate concentration overcome non-competitive inhibition? (Yes/No)',
      back: 'No'
    })
    expect(result.issues.some((i) => i.includes('Binary question'))).toBe(true)
    expect(result.anti_patterns_detected).toContain('Binary Framing')
  })

  it('detects enumeration prompts', () => {
    const result = validateCardQuality({
      front: 'List the 5 primary stages of prophase I.',
      back: 'Leptotene, zygotene, pachytene, diplotene, diakinesis'
    })
    expect(result.issues.some((i) => i.includes('Enumeration prompt'))).toBe(true)
  })

  it('detects dense card backs (Paragraph Trap)', () => {
    const denseBack = 'Carvedilol, Metoprolol Succinate, and Bisoprolol. They have a proven mortality benefit in HFrEF. They must start at low doses because they can cause temporary decompensation. They decrease sympathetic overactivation and prevent remodeling by blocking beta receptors.'
    const result = validateCardQuality({
      front: 'What are beta-blockers in heart failure?',
      back: denseBack
    })
    expect(result.issues.some((i) => i.includes('Dense card back'))).toBe(true)
    expect(result.anti_patterns_detected).toContain('Dense Card Back')
  })

  it('auto-decomposes spoiler prompts into association and mechanism cards', () => {
    const result = validateCardQuality({
      front: 'Why does mutation X cause severe cardiomyopathy?',
      back: 'Mutation X causes truncation of the myosin heavy chain, destabilizing the sarcomere.'
    })
    expect(result.valid).toBe(true)
    expect(result.cards).toHaveLength(2)
    // First card tests association
    expect(result.cards[0].front).toContain('What condition or effect is produced by mutation X')
    expect(result.cards[0].back).toBe('severe cardiomyopathy')
    // Second card tests mechanism
    expect(result.cards[1].front).toContain('By what mechanism does mutation X produce severe cardiomyopathy')
    expect(result.cards[1].type).toBe('active_recall')
  })

  it('splits compound answers with multiple items into atomic cards without leaking answers', () => {
    const result = validateCardQuality({
      front: 'What are the first three Greek letters?',
      back: '1. Alpha\n2. Beta\n3. Gamma'
    })
    expect(result.valid).toBe(true)
    expect(result.cards.length).toBe(3)
    for (const card of result.cards) {
      expect(card.front.toLowerCase()).not.toContain(card.back.toLowerCase())
    }
  })

  it('normalizes type to flashcard when unrecognized', () => {
    const result = validateCardQuality({ front: 'What is X?', back: 'A concise answer', type: 'unknown' })
    expect(result.cards[0].type).toBe('flashcard')
  })
})

describe('Psychometric Utility Functions', () => {
  it('isBinaryPrompt identifies binary framing', () => {
    expect(isBinaryPrompt('Is mitochondria the powerhouse of the cell? (Yes/No)')).toBe(true)
    expect(isBinaryPrompt('Does enzyme X require ATP?')).toBe(true)
    expect(isBinaryPrompt('Can glycolysis proceed anaerobically? (True/False)')).toBe(true)
    expect(isBinaryPrompt('What enzyme regulates glycolysis?')).toBe(false)
  })

  it('isSpoilerPrompt identifies spoiler questions and extracts components', () => {
    const check = isSpoilerPrompt('Why does factor X cause condition Y?')
    expect(check.isSpoiler).toBe(true)
    expect(check.factor).toBe('factor X')
    expect(check.consequence).toBe('condition Y')

    const check2 = isSpoilerPrompt('How does insulin cause glucose uptake in myocytes?')
    expect(check2.isSpoiler).toBe(true)
    expect(check2.factor).toBe('insulin')
    expect(check2.consequence).toBe('glucose uptake in myocytes')

    const check3 = isSpoilerPrompt('What is the role of insulin in myocytes?')
    expect(check3.isSpoiler).toBe(false)
  })

  it('isEnumerationPrompt detects unranked set prompts', () => {
    expect(isEnumerationPrompt('List the 5 primary risk factors for stroke.')).toBe(true)
    expect(isEnumerationPrompt('What are the 4 stages of mitosis?')).toBe(true)
    expect(isEnumerationPrompt('Name the 3 branches of the aortic arch.')).toBe(true)
    expect(isEnumerationPrompt('Which branch of the aortic arch supplies the right arm?')).toBe(false)
  })

  it('isDenseCardBack detects overly dense answers', () => {
    expect(isDenseCardBack('Short atomic answer.')).toBe(false)
    const longText = 'Word '.repeat(45)
    expect(isDenseCardBack(longText)).toBe(true)
  })

  it('evaluateMatuschakCriteria scores prompts across the 5 dimensions', () => {
    const evalResult = evaluateMatuschakCriteria(
      '[Cardiology: Anatomy] Which valve separates the right atrium from the right ventricle?',
      'Tricuspid valve.'
    )
    expect(evalResult.focus).toBe(1.0)
    expect(evalResult.precision).toBe(1.0)
    expect(evalResult.consistency).toBe(1.0)
    expect(evalResult.tractability).toBe(1.0)
    expect(evalResult.effortfulness).toBe(1.0)
    expect(evalResult.overallScore).toBeGreaterThanOrEqual(0.9)
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
  it('detects numbered lists of 2+', () => {
    const items = detectCompoundAnswer('1. Alpha\n2. Bravo\n3. Gamma')
    expect(items).toEqual(['Alpha', 'Bravo', 'Gamma'])
  })

  it('detects bulleted lists', () => {
    const items = detectCompoundAnswer('* Alpha\n* Bravo\n* Gamma')
    expect(items).toHaveLength(3)
  })

  it('returns empty for single plain text', () => {
    expect(detectCompoundAnswer('Just a single answer')).toEqual([])
  })
})

describe('checkMinimumInformationPrinciple', () => {
  it('fails when back has a multi-item list', () => {
    const result = checkMinimumInformationPrinciple('Question?', '1. Alpha\n2. Bravo\n3. Charlie')
    expect(result.passes).toBe(false)
  })

  it('flags multiple questions in front', () => {
    const result = checkMinimumInformationPrinciple('What is X? What is Y?', 'An answer here')
    expect(result.issues.some((i) => i.includes('multiple questions'))).toBe(true)
  })

  it('passes a simple single-concept card', () => {
    const result = checkMinimumInformationPrinciple('What is X?', 'A single answer')
    expect(result.passes).toBe(true)
  })
})
