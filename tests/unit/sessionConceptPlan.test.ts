import { parseDocumentTopology } from '../../src/lib/coverage/documentTopologyParser'
import {
  buildSessionLearningPlan,
  buildSessionConceptPrompt,
  formatSessionConceptPlan,
  parseSessionConceptInventory,
  resolveSessionPlanAssessmentConcept,
  selectBalancedSessionChunks,
  type SessionSourceChunk
} from '../../src/lib/sessionConceptPlan'

describe('session concept planning across selected materials', () => {
  const chunks: SessionSourceChunk[] = [
    { id: 'm1:c0', materialId: 1, chunk_index: 0, title: 'Lecture notes', text: 'Scarcity means limited resources force choices.' },
    { id: 'm2:c0', materialId: 2, chunk_index: 0, title: 'Chapter', text: 'Scarcity means limited resources force choices. Marginal analysis compares incremental benefit and cost.' },
    { id: 'm3:c0', materialId: 3, chunk_index: 0, title: 'Transcript', text: 'Price elasticity measures responsiveness of quantity demanded to price.' }
  ]

  it('consolidates overlapping concepts while retaining unique concepts and all source attribution', () => {
    const concepts = parseSessionConceptInventory(JSON.stringify({ concepts: [
      { label: 'Scarcity', summary: 'Resources are limited.', key_points: ['Limited resources'], source_chunk_ids: ['m1:c0'], teach_order_hint: 1 },
      { label: 'Scarcity', summary: 'Choice under constraints.', key_points: ['Choices have tradeoffs'], source_chunk_ids: ['m2:c0'], teach_order_hint: 1 },
      { label: 'Marginal Analysis', summary: 'Compare one more unit.', key_points: ['Compare marginal benefit and cost'], source_chunk_ids: ['m2:c0'], prerequisite_labels: ['Scarcity'], teach_order_hint: 2 },
      { label: 'Price Elasticity', summary: 'Responsiveness to price.', key_points: ['Measures quantity response'], source_chunk_ids: ['m3:c0'], teach_order_hint: 3 }
    ] }), chunks)

    expect(concepts.map(concept => concept.label)).toEqual(['Scarcity', 'Marginal Analysis', 'Price Elasticity'])
    expect(concepts[0].sourceMaterialIds).toEqual([1, 2])
    expect(concepts[0].keyPoints).toEqual(['Limited resources', 'Choices have tradeoffs'])
    expect(concepts[1].sourceMaterialIds).toEqual([2])
    expect(concepts[2].sourceMaterialIds).toEqual([3])
  })

  it('builds one complete concept inventory across controlled document contents', async () => {
    const plan = await buildSessionLearningPlan([1, 2, 3], [
      { id: 1, filename: 'Document A.md', content_text: 'Scarcity and opportunity cost.' },
      { id: 2, filename: 'Document B.pdf', content_text: 'Opportunity cost and marginal analysis.' },
      { id: 3, filename: 'Document C.pptx', content_text: 'Marginal analysis and price elasticity.' }
    ], async chunks => {
      expect(new Set(chunks.map(chunk => chunk.materialId))).toEqual(new Set([1, 2, 3]))
      const ids = chunks.map(chunk => chunk.id)
      return JSON.stringify({ concepts: [
        { label: 'Scarcity', summary: 'Resources are limited.', key_points: ['Limited resources'], source_chunk_ids: [ids[0]], teach_order_hint: 1 },
        { label: 'Opportunity Cost', summary: 'Value of the next best alternative.', key_points: ['Next best option forgone'], source_chunk_ids: [ids[0], ids[1]], teach_order_hint: 2 },
        { label: 'Marginal Analysis', summary: 'Compare the next benefit and cost.', key_points: ['Incremental comparison'], source_chunk_ids: [ids[1], ids[2]], prerequisite_labels: ['Opportunity Cost'], teach_order_hint: 3 },
        { label: 'Price Elasticity', summary: 'Responsiveness to price changes.', key_points: ['Measures quantity response'], source_chunk_ids: [ids[2]], teach_order_hint: 4 }
      ] })
    })

    expect(plan.status).toBe('ready')
    expect(plan.selectedMaterialIds).toEqual([1, 2, 3])
    expect(plan.concepts.map(concept => concept.label)).toEqual(['Scarcity', 'Opportunity Cost', 'Marginal Analysis', 'Price Elasticity'])
    expect(plan.concepts[1].sourceMaterialIds).toEqual([1, 2])
    expect(plan.concepts[3].sourceMaterialIds).toEqual([3])
  })

  it('marks a missing selected document incomplete instead of dropping it from the plan', async () => {
    const plan = await buildSessionLearningPlan([1, 2], [
      { id: 1, filename: 'Lecture 1.pptx', content_text: 'Scarcity means resources are limited.' }
    ], async chunks => JSON.stringify({ concepts: [
      { label: 'Scarcity', summary: 'Resources are limited.', key_points: ['Limited resources'], source_chunk_ids: [chunks[0].id] }
    ] }))

    expect(plan.status).toBe('incomplete')
    expect(plan.selectedMaterialIds).toEqual([1, 2])
    expect(plan.unprocessedMaterials).toEqual([{
      id: 2,
      filename: 'Material 2',
      reason: 'The selected material is unavailable in this subject.'
    }])
  })

  it('keeps the selected sources visible in the concept extraction request without using filenames as concepts', () => {
    const prompt = buildSessionConceptPrompt('Microeconomics', chunks)
    expect(prompt).toContain('SESSION-SCOPE RULES')
    expect(prompt).toMatch(/merge the same concept across chunks/i)
    expect(prompt).toContain('m3:c0')
    expect(prompt).not.toContain('Week 1 source')
  })

  it('distributes the bounded extraction budget across documents and flags partial sources', () => {
    const result = selectBalancedSessionChunks([
      { materialId: 1, chunks: Array.from({ length: 4 }, (_, index) => ({ ...chunks[0], id: `a${index}`, chunk_index: index })) },
      { materialId: 2, chunks: Array.from({ length: 4 }, (_, index) => ({ ...chunks[1], id: `b${index}`, chunk_index: index })) },
      { materialId: 3, chunks: Array.from({ length: 4 }, (_, index) => ({ ...chunks[2], id: `c${index}`, chunk_index: index })) }
    ], 6)
    expect(result.chunks.map(chunk => chunk.materialId)).toEqual([1, 2, 3, 1, 2, 3])
    expect(result.truncatedMaterialIds).toEqual([1, 2, 3])
  })

  it('reports an unavailable selected source in the persisted learning plan', () => {
    const notice = formatSessionConceptPlan({
      selectedMaterialIds: [1, 2],
      materialNames: { 1: 'Lecture 1.pptx', 2: 'Chapter 1.pdf' },
      processedMaterialIds: [1],
      unprocessedMaterials: [{ id: 2, filename: 'Chapter 1.pdf', reason: 'No extracted text is available for this file.' }],
      truncatedMaterialIds: [],
      concepts: [{ label: 'Scarcity', keyPoints: [], sourceMaterialIds: [1], sourceChunkIds: ['m1:c0'], prerequisiteLabels: [], teachOrder: 1 }],
      status: 'incomplete'
    })
    expect(notice).toContain('UNIFIED SELECTED-MATERIAL LEARNING PLAN')
    expect(notice).toContain('Chapter 1.pdf: No extracted text is available')
    expect(notice).toContain('Scarcity [sources: Lecture 1.pptx]')
  })

  it('tracks the concept targeted in the prior tutor turn, including later-source concepts', () => {
    const plan = {
      selectedMaterialIds: [1, 2], materialNames: {}, processedMaterialIds: [1, 2],
      unprocessedMaterials: [], truncatedMaterialIds: [], status: 'ready' as const,
      concepts: [
        { label: 'Scarcity', keyPoints: [], sourceMaterialIds: [1], sourceChunkIds: ['m1:c0'], prerequisiteLabels: [], teachOrder: 1 },
        { label: 'Price Elasticity', keyPoints: [], sourceMaterialIds: [2], sourceChunkIds: ['m2:c0'], prerequisiteLabels: [], teachOrder: 2 }
      ]
    }
    expect(resolveSessionPlanAssessmentConcept(plan)).toBe('Scarcity')
    expect(resolveSessionPlanAssessmentConcept(plan, 'Let us examine Price Elasticity next.')).toBe('Price Elasticity')
  })

  it.each([
    ['chapter.pdf', '# Scarcity\nResources are limited.'],
    ['lecture.pptx', '[Slide 1] Scarcity\nResources are limited.'],
    ['transcript.md', '# Lecture\nProfessor: Scarcity means resources are limited.']
  ])('chunks supported format %s through the existing parser', (filename, text) => {
    expect(parseDocumentTopology(text, filename).chunks.length).toBeGreaterThan(0)
  })
})
