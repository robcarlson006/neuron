import { mapAnkiCardType, parseAnkiNote, validateAnkiDeck } from '../../src/lib/ankiImporter'

describe('mapAnkiCardType', () => {
  it('maps Anki basic type 0 to flashcard', () => {
    expect(mapAnkiCardType(0)).toBe('flashcard')
  })

  it('maps other Anki types to flashcard (current behaviour)', () => {
    expect(mapAnkiCardType(1)).toBe('flashcard')
    expect(mapAnkiCardType(2)).toBe('flashcard')
  })
})

describe('parseAnkiNote', () => {
  it('splits fields by the unit separator', () => {
    const note = {
      id: 1,
      guid: 'g',
      mid: 1,
      mod: 1,
      tags: 'tag1 tag2',
      flds: 'FrontBack1Back2',
      sfld: 'Front',
      csum: 0
    }
    const result = parseAnkiNote(note)
    expect(result.front).toBe('Front')
    expect(result.back).toBe('Back1\nBack2')
    expect(result.tags).toEqual(['tag1', 'tag2'])
  })

  it('handles empty fields and tags', () => {
    const note = {
      id: 1,
      guid: 'g',
      mid: 1,
      mod: 1,
      tags: '',
      flds: 'OnlyFront',
      sfld: 'OnlyFront',
      csum: 0
    }
    const result = parseAnkiNote(note)
    expect(result.front).toBe('OnlyFront')
    expect(result.back).toBe('')
    expect(result.tags).toEqual([])
  })
})

describe('validateAnkiDeck', () => {
  it('returns no errors for a valid deck', () => {
    const errors = validateAnkiDeck({
      name: 'Deck',
      cards: [{ front: 'Q', back: 'A', tags: [], type: 'flashcard' }],
      cardCount: 1
    })
    expect(errors).toEqual([])
  })

  it('flags missing name', () => {
    const errors = validateAnkiDeck({
      name: '',
      cards: [{ front: 'Q', back: 'A', tags: [], type: 'flashcard' }],
      cardCount: 1
    })
    expect(errors).toContain('Deck name is required')
  })

  it('flags empty deck', () => {
    const errors = validateAnkiDeck({ name: 'Deck', cards: [], cardCount: 0 })
    expect(errors).toContain('Deck has no cards')
  })

  it('flags cards with missing front or back', () => {
    const errors = validateAnkiDeck({
      name: 'Deck',
      cards: [{ front: '', back: 'A', tags: [], type: 'flashcard' }],
      cardCount: 1
    })
    expect(errors).toContain('Card 1: missing front')
  })
})
