import { buildTutorContext } from '../../src/lib/tutorContextBuilder'

describe('TutorContextBuilder', () => {
  it('keeps source identifiers attached while budgeting context', () => {
    const result = buildTutorContext({
      query: 'How does binary search maintain its invariant?',
      subjectId: 1,
      sessionId: 2,
      history: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' }
      ],
      memories: [{
        id: 4,
        memoryType: 'semantic_fact',
        memoryKey: 'binary search',
        value: { confidence: 'needs diagrams' },
        confidence: 0.8,
        status: 'active'
      }],
      evidence: [{
        materialId: 7,
        chunkIndex: 3,
        sourceLabel: 'Algorithms · Searching',
        text: 'The invariant is that the target, if present, remains within the search interval.',
        score: 0.92,
        retrievalMode: 'hybrid'
      }]
    }, 1200)

    expect(result.messages[0].content).toContain('[SOURCE 7:3]')
    expect(result.messages[0].content).toContain('[MEMORY semantic_fact:binary search')
    expect(result.messages.at(-1)?.content).toContain('binary search')
    expect(result.budget.usedTokens).toBeLessThanOrEqual(1200)
  })

  it('truncates oversized sections instead of dropping the system instruction', () => {
    const result = buildTutorContext({
      query: 'Explain this.',
      subjectId: 1,
      sessionId: 2,
      systemInstruction: 'Important instruction '.repeat(1000)
    }, 1000)

    expect(result.messages[0].content).toContain('Important instruction')
    expect(result.budget.truncatedSections).toContain('system')
  })
})
