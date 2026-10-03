export type LearnerTurnState =
  | 'correct_confident'
  | 'correct_uncertain'
  | 'partial_understanding'
  | 'execution_slip'
  | 'conceptual_misconception'
  | 'off_topic'
  | 'help_request'
  | 'persistent_impasse'

export type TutorMove =
  | 'retrieval_question'
  | 'metacognitive_probe'
  | 'principle_hint'
  | 'partial_scaffold'
  | 'parallel_worked_example'
  | 'mirror_problem'
  | 'concise_explanation_and_reretrieval'

export interface TutorPolicyDecision {
  state: LearnerTurnState
  nextMove: TutorMove
  assistanceLevel: 0 | 1 | 2 | 3 | 4
  rationale: string
}

export function inferLearnerTurnState(answer: string, recentImpasses = 0): LearnerTurnState {
  const value = answer.trim().toLowerCase()
  if (recentImpasses >= 2) return 'persistent_impasse'
  if (!value) return 'help_request'
  if (/\b(i don't know|dont know|no idea|help|stuck|confused|can you explain|give me a hint)\b/.test(value)) return 'help_request'
  if (/\b(maybe|i think|not sure|probably|i guess|uncertain)\b/.test(value)) return 'correct_uncertain'
  if (/\b(irrelevant|unrelated|new question|different topic)\b/.test(value)) return 'off_topic'
  if (/\b(carry|borrow|sign|decimal|arithmetic|calculation|typed)\b/.test(value) && /\b(error|mistake|wrong|slip)\b/.test(value)) return 'execution_slip'
  if (/\b(but|however|because)\b/.test(value) && value.length < 90) return 'partial_understanding'
  return 'correct_confident'
}

export function chooseTutorMove(state: LearnerTurnState, recentImpasses = 0): TutorPolicyDecision {
  if (state === 'persistent_impasse' || recentImpasses >= 2) return { state: 'persistent_impasse', nextMove: 'concise_explanation_and_reretrieval', assistanceLevel: 4, rationale: 'Address the specific block, then immediately check retrieval with a fresh variant.' }
  if (state === 'help_request') return { state, nextMove: 'principle_hint', assistanceLevel: 1, rationale: 'Give the smallest useful hint before revealing a solution.' }
  if (state === 'correct_uncertain') return { state, nextMove: 'metacognitive_probe', assistanceLevel: 0, rationale: 'Check the learner’s reasoning and confidence before adding explanation.' }
  if (state === 'partial_understanding') return { state, nextMove: 'partial_scaffold', assistanceLevel: 2, rationale: 'Name what is right and scaffold only the missing step.' }
  if (state === 'execution_slip') return { state, nextMove: 'mirror_problem', assistanceLevel: 1, rationale: 'Separate procedural correction from conceptual mastery and retry a nearby item.' }
  if (state === 'conceptual_misconception') return { state, nextMove: 'parallel_worked_example', assistanceLevel: 3, rationale: 'Contrast the misconception with a worked example before asking for transfer.' }
  if (state === 'off_topic') return { state, nextMove: 'retrieval_question', assistanceLevel: 0, rationale: 'Acknowledge the scope change and return to the active learning objective.' }
  return { state, nextMove: 'retrieval_question', assistanceLevel: 0, rationale: 'Keep retrieval active and increase challenge only after evidence of understanding.' }
}

export function buildTutorPolicyBlock(answer: string, recentImpasses = 0): string {
  const decision = chooseTutorMove(inferLearnerTurnState(answer, recentImpasses), recentImpasses)
  return `\nTURN-BY-TURN LEARNING POLICY:\n- Provisional learner state: ${decision.state}\n- Required next move: ${decision.nextMove}\n- Assistance level: ${decision.assistanceLevel}/4\n- Rationale: ${decision.rationale}\n- Record what the learner demonstrated separately from what was supplied by the tutor. Do not award mastery from confidence, fluency, or a summary alone.`
}
