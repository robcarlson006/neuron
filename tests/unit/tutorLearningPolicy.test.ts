import { chooseTutorMove, inferLearnerTurnState } from '../../src/lib/tutorLearningPolicy'

describe('tutor learning policy', () => {
  it('uses a small hint for an explicit help request', () => {
    expect(inferLearnerTurnState("I'm stuck, can I get a hint?")).toBe('help_request')
    expect(chooseTutorMove('help_request').nextMove).toBe('principle_hint')
  })

  it('switches from repeated questioning to targeted remediation', () => {
    const decision = chooseTutorMove('persistent_impasse', 2)
    expect(decision.nextMove).toBe('concise_explanation_and_reretrieval')
    expect(decision.assistanceLevel).toBe(4)
  })
})
