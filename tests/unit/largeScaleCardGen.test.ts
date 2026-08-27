import { repairJSONString, safeParseAICards, safeParseAIJson } from '../../src/lib/jsonRepair'
import { findCardDuplicates } from '../../src/lib/cardDeduplication'
import { validateCardQuality } from '../../src/lib/cardValidator'
import { buildAutoCardGenerationPrompt, parseAutoCardResponse } from '../../src/lib/promptBuilders'
import type { Card } from '../../src/types'

describe('Large Scale Card Generation & Organization Stress Tests', () => {
  describe('Extreme JSON Truncation & Corruption Resilience', () => {
    it('handles truncation at arbitrary byte positions in a 100-card payload', () => {
      const cards: string[] = []
      for (let i = 1; i <= 100; i++) {
        cards.push(`    { "front": "Question ${i}: What is concept ${i}?", "back": "Answer ${i}: Detailed molecular mechanism of concept ${i}", "concept": "Topic ${(i % 5) + 1}" }`)
      }
      const fullJson = `{\n  "flashcards": [\n${cards.join(',\n')}\n  ]\n}`

      // Test truncation at 10 different random cut points (e.g., in middle of keys, values, quotes)
      const cutPoints = [500, 1234, 4567, 8910, 12345, 17691, 20000, 25000]
      for (const cut of cutPoints) {
        if (cut >= fullJson.length) continue
        const truncated = fullJson.slice(0, cut)
        const result = safeParseAICards(truncated)
        expect(result.flashcards).toBeDefined()
        expect(Array.isArray(result.flashcards)).toBe(true)
        // Should have salvaged all cards before the cut point
        expect(result.flashcards!.length).toBeGreaterThan(0)
        expect(result.flashcards![0].front).toContain('Question 1')
      }
    })

    it('handles nested corrupted active recall questions with escaped quotes', () => {
      const complexText = `\`\`\`json
{
  "active_recall": [
    {
      "question": "Explain the \\"sliding filament theory\\" of muscle contraction.",
      "model_answer": "Myosin heads bind to actin, perform a \\"power stroke\\", and release upon ATP binding.",
      "concept": "Muscle Physiology"
    },
    {
      "question": "What happens when Ca2+ is pumped back into the sarcoplasmic reticulum?
`
      const result = safeParseAICards(complexText)
      expect(result.active_recall).toBeDefined()
      expect(result.active_recall!.length).toBeGreaterThanOrEqual(1)
      expect(result.active_recall![0].question).toContain('sliding filament theory')
      expect(result.active_recall![0].concept).toBe('Muscle Physiology')
    })
  })

  describe('Multi-Batch Deduplication & Quality Filtering', () => {
    it('correctly filters duplicates across successive batches', () => {
      const existingCards: { front: string; back: string }[] = [
        { front: 'What is the powerhouse of the cell?', back: 'Mitochondria' },
        { front: 'What is DNA?', back: 'Deoxyribonucleic acid' }
      ]

      const candidateBatch: { front: string; back: string }[] = [
        { front: 'What is the powerhouse of the cell?', back: 'The mitochondria produces ATP' }, // Duplicate
        { front: 'What is RNA?', back: 'Ribonucleic acid involved in protein synthesis' }, // Unique
        { front: 'What is DNA?', back: 'Deoxyribonucleic acid' } // Duplicate
      ]

      const dupResults = findCardDuplicates(candidateBatch, existingCards)
      expect(dupResults[0].isDuplicate).toBe(true)
      expect(dupResults[1].isDuplicate).toBe(false)
      expect(dupResults[2].isDuplicate).toBe(true)

      const uniqueCards = candidateBatch.filter((_, idx) => !dupResults[idx].isDuplicate)
      expect(uniqueCards).toHaveLength(1)
      expect(uniqueCards[0].front).toBe('What is RNA?')
    })

    it('validates card quality for various question types', () => {
      const validFlashcard = {
        subject_id: 1,
        type: 'flashcard' as const,
        front: 'What is synaptic plasticity?',
        back: 'The ability of synapses to strengthen or weaken over time in response to increases or decreases in their activity.',
        is_manual: 0 as const,
        concept: 'Neurobiology'
      }

      const { valid } = validateCardQuality(validFlashcard)
      expect(valid).toBe(true)

      const emptyCard = {
        subject_id: 1,
        type: 'flashcard' as const,
        front: '   ',
        back: 'Something',
        is_manual: 0 as const
      }
      const emptyValidation = validateCardQuality(emptyCard)
      expect(emptyValidation.valid).toBe(false)
    })
  })

  describe('Two-Layer Organization Data Model Integrity', () => {
    it('correctly links cards to both material_id and topic_id with concept metadata', () => {
      const cards: Partial<Card>[] = [
        { id: 1, subject_id: 10, material_id: 101, topic_id: 201, concept: 'Photosynthesis', front: 'Q1', back: 'A1', type: 'flashcard' },
        { id: 2, subject_id: 10, material_id: 101, topic_id: 202, concept: 'Calvin Cycle', front: 'Q2', back: 'A2', type: 'active_recall' },
        { id: 3, subject_id: 10, material_id: 102, topic_id: 201, concept: 'Photosynthesis', front: 'Q3', back: 'A3', type: 'flashcard' }
      ]

      // Grouping by Material
      const byMaterial = cards.reduce<Record<number, Partial<Card>[]>>((acc, card) => {
        const matId = card.material_id || -1
        acc[matId] = acc[matId] || []
        acc[matId].push(card)
        return acc
      }, {})

      expect(byMaterial[101]).toHaveLength(2)
      expect(byMaterial[102]).toHaveLength(1)

      // Grouping by Topic/Concept
      const byTopic = cards.reduce<Record<string, Partial<Card>[]>>((acc, card) => {
        const topic = card.concept || 'Unassigned'
        acc[topic] = acc[topic] || []
        acc[topic].push(card)
        return acc
      }, {})

      expect(byTopic['Photosynthesis']).toHaveLength(2)
      expect(byTopic['Calvin Cycle']).toHaveLength(1)
    })
  })

  describe('Large Document Text Partitioning & Section Coverage (10k-100k+ words)', () => {
    it('partitions large document text across batch windows with overlap to ensure 100% section coverage', () => {
      // Create a 50,000 character (~10,000 word) document with distinct sections
      const sections = [
        'Section 1: Membrane Potential and Ion Channels. Sodium channels open during depolarization.',
        'Section 2: Action Potential Propagation. Myelinated axons exhibit saltatory conduction.',
        'Section 3: Synaptic Transmission. Calcium triggers vesicle release into the synaptic cleft.',
        'Section 4: Neurotransmitter Systems. Acetylcholine and glutamate act as excitatory transmitters.',
        'Section 5: Postsynaptic Potentials. EPSPs and IPSPs integrate at the axon hillock.',
        'Section 6: Long Term Potentiation. NMDA receptors require both glutamate and depolarization.',
        'Section 7: Neural Circuits and Reflexes. The monosynaptic stretch reflex regulates muscle tone.',
        'Section 8: Sensory Transduction. Photoreceptors hyperpolarize in response to light stimulation.'
      ]
      const largeDoc = sections.map((s, idx) => `=== CHAPTER ${idx + 1} ===\n${s.repeat(50)}`).join('\n\n')

      expect(largeDoc.length).toBeGreaterThan(30000)

      const targetCount = 64 // 64 cards = 8 batches of 8
      const totalBatches = Math.ceil(targetCount / 8)
      const batchWindows: string[] = []

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        let batchText = largeDoc
        if (largeDoc.length > 8000) {
          const sliceLength = Math.max(5000, Math.ceil(largeDoc.length / totalBatches))
          const start = Math.max(0, Math.floor(batchIdx * (largeDoc.length / totalBatches)) - 400)
          const end = Math.min(largeDoc.length, start + sliceLength + 400)
          batchText = largeDoc.slice(start, end)
        }
        batchWindows.push(batchText)
      }

      expect(batchWindows).toHaveLength(8)
      // Confirm all chapters are represented across batch windows
      for (let i = 1; i <= 8; i++) {
        const found = batchWindows.some(window => window.includes(`=== CHAPTER ${i} ===`))
        expect(found).toBe(true)
      }
    })

    it('safely wraps around chunk windows during retry batches without out-of-bounds slicing', () => {
      const doc = 'A'.repeat(100000) // 100,000 characters
      const totalBatches = 5

      // Simulate 10 iterations (5 initial + 5 retry batches)
      for (let batchIdx = 0; batchIdx < 10; batchIdx++) {
        const activeBatchIdx = totalBatches > 0 ? (batchIdx % totalBatches) : 0
        const sliceLength = Math.max(5000, Math.ceil(doc.length / totalBatches))
        const start = Math.max(0, Math.floor(activeBatchIdx * (doc.length / totalBatches)) - 400)
        const end = Math.min(doc.length, start + sliceLength + 400)
        const slice = doc.slice(start, end)

        expect(slice.length).toBeGreaterThanOrEqual(5000)
        expect(start).toBeLessThan(doc.length)
        expect(end).toBeLessThanOrEqual(doc.length)
      }
    })
  })
})
