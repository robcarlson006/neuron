import { parseCardsFromText, getCardTypeLabel, cleanCardBrackets } from '../../src/lib/cardParser'

describe('cleanCardBrackets', () => {
  it('cleans terms wrapped entirely in brackets', () => {
    expect(cleanCardBrackets('[Mitochondria]')).toBe('Mitochondria')
    expect(cleanCardBrackets('[Action Potential]')).toBe('Action Potential')
    expect(cleanCardBrackets('[What is photosynthesis?]')).toBe('What is photosynthesis?')
  })

  it('cleans bracketed terms inside sentences', () => {
    expect(
      cleanCardBrackets('[Photosynthesis] is the process by which [plants] convert light into chemical energy.')
    ).toBe('Photosynthesis is the process by which plants convert light into chemical energy.')

    expect(
      cleanCardBrackets('What is the primary physiological role of [Mitochondria] in [cellular respiration]?')
    ).toBe('What is the primary physiological role of Mitochondria in cellular respiration?')

    expect(
      cleanCardBrackets('What is the critical functional difference between [Mitosis] and [Meiosis]?')
    ).toBe('What is the critical functional difference between Mitosis and Meiosis?')
  })

  it('preserves LaTeX math expressions with brackets', () => {
    expect(cleanCardBrackets('The domain is $x \\in [0, 1]$ and $y \\in [a, b]$.')).toBe(
      'The domain is $x \\in [0, 1]$ and $y \\in [a, b]$.'
    )
    expect(cleanCardBrackets('$$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$$')).toBe(
      '$$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$$'
    )
  })

  it('preserves inline code with brackets and array indexing', () => {
    expect(cleanCardBrackets('Access elements with `arr[0]` or arr[i].')).toBe(
      'Access elements with `arr[0]` or arr[i].'
    )
  })

  it('preserves markdown links', () => {
    expect(cleanCardBrackets('See the [Documentation](https://example.com) for details.')).toBe(
      'See the [Documentation](https://example.com) for details.'
    )
  })

  it('preserves fill-in-the-blank placeholders like [___] and [...]', () => {
    expect(cleanCardBrackets('The [___] is the powerhouse of the cell.')).toBe(
      'The [___] is the powerhouse of the cell.'
    )
    expect(cleanCardBrackets('The [...] is the powerhouse of the cell.')).toBe(
      'The [...] is the powerhouse of the cell.'
    )
  })

  it('cleans numeric terms and dates in brackets', () => {
    expect(cleanCardBrackets('[4]')).toBe('4')
    expect(cleanCardBrackets('The year was [1945].')).toBe('The year was 1945.')
  })
})

describe('parseCardsFromText', () => {
  it('parses markdown bold-arrow flashcards and cleans unnecessary brackets', () => {
    const cards = parseCardsFromText('**[Mitochondria]** → [The powerhouse of the cell]')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toEqual({
      type: 'flashcard',
      front: 'Mitochondria',
      back: 'The powerhouse of the cell'
    })
  })

  it('parses labeled Front/Back format and cleans unnecessary brackets', () => {
    const cards = parseCardsFromText('Front: [What is 2+2?]\nBack: [4]')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toEqual({ type: 'flashcard', front: 'What is 2+2?', back: '4' })
  })

  it('parses Question/Answer format as active recall', () => {
    const cards = parseCardsFromText('Question: Why does the sky appear blue?\nAnswer: Rayleigh scattering')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('active_recall')
    expect(cards[0].front).toBe('Why does the sky appear blue?')
  })

  it('parses [Q] ... [A] bracket format', () => {
    const cards = parseCardsFromText('[Q] What is the capital? [A] London')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('active_recall')
  })

  it('parses Q: ... A: simple label format', () => {
    const cards = parseCardsFromText('Q: Define entropy A: A measure of disorder')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('active_recall')
  })

  it('parses term-separator-definition format with brackets', () => {
    const cards = parseCardsFromText('[Photosynthesis] • [Process of converting light to chemical energy]')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('flashcard')
    expect(cards[0].front).toBe('Photosynthesis')
    expect(cards[0].back).toBe('Process of converting light to chemical energy')
  })

  it('classifies question-like fronts as active recall', () => {
    const cards = parseCardsFromText('What is the powerhouse of the cell? · Mitochondria')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('active_recall')
  })

  it('splits numbered lists into multiple cards and cleans numbers and brackets', () => {
    const text = '1. **[Alpha]** → [First letter]\n2. **[Beta]** → [Second letter]\n3. **[Gamma]** → [Third letter]'
    const cards = parseCardsFromText(text)
    expect(cards).toHaveLength(3)
    expect(cards[0].front).toBe('Alpha')
    expect(cards[0].back).toBe('First letter')
    expect(cards[1].front).toBe('Beta')
    expect(cards[1].back).toBe('Second letter')
    expect(cards[2].front).toBe('Gamma')
    expect(cards[2].back).toBe('Third letter')
  })

  it('strips leading numbers embedded inside bold', () => {
    const text = '**1. Action Potential** → An electrical signal in neurons\n**2. Synapse** → The junction between neurons'
    const cards = parseCardsFromText(text)
    expect(cards).toHaveLength(2)
    expect(cards[0].front).toBe('Action Potential')
    expect(cards[0].back).toBe('An electrical signal in neurons')
    expect(cards[1].front).toBe('Synapse')
  })

  it('splits double-newline separated cards', () => {
    const text = '**Cat** → A feline\n\n**Dog** → A canine'
    const cards = parseCardsFromText(text)
    expect(cards).toHaveLength(2)
  })

  it('skips segments shorter than 10 characters', () => {
    const cards = parseCardsFromText('hi')
    expect(cards).toHaveLength(0)
  })

  it('returns empty array for empty text', () => {
    expect(parseCardsFromText('')).toEqual([])
  })
})

describe('getCardTypeLabel', () => {
  it('counts flashcards and active recall separately', () => {
    const cards = parseCardsFromText(
      '**Mitochondria** → The powerhouse of the cell\n\nQuestion: What is the powerhouse of the cell?\nAnswer: Mitochondria'
    )
    const { flashcards, recall } = getCardTypeLabel(cards)
    expect(flashcards).toBe(1)
    expect(recall).toBe(1)
  })
})
