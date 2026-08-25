import {
  stripMarkdown,
  normalizeCardText,
  extractTokens,
  calculateJaccardSimilarity,
  calculateOverlapCoefficient,
  calculateDiceCoefficient,
  isDuplicateCard,
  findCardDuplicates
} from '../../src/lib/cardDeduplication'

describe('cardDeduplication - text processing', () => {
  describe('stripMarkdown', () => {
    it('strips bold and italic markdown', () => {
      expect(stripMarkdown('**Mitochondria**')).toBe('Mitochondria')
      expect(stripMarkdown('__Photosynthesis__')).toBe('Photosynthesis')
      expect(stripMarkdown('*Entropy*')).toBe('Entropy')
    })

    it('strips inline code and LaTeX delimiters', () => {
      expect(stripMarkdown('`const x = 1`')).toBe('const x = 1')
      expect(stripMarkdown('$E = mc^2$')).toBe('E = mc^2')
      expect(stripMarkdown('$$\\sum_{i=1}^n x_i$$')).toBe('\\sum_{i=1}^n x_i')
    })

    it('strips bracket labels and prefixes', () => {
      expect(stripMarkdown('[Q] What is DNA?')).toBe('What is DNA?')
      expect(stripMarkdown('[Front] Define Osmosis')).toBe('Define Osmosis')
      expect(stripMarkdown('Question: What is gravity?')).toBe('What is gravity?')
      expect(stripMarkdown('Front: Newton third law')).toBe('Newton third law')
    })

    it('strips leading numbers and bullets', () => {
      expect(stripMarkdown('1. **ATP**')).toBe('ATP')
      expect(stripMarkdown('2) Ribosome')).toBe('Ribosome')
      expect(stripMarkdown('* Chloroplast')).toBe('Chloroplast')
      expect(stripMarkdown('• Golgi apparatus')).toBe('Golgi apparatus')
    })
  })

  describe('normalizeCardText', () => {
    it('lowercases and removes punctuation', () => {
      expect(normalizeCardText('What is Photosynthesis?')).toBe('photosynthesis')
      expect(normalizeCardText('**Define Entropy!**')).toBe('entropy')
      expect(normalizeCardText('Explain the concept of: Cellular Respiration.')).toBe('cellular respiration')
    })

    it('strips common question prefixes', () => {
      expect(normalizeCardText('What is Mitochondria?')).toBe('mitochondria')
      expect(normalizeCardText('What are Ribosomes?')).toBe('ribosomes')
      expect(normalizeCardText('How does osmosis work?')).toBe('osmosis work')
      expect(normalizeCardText('Why is DNA important?')).toBe('dna important')
      expect(normalizeCardText('Describe the Krebs cycle')).toBe('krebs cycle')
      expect(normalizeCardText('Can you explain quantum tunneling?')).toBe('quantum tunneling')
    })
  })

  describe('extractTokens', () => {
    it('extracts non-trivial words', () => {
      const tokens = extractTokens('What is the cellular membrane structure?')
      expect(tokens).toContain('cellular')
      expect(tokens).toContain('membrane')
      expect(tokens).toContain('structure')
    })
  })
})

describe('cardDeduplication - similarity metrics', () => {
  it('calculates Jaccard similarity', () => {
    expect(calculateJaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1.0)
    expect(calculateJaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0)
    expect(calculateJaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5)
  })

  it('calculates Overlap coefficient', () => {
    expect(calculateOverlapCoefficient(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(1.0)
    expect(calculateOverlapCoefficient(['x', 'y'], ['a', 'b'])).toBe(0.0)
  })

  it('calculates Dice coefficient for fuzzy matching', () => {
    expect(calculateDiceCoefficient('mitochondria', 'mitochondria')).toBe(1.0)
    // Suffix variation
    expect(calculateDiceCoefficient('mitochondria', 'mitochondrion')).toBeGreaterThan(0.75)
    // Completely different
    expect(calculateDiceCoefficient('photosynthesis', 'thermodynamics')).toBeLessThan(0.3)
  })
})

describe('isDuplicateCard', () => {
  it('detects exact string matches (case-insensitive)', () => {
    const cardA = { front: 'Mitochondria', back: 'Powerhouse of the cell' }
    const cardB = { front: 'mitochondria', back: 'Powerhouse of the cell' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(true)
  })

  it('detects markdown and formatting variations as duplicate', () => {
    const cardA = { front: '**Mitochondria**', back: 'The powerhouse of the cell.' }
    const cardB = { front: 'Mitochondria', back: 'The powerhouse of the cell' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(true)
  })

  it('detects question prefix variations as duplicate', () => {
    const cardA = { front: 'What is photosynthesis?', back: 'Conversion of sunlight into glucose.' }
    const cardB = { front: 'Define photosynthesis', back: 'Process converting light energy into chemical energy.' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(true)
  })

  it('detects term vs question equivalence as duplicate', () => {
    const cardA = { front: 'Photosynthesis', back: 'Converts light to sugars' }
    const cardB = { front: 'What is photosynthesis?', back: 'Process where plants make food' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(true)
  })

  it('detects identical back with similar front as duplicate', () => {
    const cardA = { front: 'ATP role in cells', back: 'Provides primary energy currency for cellular reactions.' }
    const cardB = { front: 'What does ATP do in the cell?', back: 'Provides primary energy currency for cellular reactions.' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(true)
  })

  it('does NOT flag distinct concepts as duplicates', () => {
    const cardA = { front: 'What is mitosis?', back: 'Cell division producing two identical daughter cells.' }
    const cardB = { front: 'What is meiosis?', back: 'Cell division producing four genetically diverse gametes.' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(false)
  })

  it('does NOT flag unrelated cards as duplicates', () => {
    const cardA = { front: 'Newton First Law', back: 'An object remains at rest unless acted on by external force.' }
    const cardB = { front: 'Ohm Law', back: 'V = IR relating voltage, current, and resistance.' }
    const result = isDuplicateCard(cardA, cardB)
    expect(result.isDuplicate).toBe(false)
  })
})

describe('findCardDuplicates', () => {
  const existingDeck = [
    { front: 'What is Photosynthesis?', back: 'Process of turning sunlight into glucose.' },
    { front: 'Mitochondria', back: 'Organelle producing ATP via cellular respiration.' },
    { front: 'Newton Second Law', back: 'F = ma' }
  ]

  it('flags cards that match existing deck cards', () => {
    const candidates = [
      { front: '**Photosynthesis**', back: 'Process by which plants create food.' },
      { front: 'Define Mitochondria', back: 'Powerhouse of the cell generating ATP.' },
      { front: 'What is Osmosis?', back: 'Diffusion of water across a semipermeable membrane.' }
    ]

    const results = findCardDuplicates(candidates, existingDeck)
    expect(results).toHaveLength(3)

    // Card 1: Matches Photosynthesis in deck
    expect(results[0].isDuplicate).toBe(true)
    expect(results[0].reason).toContain('Already in deck')

    // Card 2: Matches Mitochondria in deck
    expect(results[1].isDuplicate).toBe(true)
    expect(results[1].reason).toContain('Already in deck')

    // Card 3: Fresh concept (Osmosis)
    expect(results[2].isDuplicate).toBe(false)
  })

  it('detects intra-batch duplicates generated in the same session', () => {
    const candidates = [
      { front: 'What is Osmosis?', back: 'Movement of water molecules across a membrane.' },
      { front: 'Define Osmosis', back: 'Passive transport of water down concentration gradient.' },
      { front: 'What is Diffusion?', back: 'Movement of particles from high to low concentration.' }
    ]

    const results = findCardDuplicates(candidates, existingDeck)
    expect(results).toHaveLength(3)

    // Card 1: New card (Osmosis)
    expect(results[0].isDuplicate).toBe(false)

    // Card 2: Intra-batch duplicate of Card 1
    expect(results[1].isDuplicate).toBe(true)
    expect(results[1].reason).toContain('Duplicate of card #1 generated in this session')

    // Card 3: New card (Diffusion)
    expect(results[2].isDuplicate).toBe(false)
  })

  it('returns all false when all candidates are unique and novel', () => {
    const candidates = [
      { front: 'What is the Citric Acid Cycle?', back: 'Series of chemical reactions in aerobic organisms.' },
      { front: 'What is Glycolysis?', back: 'Breakdown of glucose into pyruvate.' }
    ]

    const results = findCardDuplicates(candidates, existingDeck)
    expect(results).toEqual([
      { isDuplicate: false },
      { isDuplicate: false }
    ])
  })
})
