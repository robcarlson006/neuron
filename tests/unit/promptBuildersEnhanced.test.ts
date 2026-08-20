import {
  parseAutoCardResponse,
  parseFlashcardResponse,
  parseActiveRecallResponse,
  buildAutoCardGenerationPrompt,
  buildFlashcardOnlyPrompt,
  buildActiveRecallOnlyPrompt
} from '../../src/lib/promptBuilders'

const validAuto = JSON.stringify({
  flashcards: [
    {
      front: 'What is a cell?',
      back: 'Basic unit of life',
      card_subtype: 'definition',
      concrete_example: 'A red blood cell',
      common_mistake: 'Thinking atoms are cells',
      mnemonic: 'Cells are the building blocks'
    }
  ],
  active_recall: [
    {
      question: 'Why do cells divide?',
      model_answer: 'For growth and repair',
      card_subtype: 'mechanism',
      concrete_example: 'Skin healing after a cut',
      common_mistake: 'Assuming division only happens in embryos',
      mnemonic: undefined
    }
  ]
})

describe('parseAutoCardResponse', () => {
  it('parses a valid response with extended fields', () => {
    const result = parseAutoCardResponse(validAuto)
    expect(result.flashcards).toHaveLength(1)
    expect(result.flashcards[0].card_subtype).toBe('definition')
    expect(result.flashcards[0].concrete_example).toBe('A red blood cell')
    expect(result.active_recall).toHaveLength(1)
  })

  it('strips markdown code fences', () => {
    const fenced = '```json\n' + validAuto + '\n```'
    const result = parseAutoCardResponse(fenced)
    expect(result.flashcards).toHaveLength(1)
  })

  it('throws on missing flashcards array', () => {
    expect(() => parseAutoCardResponse(JSON.stringify({ active_recall: [] }))).toThrow('missing flashcards array')
  })

  it('throws on missing active_recall array', () => {
    expect(() => parseAutoCardResponse(JSON.stringify({ flashcards: [] }))).toThrow('missing active_recall array')
  })

  it('throws on invalid flashcard structure', () => {
    expect(() => parseAutoCardResponse(JSON.stringify({ flashcards: [{ front: 'x' }], active_recall: [] }))).toThrow('missing front or back')
  })

  it('ignores invalid subtype values', () => {
    const data = JSON.stringify({
      flashcards: [{ front: 'Q', back: 'A', card_subtype: 'nonsense' }],
      active_recall: []
    })
    const result = parseAutoCardResponse(data)
    expect(result.flashcards[0].card_subtype).toBeUndefined()
  })
})

describe('parseFlashcardResponse', () => {
  it('parses a flashcard-only response', () => {
    const data = JSON.stringify({ flashcards: [{ front: 'Q', back: 'A', card_subtype: 'application' }] })
    const result = parseFlashcardResponse(data)
    expect(result).toHaveLength(1)
    expect(result[0].card_subtype).toBe('application')
  })

  it('throws on missing flashcards', () => {
    expect(() => parseFlashcardResponse(JSON.stringify({ active_recall: [] }))).toThrow()
  })
})

describe('parseActiveRecallResponse', () => {
  it('parses an active-recall-only response', () => {
    const data = JSON.stringify({ active_recall: [{ question: 'Q?', model_answer: 'A', card_subtype: 'mechanism' }] })
    const result = parseActiveRecallResponse(data)
    expect(result).toHaveLength(1)
    expect(result[0].question).toBe('Q?')
  })

  it('throws on missing active_recall', () => {
    expect(() => parseActiveRecallResponse(JSON.stringify({ flashcards: [] }))).toThrow()
  })
})

describe('enhanced prompt builders', () => {
  it('buildAutoCardGenerationPrompt includes context and dedup section', () => {
    const prompt = buildAutoCardGenerationPrompt(
      'source text',
      'Biology',
      'Module 1',
      'Cells',
      [{ front: 'Existing card', back: 'x' }],
      8,
      4
    )
    expect(prompt).toContain('Biology')
    expect(prompt).toContain('Module 1')
    expect(prompt).toContain('Cells')
    expect(prompt).toContain('DO NOT duplicate')
    expect(prompt).toContain('Existing card')
    expect(prompt).toContain('8')
  })

  it('buildAutoCardGenerationPrompt omits dedup section without existing cards', () => {
    const prompt = buildAutoCardGenerationPrompt('source text', undefined, undefined, undefined, [], 8, 4)
    expect(prompt).not.toContain('DO NOT duplicate')
  })

  it('buildFlashcardOnlyPrompt requests flashcards only', () => {
    const prompt = buildFlashcardOnlyPrompt('source', 'Subject', 'Module', 10)
    expect(prompt).toContain('NO active recall')
    expect(prompt).toContain('10')
  })

  it('buildActiveRecallOnlyPrompt requests active recall only', () => {
    const prompt = buildActiveRecallOnlyPrompt('source', 'Subject', 'Module', 6)
    expect(prompt).toContain('NO flashcards')
    expect(prompt).toContain('6')
  })
})
