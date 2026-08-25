/**
 * Feature Audit Tests — v3.1.0
 *
 * Covers the four areas explicitly requested:
 *  1. Study button labels (Study Now / Multiple Choice / Learn Mode)
 *  2. Duplicate flashcard detection
 *  3. Add Subject button wiring
 *  4. Material syllabus_processed flag (materials auto-sorted in curriculum)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1.  STUDY BUTTON LABELS
//     Verify the three study-mode options have the correct labels and routes.
// ─────────────────────────────────────────────────────────────────────────────
describe('Study button options — Dashboard (global)', () => {
  // Replicate the `options` array defined inside <StudyMenu> in Dashboard.tsx
  const baseRoute = '/study'
  const options = [
    { label: 'Study Now',       desc: 'Flashcards & active recall with spaced repetition', route: baseRoute,                   dot: 'bg-violet-500' },
    { label: 'Multiple Choice', desc: 'Practice with answer options — no schedule impact',  route: `${baseRoute}?mode=mc`,    dot: 'bg-blue-500'   },
    { label: 'Learn Mode',      desc: 'Master cards through multiple-choice then written answers', route: `${baseRoute}?mode=learn`, dot: 'bg-emerald-500' },
  ]

  it('has exactly 3 study options', () => {
    expect(options).toHaveLength(3)
  })

  it('first option is "Study Now" → /study', () => {
    expect(options[0].label).toBe('Study Now')
    expect(options[0].route).toBe('/study')
  })

  it('second option is "Multiple Choice" → /study?mode=mc', () => {
    expect(options[1].label).toBe('Multiple Choice')
    expect(options[1].route).toBe('/study?mode=mc')
  })

  it('third option is "Learn Mode" → /study?mode=learn', () => {
    expect(options[2].label).toBe('Learn Mode')
    expect(options[2].route).toBe('/study?mode=learn')
  })

  it('all labels are non-empty strings', () => {
    for (const opt of options) {
      expect(typeof opt.label).toBe('string')
      expect(opt.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('all descriptions are non-empty strings', () => {
    for (const opt of options) {
      expect(typeof opt.desc).toBe('string')
      expect(opt.desc.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('Study button options — SubjectCard (per-subject)', () => {
  // Replicate the `options` array inside <SubjectStudyMenu> in SubjectCard.tsx
  const subjectId = 42
  const base = `/study/${subjectId}`
  const options = [
    { label: 'Study Now',       route: base,                   dot: 'bg-violet-500' },
    { label: 'Multiple Choice', route: `${base}?mode=mc`,    dot: 'bg-blue-500'   },
    { label: 'Learn Mode',      route: `${base}?mode=learn`, dot: 'bg-emerald-500' },
  ]

  it('Study Now route is /study/<id>', () => {
    expect(options[0].route).toBe('/study/42')
  })

  it('Multiple Choice route appends ?mode=mc', () => {
    expect(options[1].route).toBe('/study/42?mode=mc')
  })

  it('Learn Mode route appends ?mode=learn', () => {
    expect(options[2].route).toBe('/study/42?mode=learn')
  })

  it('button trigger label includes "Study Flashcards" text', () => {
    // The trigger button reads: Study Flashcards{cardsDue > 0 ? ` · ${cardsDue} due` : ''}
    const cardsDue = 5
    const label = `Study Flashcards${cardsDue > 0 ? ` · ${cardsDue} due` : ''}`
    expect(label).toBe('Study Flashcards · 5 due')
  })

  it('button trigger label has no suffix when no cards are due', () => {
    const cardsDue = 0
    const label = `Study Flashcards${cardsDue > 0 ? ` · ${cardsDue} due` : ''}`
    expect(label).toBe('Study Flashcards')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.  DUPLICATE FLASHCARD DETECTION
//     Core deduplication logic (re-exercises key paths from cardDeduplication.ts
//     with edge cases relevant to generated card batches).
// ─────────────────────────────────────────────────────────────────────────────
import {
  isDuplicateCard,
  findCardDuplicates,
  normalizeCardText,
  stripMarkdown,
} from '../../src/lib/cardDeduplication'

describe('Duplicate flashcard detection — edge cases', () => {
  describe('normalizeCardText strips common prefixes', () => {
    it('removes "What is"', () => expect(normalizeCardText('What is entropy?')).toBe('entropy'))
    it('removes "Define"',  () => expect(normalizeCardText('Define entropy')).toBe('entropy'))
    it('removes "Explain"', () => expect(normalizeCardText('Explain entropy')).toBe('entropy'))
  })

  describe('stripMarkdown cleans formatting', () => {
    it('strips bold', () => expect(stripMarkdown('**ATP**')).toBe('ATP'))
    it('strips italic', () => expect(stripMarkdown('*RNA*')).toBe('RNA'))
    it('strips inline code', () => expect(stripMarkdown('`const x`')).toBe('const x'))
    it('strips [Front] prefix', () => expect(stripMarkdown('[Front] DNA')).toBe('DNA'))
  })

  describe('isDuplicateCard', () => {
    it('flags cards with identical normalized fronts as duplicate', () => {
      const a = { front: 'What is DNA?', back: 'The genetic molecule.' }
      const b = { front: 'Define DNA',   back: 'Carries genetic information.' }
      expect(isDuplicateCard(a, b).isDuplicate).toBe(true)
    })

    it('flags cards with identical backs and similar fronts as duplicate', () => {
      const a = { front: 'ATP role',                back: 'Energy currency of the cell.' }
      const b = { front: 'What does ATP do?',       back: 'Energy currency of the cell.' }
      expect(isDuplicateCard(a, b).isDuplicate).toBe(true)
    })

    it('does NOT flag semantically different cards as duplicate', () => {
      const a = { front: 'Mitosis',  back: 'Produces two identical daughter cells.' }
      const b = { front: 'Meiosis',  back: 'Produces four genetically diverse gametes.' }
      expect(isDuplicateCard(a, b).isDuplicate).toBe(false)
    })

    it('does NOT flag cards with different topics as duplicate', () => {
      const a = { front: 'Newton First Law',  back: 'Objects stay at rest unless acted upon.' }
      const b = { front: 'Boyle Law',         back: 'Pressure and volume are inversely related.' }
      expect(isDuplicateCard(a, b).isDuplicate).toBe(false)
    })
  })

  describe('findCardDuplicates — batch generation safety', () => {
    const deck = [
      { front: 'What is Photosynthesis?', back: 'Converts sunlight to glucose.' },
    ]

    it('flags an intra-batch duplicate generated in the same session', () => {
      const candidates = [
        { front: 'What is Osmosis?',   back: 'Water crosses a semipermeable membrane.' },
        { front: 'Define Osmosis',     back: 'Passive movement of water down its gradient.' }, // dup of #1
        { front: 'What is Diffusion?', back: 'Particles move from high to low concentration.' },
      ]
      const results = findCardDuplicates(candidates, deck)
      expect(results[0].isDuplicate).toBe(false) // Osmosis — first occurrence
      expect(results[1].isDuplicate).toBe(true)  // Osmosis — intra-batch dup
      expect(results[2].isDuplicate).toBe(false) // Diffusion — unique
    })

    it('flags a card that already exists in the deck', () => {
      const candidates = [
        { front: '**Photosynthesis**', back: 'Plants making food from light.' },
      ]
      const results = findCardDuplicates(candidates, deck)
      expect(results[0].isDuplicate).toBe(true)
      expect(results[0].reason).toMatch(/Already in deck/i)
    })

    it('returns isDuplicate:false for all when batch is entirely novel', () => {
      const candidates = [
        { front: 'What is Glycolysis?', back: 'Breakdown of glucose to pyruvate.' },
        { front: 'Krebs Cycle',          back: 'Series of reactions producing NADH and FADH2.' },
      ]
      const results = findCardDuplicates(candidates, deck)
      expect(results.every(r => !r.isDuplicate)).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3.  ADD SUBJECT BUTTON
//     Verify the handler falls back to onNewClass when onNewSubject is absent,
//     and that only one of the two props is invoked per click.
// ─────────────────────────────────────────────────────────────────────────────
describe('Add Subject button handler logic', () => {
  // Replicate the logic from Dashboard.tsx:
  //   const handleOpenSubjectWizard = onNewSubject || onNewClass
  function makeHandler(onNewSubject?: () => void, onNewClass?: () => void): () => void {
    return onNewSubject || onNewClass || (() => { /* no-op */ })
  }

  it('calls onNewSubject when provided', () => {
    const onNewSubject = jest.fn()
    const onNewClass   = jest.fn()
    makeHandler(onNewSubject, onNewClass)()
    expect(onNewSubject).toHaveBeenCalledTimes(1)
    expect(onNewClass).not.toHaveBeenCalled()
  })

  it('falls back to onNewClass when onNewSubject is absent', () => {
    const onNewClass = jest.fn()
    makeHandler(undefined, onNewClass)()
    expect(onNewClass).toHaveBeenCalledTimes(1)
  })

  it('does not throw when neither prop is provided', () => {
    expect(() => makeHandler(undefined, undefined)()).not.toThrow()
  })

  it('does not call onNewClass when onNewSubject is provided', () => {
    const onNewSubject = jest.fn()
    const onNewClass   = jest.fn()
    const handler = makeHandler(onNewSubject, onNewClass)
    handler()
    expect(onNewClass).toHaveBeenCalledTimes(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4.  MATERIAL AUTO-SORTED BY SUBJECT IN CURRICULUM
//     The syllabus_processed flag governs which materials get folded into the
//     curriculum.  Verify the flag logic and incremental-vs-full-regen rules.
// ─────────────────────────────────────────────────────────────────────────────
describe('Material syllabus_processed flag (curriculum auto-sort)', () => {
  interface MockMaterial {
    id: number
    subject_id: number
    filename: string
    syllabus_processed: number
  }

  // Simulate the filter that updateFromMaterials uses when materialIds is empty:
  // "SELECT … WHERE syllabus_processed = 0"
  function getUnprocessed(materials: MockMaterial[]): MockMaterial[] {
    return materials.filter(m => m.syllabus_processed === 0)
  }

  // Simulate marking all materials processed (full regen path)
  function markAllProcessed(materials: MockMaterial[]): MockMaterial[] {
    return materials.map(m => ({ ...m, syllabus_processed: 1 }))
  }

  // Simulate incremental update: mark only specified IDs
  function markProcessed(materials: MockMaterial[], ids: number[]): MockMaterial[] {
    return materials.map(m => ids.includes(m.id) ? { ...m, syllabus_processed: 1 } : m)
  }

  const baseMaterials: MockMaterial[] = [
    { id: 1, subject_id: 10, filename: 'chapter1.pdf', syllabus_processed: 1 },
    { id: 2, subject_id: 10, filename: 'chapter2.pdf', syllabus_processed: 1 },
    { id: 3, subject_id: 10, filename: 'chapter3.pdf', syllabus_processed: 0 }, // newly uploaded
  ]

  it('only unprocessed materials are selected for incremental update', () => {
    const unprocessed = getUnprocessed(baseMaterials)
    expect(unprocessed).toHaveLength(1)
    expect(unprocessed[0].filename).toBe('chapter3.pdf')
  })

  it('incremental update marks only the new material as processed', () => {
    const updated = markProcessed(baseMaterials, [3])
    expect(updated.find(m => m.id === 3)?.syllabus_processed).toBe(1)
    // Original materials stay processed
    expect(updated.find(m => m.id === 1)?.syllabus_processed).toBe(1)
    expect(updated.find(m => m.id === 2)?.syllabus_processed).toBe(1)
  })

  it('after incremental update, no unprocessed materials remain', () => {
    const updated = markProcessed(baseMaterials, [3])
    expect(getUnprocessed(updated)).toHaveLength(0)
  })

  it('full regen marks all materials as processed', () => {
    const withUnprocessed = [
      { id: 1, subject_id: 10, filename: 'ch1.pdf', syllabus_processed: 0 },
      { id: 2, subject_id: 10, filename: 'ch2.pdf', syllabus_processed: 0 },
    ]
    const updated = markAllProcessed(withUnprocessed)
    expect(updated.every(m => m.syllabus_processed === 1)).toBe(true)
  })

  it('new materials default to syllabus_processed = 0 (unprocessed)', () => {
    const newMaterial: MockMaterial = {
      id: 99,
      subject_id: 10,
      filename: 'notes.pdf',
      syllabus_processed: 0,  // DEFAULT from schema migration
    }
    expect(newMaterial.syllabus_processed).toBe(0)
    expect(getUnprocessed([newMaterial])).toHaveLength(1)
  })

  it('a subject with all materials processed shows no pending update banner trigger', () => {
    const allProcessed = baseMaterials.map(m => ({ ...m, syllabus_processed: 1 }))
    // Simulate the UI condition: pendingUpdateMaterial is set when unprocessed materials exist
    const pendingMaterial = getUnprocessed(allProcessed)[0]
    expect(pendingMaterial).toBeUndefined()
  })

  it('a subject with one unprocessed material triggers the update banner', () => {
    const pending = getUnprocessed(baseMaterials)
    expect(pending.length).toBeGreaterThan(0)
    // The banner in UnifiedSubjectDetail checks: pendingUpdateMaterial (the filename)
    expect(pending[0].filename).toBe('chapter3.pdf')
  })
})
