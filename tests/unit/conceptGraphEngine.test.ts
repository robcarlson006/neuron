import {
  normalizeConceptKey,
  inferDependenciesFromCurriculum,
  buildConceptGraph,
  getImpactedDownstreamConcepts,
  findShortestLearningPath
} from '../../src/lib/conceptGraphEngine'
import type { ConceptDependency, ConceptMastery, SyllabusModule, Card } from '../../src/types'

describe('conceptGraphEngine', () => {
  describe('normalizeConceptKey', () => {
    it('normalizes casing and excess whitespace', () => {
      expect(normalizeConceptKey('  Calculus   Derivatives ')).toBe('calculus derivatives')
      expect(normalizeConceptKey('Linear Algebra')).toBe('linear algebra')
    })
  })

  describe('inferDependenciesFromCurriculum', () => {
    it('infers sequential module and topic dependencies', () => {
      const mockModules: (SyllabusModule & { topics?: any[] })[] = [
        {
          id: 1,
          subject_id: 10,
          title: 'Module 1: Basics',
          status: 'completed',
          hours_estimated: 2,
          sort_order: 1,
          created_at: '2026-01-01',
          topics: [
            { id: 101, module_id: 1, title: 'Topic 1A', mastery_target: 80, sort_order: 1, created_at: '2026-01-01' },
            { id: 102, module_id: 1, title: 'Topic 1B', mastery_target: 80, sort_order: 2, created_at: '2026-01-01' }
          ]
        },
        {
          id: 2,
          subject_id: 10,
          title: 'Module 2: Advanced',
          status: 'pending',
          hours_estimated: 3,
          sort_order: 2,
          created_at: '2026-01-01',
          topics: [
            { id: 201, module_id: 2, title: 'Topic 2A', mastery_target: 80, sort_order: 1, created_at: '2026-01-01' }
          ]
        }
      ]

      const inferred = inferDependenciesFromCurriculum(mockModules)
      expect(inferred.length).toBeGreaterThan(0)

      // Module 1 -> Module 2 sequence
      expect(inferred.some(d => d.prerequisite_concept === 'Module 1: Basics' && d.target_concept === 'Module 2: Advanced')).toBe(true)
      // Topic 1A -> Topic 1B sequence
      expect(inferred.some(d => d.prerequisite_concept === 'Topic 1A' && d.target_concept === 'Topic 1B')).toBe(true)
    })

    it('parses explicit prerequisites comma-separated string', () => {
      const mockModules: (SyllabusModule & { topics?: any[] })[] = [
        {
          id: 3,
          subject_id: 10,
          title: 'Quantum Mechanics',
          status: 'pending',
          hours_estimated: 4,
          sort_order: 3,
          created_at: '2026-01-01',
          prerequisites: 'Linear Algebra, Classical Mechanics'
        }
      ]

      const inferred = inferDependenciesFromCurriculum(mockModules)
      expect(inferred.some(d => d.prerequisite_concept === 'Linear Algebra' && d.target_concept === 'Quantum Mechanics')).toBe(true)
      expect(inferred.some(d => d.prerequisite_concept === 'Classical Mechanics' && d.target_concept === 'Quantum Mechanics')).toBe(true)
    })
  })

  describe('buildConceptGraph', () => {
    it('constructs a complete knowledge graph with layers and statuses', () => {
      const dependencies: ConceptDependency[] = [
        { subject_id: 1, prerequisite_concept: 'Derivatives', target_concept: 'Chain Rule', weight: 1.0 },
        { subject_id: 1, prerequisite_concept: 'Chain Rule', target_concept: 'Backpropagation', weight: 1.0 },
        { subject_id: 1, prerequisite_concept: 'Matrix Multiplication', target_concept: 'Backpropagation', weight: 1.0 }
      ]

      const concepts: ConceptMastery[] = [
        { id: 1, user_id: 1, subject_id: 1, concept: 'Derivatives', mastery_prob: 0.90, observations: 8, updated_at: '2026-01-01' },
        { id: 2, user_id: 1, subject_id: 1, concept: 'Chain Rule', mastery_prob: 0.85, observations: 6, updated_at: '2026-01-01' },
        { id: 3, user_id: 1, subject_id: 1, concept: 'Matrix Multiplication', mastery_prob: 0.30, observations: 1, updated_at: '2026-01-01' },
        { id: 4, user_id: 1, subject_id: 1, concept: 'Backpropagation', mastery_prob: 0.20, observations: 0, updated_at: '2026-01-01' }
      ]

      const cards: Card[] = [
        { id: 10, subject_id: 1, type: 'flashcard', front: 'What is a derivative?', back: 'Rate of change', is_manual: 0, concept: 'Derivatives', created_at: '2026-01-01' },
        { id: 11, subject_id: 1, type: 'flashcard', front: 'What is backprop?', back: 'Gradient descent optimization', is_manual: 0, concept: 'Backpropagation', created_at: '2026-01-01' }
      ]

      const graph = buildConceptGraph({
        subjectId: 1,
        dependencies,
        concepts,
        cards,
        layoutWidth: 800,
        layoutHeight: 600,
        layoutMode: 'hierarchical'
      })

      expect(graph.nodes.length).toBe(4)
      expect(graph.edges.length).toBe(3)

      const derivativesNode = graph.nodes.find(n => n.id === 'derivatives')!
      const chainRuleNode = graph.nodes.find(n => n.id === 'chain rule')!
      const matrixNode = graph.nodes.find(n => n.id === 'matrix multiplication')!
      const backpropNode = graph.nodes.find(n => n.id === 'backpropagation')!

      expect(derivativesNode.status).toBe('mastered')
      expect(chainRuleNode.status).toBe('mastered')
      expect(matrixNode.status).toBe('gap')
      // Backprop has unmet prerequisite (Matrix Multiplication mastery = 0.30) so status must be 'blocked'
      expect(backpropNode.status).toBe('blocked')

      // Layering verification
      expect(derivativesNode.layer).toBe(0)
      expect(chainRuleNode.layer).toBe(1)
      expect(backpropNode.layer).toBeGreaterThan(chainRuleNode.layer!)

      // Coordinates
      expect(derivativesNode.x).toBeDefined()
      expect(derivativesNode.y).toBeDefined()

      // Matrix multiplication blocks Backpropagation, so it should be identified as a top bottleneck!
      expect(matrixNode.bottleneckScore).toBeGreaterThan(0)
      expect(graph.metrics.suggestedNextConcept).toBe('matrix multiplication')
    })

    it('safely handles circular dependencies without hanging', () => {
      const cyclicDeps: ConceptDependency[] = [
        { subject_id: 1, prerequisite_concept: 'Node A', target_concept: 'Node B' },
        { subject_id: 1, prerequisite_concept: 'Node B', target_concept: 'Node C' },
        { subject_id: 1, prerequisite_concept: 'Node C', target_concept: 'Node A' }
      ]

      const graph = buildConceptGraph({
        subjectId: 1,
        dependencies: cyclicDeps
      })

      expect(graph.nodes.length).toBe(3)
      expect(graph.edges.length).toBe(3)
    })
  })

  describe('getImpactedDownstreamConcepts & findShortestLearningPath', () => {
    const dependencies: ConceptDependency[] = [
      { subject_id: 1, prerequisite_concept: 'Algebra', target_concept: 'Functions' },
      { subject_id: 1, prerequisite_concept: 'Functions', target_concept: 'Calculus I' },
      { subject_id: 1, prerequisite_concept: 'Calculus I', target_concept: 'Differential Equations' }
    ]

    const graph = buildConceptGraph({
      subjectId: 1,
      dependencies
    })

    it('retrieves all downstream transitive concepts impacted', () => {
      const impactedByAlgebra = getImpactedDownstreamConcepts('Algebra', graph)
      const impactedIds = impactedByAlgebra.map(n => n.id)

      expect(impactedIds).toContain('functions')
      expect(impactedIds).toContain('calculus i')
      expect(impactedIds).toContain('differential equations')
    })

    it('finds shortest learning chain to target concept', () => {
      const path = findShortestLearningPath('Differential Equations', graph)
      expect(path.map(n => n.id)).toEqual(['algebra', 'functions', 'calculus i', 'differential equations'])
    })
  })
})
