import { buildTutorPolicyBlock, chooseTutorMove, inferLearnerTurnState } from '../../src/lib/tutorLearningPolicy'

describe('tutor learning policy', () => {
  it('uses a small hint for an explicit help request', () => {
    expect(inferLearnerTurnState("I'm stuck, can I get a hint?")).toBe('help_request')
    expect(chooseTutorMove('help_request').nextMove).toBe('principle_hint')
  })

  it('uses assessment correctness instead of confident wording', () => {
    expect(inferLearnerTurnState('The capital of France is Berlin.', { outcome: 'incorrect' })).toBe('conceptual_misconception')
  })

  it('marks a correct but hesitant answer as uncertain', () => {
    expect(inferLearnerTurnState('I think it is 12, maybe.', { outcome: 'correct' })).toBe('correct_uncertain')
  })

  it('advances consecutive correct answers into higher order application', () => {
    expect(inferLearnerTurnState('It is 12.', { outcome: 'correct' }, { consecutiveCorrect: 2 })).toBe('advanced_understanding')
    expect(chooseTutorMove('advanced_understanding').nextMove).toBe('deepen_application')
  })

  it('scaffolds partial understanding', () => {
    expect(inferLearnerTurnState('The first step is right.', { outcome: 'partial' })).toBe('partial_understanding')
    expect(chooseTutorMove('partial_understanding').nextMove).toBe('partial_scaffold')
  })

  it('recovers from repeated impasses with high assistance', () => {
    const decision = chooseTutorMove('persistent_impasse', 2)
    expect(decision.nextMove).toBe('concise_explanation_and_reretrieval')
    expect(decision.assistanceLevel).toBe(4)
    expect(inferLearnerTurnState('I keep getting it wrong.', { outcome: 'incorrect' }, { recentImpasses: 2 })).toBe('persistent_impasse')
    expect(decision.instructionalDirective).toContain('Do NOT repeat the previous question with similar wording')
    expect(decision.instructionalDirective).toContain('Pivot teaching strategy')
    expect(decision.instructionalDirective).toContain('concrete micro-example')
    expect(decision.instructionalDirective).toContain('ONE fresh question')
    expect(decision.instructionalDirective).toContain('Stay within 35–80 words')
  })

  it('segments an explanation request', () => {
    expect(inferLearnerTurnState('Can you explain why this works?')).toBe('explanation_request')
    const decision = chooseTutorMove('explanation_request')
    expect(decision.nextMove).toBe('segmented_explanation')
    expect(decision.targetWordCount).toEqual({ min: 50, max: 95, softLimit: 110 })
  })

  it('does not infer correctness from an unassessed answer', () => {
    expect(inferLearnerTurnState('The answer is definitely 42.')).toBe('unassessed_or_ambiguous')
    expect(inferLearnerTurnState('The answer is 42.', { outcome: 'unassessed' })).toBe('unassessed_or_ambiguous')
  })

  it('supports opening, solution, and legacy caller behavior', () => {
    expect(inferLearnerTurnState('Anything', undefined, { isFirstTurn: true })).toBe('opening_turn')
    expect(inferLearnerTurnState('Show me the solution')).toBe('solution_request')
    expect(inferLearnerTurnState('Anything', 2)).toBe('persistent_impasse')
    expect(buildTutorPolicyBlock('I am stuck', 0)).toContain('Required next move: principle_hint')
    expect(buildTutorPolicyBlock('It is 3', { outcome: 'correct' }, { consecutiveCorrect: 2 })).toContain('Required next move: deepen_application')
  })

  it('provides a complete directive and response constraints', () => {
    const decision = chooseTutorMove('correct_confident')
    expect(decision.requiresQuestion).toBe(true)
    expect(decision.targetWordCount).toEqual({ min: 35, max: 80, softLimit: 100 })
    expect(decision.instructionalDirective).toContain('exactly ONE active recall question')
    expect(buildTutorPolicyBlock('Sure', { outcome: 'correct' })).toContain('Strict response constraints: 35–80 words')
  })
})
