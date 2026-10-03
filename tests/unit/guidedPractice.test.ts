import {
  applyGuidedEvaluation,
  assistanceForHint,
  initialGuidedState,
  markAnswerRevealed,
  markSelfExplanation,
  markTransferCompleted,
  nextHintLevel,
  summarizeGuidedOutcome
} from '../../src/lib/guidedPractice'

describe('guided practice state machine', () => {
  it('starts with an independent orientation and no assistance', () => {
    expect(initialGuidedState(3)).toMatchObject({ phase: 'orient', hintLevel: 0, assistanceLevel: 'none', subgoalCount: 3 })
  })

  it('escalates hints without exceeding the worked-step level', () => {
    expect(nextHintLevel(0)).toBe(1)
    expect(nextHintLevel(4)).toBe(4)
    expect(assistanceForHint(1)).toBe('hint')
    expect(assistanceForHint(3)).toBe('hint')
    expect(assistanceForHint(4)).toBe('worked_example')
  })

  it('requires explanation after the final subgoal and moves to retry', () => {
    const state = initialGuidedState(1)
    const after = applyGuidedEvaluation(state, {
      status: 'correct', feedback: 'Good setup.', next_move: 'explain', hint_level: 0,
      learner_prompt: 'Explain why this principle applies.'
    })
    expect(after.phase).toBe('explain')
    expect(markSelfExplanation(after).phase).toBe('reattempt')
  })

  it('distinguishes independent, assisted, and answer-revealed outcomes', () => {
    expect(summarizeGuidedOutcome(initialGuidedState(1)).masteryStatus).toBe('independent')
    const assisted = { ...initialGuidedState(1), assistanceLevel: 'hint' as const }
    expect(summarizeGuidedOutcome(assisted).masteryStatus).toBe('assisted')
    expect(summarizeGuidedOutcome(markAnswerRevealed(initialGuidedState(1))).masteryStatus).toBe('answer_revealed')
  })

  it('marks transfer completion as a review-ready outcome', () => {
    const state = { ...initialGuidedState(1), phase: 'transfer' as const, transferAttempted: true }
    const complete = markTransferCompleted(state)
    expect(complete.phase).toBe('review')
    expect(summarizeGuidedOutcome(complete).transferCompleted).toBe(true)
  })
})
