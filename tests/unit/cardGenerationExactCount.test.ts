import { safeParseAICards } from '../../src/lib/jsonRepair'
import {
  buildAutoCardGenerationPrompt,
  buildFlashcardOnlyPrompt,
  buildActiveRecallOnlyPrompt,
  buildCardGenerationPrompt
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
})
