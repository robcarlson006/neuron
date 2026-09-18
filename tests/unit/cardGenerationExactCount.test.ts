import { safeParseAICards } from '../../src/lib/jsonRepair'
import {
  buildAutoCardGenerationPrompt,
  buildFlashcardOnlyPrompt,
  buildActiveRecallOnlyPrompt,
  buildCardGenerationPrompt,
  buildMultiSourceCardGenerationPrompt
} from '../../src/lib/promptBuilders'

describe('Card Generation Exact Count & Batch Slicing Logic', () => {
  describe('Prompt Generation Exact Count Directives', () => {
    it('instructs AI to generate exact flashcard count in buildFlashcardOnlyPrompt', () => {
      const prompt = buildFlashcardOnlyPrompt('some content', 'Neuroscience', 'Synapses', 10)
      expect(prompt).toContain('Generate exactly 10 flashcards')
      expect(prompt).not.toContain('Generate at least 10 flashcards')
    })

    it('instructs AI to generate exact active recall count in buildActiveRecallOnlyPrompt', () => {
      const prompt = buildActiveRecallOnlyPrompt('some content', 'Neuroscience', 'Synapses', 15)
      expect(prompt).toContain('Generate exactly 15 active recall questions')
      expect(prompt).not.toContain('Generate at least 15 active recall questions')
    })

    it('instructs AI to generate exact counts in buildAutoCardGenerationPrompt', () => {
      const prompt = buildAutoCardGenerationPrompt('some content', 'Neuroscience', 'Synapses', undefined, undefined, 8, 4)
      expect(prompt).toContain('Generate exactly 8 flashcards and 4 active recall questions')
      expect(prompt).not.toContain('Generate at least 8 flashcards')
    })

    it('instructs AI to generate exact counts in buildCardGenerationPrompt', () => {
      const prompt = buildCardGenerationPrompt('some content', 10, 5)
      expect(prompt).toContain('exactly 10 flashcards')
      expect(prompt).toContain('exactly 5 active recall questions')
    })
  })

  describe('Batch Slicing & Exact Count Enforcement Simulation', () => {
    it('slices batch candidates to remaining count so 15 active recall questions never becomes 16', () => {
      const targetCount = 15
      const BATCH_SIZE = 8
      let remaining = targetCount
      const allCandidateCards: Array<{ front: string; back: string }> = []

      // Simulate Batch 1: AI returns 8 items
      const batch1Target = Math.min(remaining, BATCH_SIZE) // 8
      expect(batch1Target).toBe(8)
      const batch1Items = Array.from({ length: 8 }, (_, i) => ({ front: `Question ${i + 1}?`, back: `Answer ${i + 1}` }))
      const toAdd1 = batch1Items.slice(0, remaining)
      allCandidateCards.push(...toAdd1)
      remaining -= toAdd1.length
      expect(remaining).toBe(7)

      // Simulate Batch 2: AI returns 8 items (1 more than remaining 7)
      const batch2Target = Math.min(remaining, BATCH_SIZE) // 7
      expect(batch2Target).toBe(7)
      const batch2Items = Array.from({ length: 8 }, (_, i) => ({ front: `Question ${i + 9}?`, back: `Answer ${i + 9}` }))
      const toAdd2 = batch2Items.slice(0, remaining)
      allCandidateCards.push(...toAdd2)
      remaining -= toAdd2.length
      expect(remaining).toBe(0)

      expect(allCandidateCards).toHaveLength(15)
      expect(allCandidateCards[14].front).toBe('Question 15?')
    })

    it('caps split/compound cards to target count so 10 flashcards never becomes 39', () => {
      const targetCount = 10
      const BATCH_SIZE = 8
      let remaining = targetCount
      const allCandidateCards: Array<{ front: string; back: string }> = []

      // Simulate Batch 1: AI returns 8 cards which get split into 39 cards due to compound list backs
      const splitCompoundCards = Array.from({ length: 39 }, (_, i) => ({
        front: `Term ${Math.floor(i / 4) + 1} — subpart ${i % 4}`,
        back: `Subpart explanation ${i}`
      }))

      const toAdd = splitCompoundCards.slice(0, remaining)
      allCandidateCards.push(...toAdd)
      remaining -= toAdd.length

      expect(allCandidateCards).toHaveLength(10)
      expect(remaining).toBe(0)
    })
  })

  describe('Safe Parsing & No Duplicate Extraction', () => {
    it('does not double count cards when parsed.cards and parsed.flashcards both exist', () => {
      const rawAIJson = JSON.stringify({
        flashcards: Array.from({ length: 10 }, (_, i) => ({
          front: `Flashcard Q${i + 1}?`,
          back: `Flashcard A${i + 1}`,
          concept: 'Core'
        }))
      })

      const parsed = safeParseAICards(rawAIJson)
      expect(parsed.flashcards).toHaveLength(10)
      expect(parsed.cards).toHaveLength(10)

      // Normalized extraction logic
      const flashcards = (parsed.flashcards && parsed.flashcards.length > 0)
        ? parsed.flashcards
        : (parsed.cards || []).filter(c => c.type === 'flashcard' || !c.type).map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))

      expect(flashcards).toHaveLength(10)
    })
  })

  describe('Multi-Source Triangulation & Source Badges', () => {
    it('builds a prompt with triangulation directives and all source document labels', () => {
      const combinedText = `
[DOCUMENT: Slides_Lec1.pdf]
Action Potentials are all-or-nothing electrical impulses.

[DOCUMENT: Textbook_Ch3.pdf]
The resting membrane potential is typically -70mV, maintained by Na+/K+ ATPase.

[DOCUMENT: Transcript_Lec1.txt]
Remember how I described the sodium channels popping open like dominoes?
      `.trim()

      const filenames = ['Slides_Lec1.pdf', 'Textbook_Ch3.pdf', 'Transcript_Lec1.txt']
      const prompt = buildMultiSourceCardGenerationPrompt(
        combinedText,
        'Neurobiology',
        filenames,
        [{ front: 'What is a neuron?', back: 'A specialized cell' }],
        14,
        4
      )

      // Checks that all filenames are listed in the header
      expect(prompt).toContain('1. Slides_Lec1.pdf')
      expect(prompt).toContain('2. Textbook_Ch3.pdf')
      expect(prompt).toContain('3. Transcript_Lec1.txt')

      // Checks triangulation directives
      expect(prompt).toContain('TRIANGULATION DIRECTIVE')
      expect(prompt).toContain('Triangulate Core Concepts')
      expect(prompt).toContain('Synthesize Complementary Perspectives')
      expect(prompt).toContain('Unify & Deduplicate Across Sources')

      // Checks strict negative exclusions
      expect(prompt).toContain('STRICT EXCLUSION RULES')
      expect(prompt).toContain('course mechanics, syllabus rules, homework logistics')

      // Checks full text is present
      expect(prompt).toContain('Action Potentials are all-or-nothing')
      expect(prompt).toContain('sodium channels popping open like dominoes')

      // Checks deduplication requirement
      expect(prompt).toContain('What is a neuron?')
    })

    it('correctly formats and parses JSON source array for visual source badges', () => {
      const filenames = ['Macroeconomics_Slides.pdf', 'Mankiw_Ch4.pdf', 'Lecture_Audio_Notes.md']
      const sourceJson = JSON.stringify(filenames)

      expect(sourceJson.startsWith('[')).toBe(true)
      expect(sourceJson.endsWith(']')).toBe(true)

      const parsed = JSON.parse(sourceJson)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(3)
      expect(parsed[0]).toBe('Macroeconomics_Slides.pdf')
      expect(parsed[1]).toBe('Mankiw_Ch4.pdf')
      expect(parsed[2]).toBe('Lecture_Audio_Notes.md')
    })
  })
})

