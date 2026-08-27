import { normalizeTopicName, calculateTopicSimilarity, consolidateCardTopics } from '../../src/lib/topicClustering'
import type { Card } from '../../src/types'

describe('Topic Clustering & Consolidation Engine', () => {
  describe('normalizeTopicName', () => {
    it('normalizes prefixes, numbering, and bullet points', () => {
      expect(normalizeTopicName('1. Action Potential')).toBe('Action Potential')
      expect(normalizeTopicName('Topic: Glycolysis')).toBe('Glycolysis')
      expect(normalizeTopicName('- • Synaptic Transmission')).toBe('Synaptic Transmission')
      expect(normalizeTopicName('**Cellular Respiration**')).toBe('Cellular Respiration')
    })

    it('preserves scientific acronyms', () => {
      expect(normalizeTopicName('ATP Synthesis')).toBe('ATP Synthesis')
      expect(normalizeTopicName('DNA Replication')).toBe('DNA Replication')
      expect(normalizeTopicName('mRNA Processing')).toBe('mRNA Processing')
    })
  })

  describe('calculateTopicSimilarity', () => {
    it('calculates exact and substring matches', () => {
      expect(calculateTopicSimilarity('Action Potential', 'Action Potential')).toBe(1.0)
      expect(calculateTopicSimilarity('Action Potential Dynamics', 'Action Potential')).toBeGreaterThanOrEqual(0.8)
      expect(calculateTopicSimilarity('Synaptic Cleft', 'Synaptic Transmission')).toBeGreaterThan(0.2)
      expect(calculateTopicSimilarity('Quantum Physics', 'Cell Biology')).toBe(0.0)
    })
  })

  describe('consolidateCardTopics', () => {
    it('consolidates 50 cards with 30 micro-topics down to <= 5 dominant topics', () => {
      const fragmentedCards: Partial<Card>[] = []
      const microTopics = [
        'Axon hillock initiation', 'Sodium channel gating', 'Resting potential maintenance',
        'Refractory period kinetics', 'Potassium delayed rectifier', 'Action potential threshold',
        'Vesicle docking mechanism', 'SNARE complex assembly', 'Synaptotagmin calcium sensor',
        'Neurotransmitter clearance', 'GABAergic inhibition', 'Glutamatergic excitation',
        'Oligodendrocyte wrapping', 'Schwann cell myelin', 'Nodes of Ranvier conduction',
        'Saltatory propagation speed', 'Astrocyte glutamate uptake', 'Microglia immune surveillance',
        'Choline acetyltransferase', 'Acetylcholinesterase kinetics', 'Nicotinic receptor opening',
        'Muscarinic GPCR cascade', 'Dopamine D1 activation', 'Dopamine D2 inhibition',
        'Long term potentiation', 'NMDA receptor magnesium block', 'AMPA receptor insertion',
        'Retrograde nitric oxide', 'Calmodulin kinase II activation', 'Synaptic pruning'
      ]

      // Generate 50 cards using 30 fragmented micro-topics
      for (let i = 0; i < 50; i++) {
        fragmentedCards.push({
          front: `Card ${i + 1} Question`,
          back: `Card ${i + 1} Answer`,
          concept: microTopics[i % microTopics.length]
        })
      }

      const consolidated = consolidateCardTopics(fragmentedCards, { maxTopics: 4 })
      const distinctTopics = Array.from(new Set(consolidated.map(c => c.concept)))

      // Should be strictly <= 4 topics
      expect(distinctTopics.length).toBeLessThanOrEqual(4)
      expect(consolidated).toHaveLength(50)
      for (const card of consolidated) {
        expect(distinctTopics).toContain(card.concept)
      }
    })

    it('maps cards to canonical topics when provided', () => {
      const canonical = ['Membrane Potential & Action Potentials', 'Synaptic Transmission', 'Glial Cells & Myelination']
      const cards: Partial<Card>[] = [
        { front: 'Q1', back: 'A1', concept: 'Sodium channel activation' },
        { front: 'Q2', back: 'A2', concept: 'Neurotransmitter release' },
        { front: 'Q3', back: 'A3', concept: 'Myelin sheath insulation' },
        { front: 'Q4', back: 'A4', concept: 'Synaptic vesicle fusion' }
      ]

      const consolidated = consolidateCardTopics(cards, { canonicalTopics: canonical })
      const distinctTopics = Array.from(new Set(consolidated.map(c => c.concept)))

      for (const t of distinctTopics) {
        expect(canonical).toContain(t)
      }
      expect(consolidated[1].concept).toBe('Synaptic Transmission')
      expect(consolidated[2].concept).toBe('Glial Cells & Myelination')
      expect(consolidated[3].concept).toBe('Synaptic Transmission')
    })
  })
})
