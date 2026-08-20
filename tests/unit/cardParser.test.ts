import { parseCardsFromText, getCardTypeLabel } from '../../src/lib/cardParser'

describe('parseCardsFromText', () => {
  it('parses markdown bold-arrow flashcards', () => {
    const cards = parseCardsFromText('**Mitochondria** → The powerhouse of the cell')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toEqual({
      type: 'flashcard',
      front: 'Mitochondria',
      back: 'The powerhouse of the cell'
    })
  })

  it('parses labeled Front/Back format', () => {
    const cards = parseCardsFromText('Front: What is 2+2?\nBack: 4')
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

  it('parses term-separator-definition format', () => {
    const cards = parseCardsFromText('Photosynthesis • Process of converting light to chemical energy')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('flashcard')
    expect(cards[0].front).toBe('Photosynthesis')
  })

  it('classifies question-like fronts as active recall', () => {
    const cards = parseCardsFromText('What is the powerhouse of the cell? · Mitochondria')
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('active_recall')
  })

  it('splits numbered lists into multiple cards', () => {
    const text = '1. **Alpha** → First letter\n2. **Beta** → Second letter\n3. **Gamma** → Third letter'
    const cards = parseCardsFromText(text)
    expect(cards).toHaveLength(3)
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
