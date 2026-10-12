import {
  buildConceptExtractionPrompt,
  parseExtractedConcepts
} from '../../src/lib/coverage/conceptExtractor'

describe('conceptExtractor', () => {
  const dummyChunks = [
    { id: 'chunk_1', chunk_index: 0, text: 'Introduction to photosynthesis and chloroplasts.' },
    { id: 'chunk_2', chunk_index: 1, text: 'Light-dependent reactions and ATP generation.' },
    { id: 'chunk_3', chunk_index: 2, text: 'Calvin cycle and carbon fixation.' }
  ]

  it('generates an extraction prompt referencing all chunks', () => {
    const prompt = buildConceptExtractionPrompt('Photosynthesis', dummyChunks)
    expect(prompt).toContain('Photosynthesis')
    expect(prompt).toContain('chunk_1')
    expect(prompt).toContain('chunk_2')
    expect(prompt).toContain('chunk_3')
  })

  it('parses valid AI extraction and establishes topological teaching order', () => {
    const rawJson = JSON.stringify({
      concepts: [
        {
          label: 'Calvin Cycle',
          summary: 'Carbon fixation stage.',
          key_points: ['Rubisco enzyme role', 'ATP and NADPH usage'],
          source_chunk_ids: ['chunk_3'],
          prerequisite_labels: ['Light Reactions'],
          teach_order_hint: 2
        },
        {
          label: 'Light Reactions',
          summary: 'Light energy conversion.',
          key_points: ['Thylakoid membrane role', 'Splitting of water'],
          source_chunk_ids: ['chunk_1', 'chunk_2'],
          prerequisite_labels: [],
          teach_order_hint: 1
        }
      ]
    })

    const parsed = parseExtractedConcepts(rawJson, dummyChunks)
    expect(parsed).toHaveLength(2)
    // Teaching order should put prerequisite Light Reactions first
    expect(parsed[0].label).toBe('Light Reactions')
    expect(parsed[0].teach_order).toBe(1)
    expect(parsed[1].label).toBe('Calvin Cycle')
    expect(parsed[1].teach_order).toBe(2)
    expect(parsed[0].content_hash).toBeDefined()
  })

  it('guarantees 100% material coverage by creating an orphan concept for missed chunks', () => {
    // Model only extracted chunk_1 and chunk_2, missed chunk_3
    const rawJson = JSON.stringify({
      concepts: [
        {
          label: 'Light Reactions',
          summary: 'Energy stage',
          key_points: ['Photons hit chlorophyll'],
          source_chunk_ids: ['chunk_1', 'chunk_2']
        }
      ]
    })

    const parsed = parseExtractedConcepts(rawJson, dummyChunks)
    expect(parsed.length).toBeGreaterThanOrEqual(2)
    const orphanConcept = parsed.find((c) => c.source_chunk_ids.includes('chunk_3'))
    expect(orphanConcept).toBeDefined()
    expect(orphanConcept?.label).toContain('Supplementary')
  })
})
