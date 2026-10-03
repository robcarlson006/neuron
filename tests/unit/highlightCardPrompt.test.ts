import { buildHighlightCardPrompt } from '../../src/lib/highlightCardPrompt'

describe('highlight card prompt', () => {
  it('requires grammar correction and grounds the card in the full material context', () => {
    const prompt = buildHighlightCardPrompt('Economics', 'typed learner note', 'lecture.pptx', {
      highlightText: 'scarcity make choices hard',
      sourceContext: 'Scarcity means resources are limited relative to unlimited wants.',
      materialTitle: 'lecture.pptx'
    })

    expect(prompt).toContain('<learner_highlight>\nscarcity make choices hard')
    expect(prompt).toContain('<source_context>\nScarcity means resources are limited')
    expect(prompt).toContain('correct the learner highlight\'s spelling, grammar, punctuation')
    expect(prompt).toContain('"normalizedText"')
    expect(prompt).toContain('grounded only in the source context')
  })

  it('includes optional feedback and the previous card only during revision', () => {
    const prompt = buildHighlightCardPrompt('Economics', 'note', 'lecture.pptx', {
      highlightText: 'note',
      sourceContext: 'context',
      feedback: 'Make the question more specific.',
      previousCard: { front: 'Old front', back: 'Old back', type: 'flashcard' }
    })

    expect(prompt).toContain('Learner feedback:\nMake the question more specific.')
    expect(prompt).toContain('Previous card front: Old front')
    expect(prompt).toContain('Previous card back: Old back')
  })
})
