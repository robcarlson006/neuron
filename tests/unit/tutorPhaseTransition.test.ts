import { evaluateTutorPhaseTransition } from '../../electron/ipc/tutorHandlers'
import type { TutorTeachBackGate } from '../../src/types'

const gate: TutorTeachBackGate = {
  id: 7,
  sessionId: 42,
  topicId: 12,
  concept: 'Photosynthesis',
  status: 'pending',
  attemptCount: 1,
  feedback: 'Explain the energy conversion in your own words.',
  requiredAssessmentId: 9,
  passedAssessmentId: null
}

describe('authoritative Tutor phase transitions', () => {
  it('blocks structured Q&A to Socratic while a gate is pending', () => {
    expect(evaluateTutorPhaseTransition('structured_qa', 'socratic', gate)).toEqual({
      success: false,
      blockedByTeachBack: true,
      gate
    })
  })

  it('blocks Socratic to summary while revision is required', () => {
    expect(evaluateTutorPhaseTransition('socratic', 'summary', { ...gate, status: 'needs_revision' })).toMatchObject({
      success: false,
      blockedByTeachBack: true
    })
  })

  it('allows advancement when there is no active gate or the gate passed', () => {
    expect(evaluateTutorPhaseTransition('structured_qa', 'socratic', null)).toEqual({ success: true, gate: null })
    expect(evaluateTutorPhaseTransition('structured_qa', 'socratic', { ...gate, status: 'passed' })).toMatchObject({ success: true })
  })

  it('allows same-phase writes and rejects invalid phases', () => {
    expect(evaluateTutorPhaseTransition('structured_qa', 'structured_qa', gate)).toMatchObject({ success: true })
    expect(() => evaluateTutorPhaseTransition('structured_qa', 'complete', null)).toThrow('Invalid tutor phase transition')
  })
})
