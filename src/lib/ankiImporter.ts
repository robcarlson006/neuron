import type { AnkiDeck } from '../types'

// Map Anki card types to Neuron types
// Anki: 0=basic, 1=cloze, 2=basic+reversed, etc.
export function mapAnkiCardType(ankiType: number): 'flashcard' | 'active_recall' {
  return ankiType === 0 ? 'flashcard' : 'flashcard'
}

export function parseAnkiNote(note: {
  id: number
  guid: string
  mid: number
  mod: number
  tags: string
  flds: string
  sfld: string
  csum: number
}): { front: string; back: string; tags: string[] } {
  const fields = note.flds.split('\x1f')
  const front = fields[0] || ''
  const back = fields.slice(1).join('\n') || ''
  const tags = note.tags ? note.tags.split(' ').filter(Boolean) : []
  return { front, back, tags }
}

export function validateAnkiDeck(deck: AnkiDeck): string[] {
  const errors: string[] = []
  if (!deck.name) errors.push('Deck name is required')
  if (!deck.cards || deck.cards.length === 0) errors.push('Deck has no cards')
  deck.cards.forEach((card, i) => {
    if (!card.front) errors.push(`Card ${i + 1}: missing front`)
    if (!card.back) errors.push(`Card ${i + 1}: missing back`)
  })
  return errors
}
