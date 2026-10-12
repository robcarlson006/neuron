import type { TutorTurnAssessment } from '../types'

export type LearnerTurnState =
  | 'opening_turn' | 'correct_confident' | 'correct_uncertain' | 'advanced_understanding'
  | 'partial_understanding' | 'execution_slip' | 'conceptual_misconception' | 'off_topic'
  | 'help_request' | 'explanation_request' | 'solution_request' | 'persistent_impasse'
  | 'unassessed_or_ambiguous'

export type TutorMove =
  | 'micro_teach_and_retrieve' | 'acknowledge_and_advance' | 'deepen_application'
  | 'metacognitive_probe' | 'partial_scaffold' | 'remediate_misconception' | 'mirror_problem'
  | 'principle_hint' | 'parallel_worked_example' | 'concise_explanation_and_reretrieval'
  | 'segmented_explanation' | 'scaffolded_solution' | 'clarification_probe'

export interface TutorPolicyDecision {
  state: LearnerTurnState
  nextMove: TutorMove
  assistanceLevel: 0 | 1 | 2 | 3 | 4
  rationale: string
  targetWordCount: { min: number; max: number; softLimit: number }
  requiresQuestion: boolean
  instructionalDirective: string
}

export interface TutorPolicyOptions {
  recentImpasses?: number
  consecutiveCorrect?: number
  isFirstTurn?: boolean
  isTeachBack?: boolean
}

const hesitation = /\b(maybe|i think|not sure|probably|i guess|uncertain|might be)\b/i
const executionCue = /\b(carry|borrow|sign|decimal|arithmetic|calculation|typed|copied|transcription)\b/i
const helpCue = /\b(i don't know|i do not know|dont know|no idea|help|stuck|hint|confused)\b/i
const explanationCue = /\b(explain|why does|why is|tell me about)\b/i
const solutionCue = /\b(give me the answer|show (?:me )?(?:the )?solution|what is the answer)\b/i
const offTopicCue = /\b(irrelevant|unrelated|new question|different topic)\b/i

export function inferLearnerTurnState(
  answer: string,
  assessmentOrImpasses?: Partial<TutorTurnAssessment> | number | null,
  options: TutorPolicyOptions = {},
): LearnerTurnState {
  // Preserve the original (answer, recentImpasses) call shape.
  if (typeof assessmentOrImpasses === 'number') options = { ...options, recentImpasses: assessmentOrImpasses }
  const assessment = typeof assessmentOrImpasses === 'object' ? assessmentOrImpasses : undefined
  const value = answer.trim().toLowerCase()
  if (options.isFirstTurn) return 'opening_turn'
  if ((options.recentImpasses ?? 0) >= 2 && assessment?.outcome !== 'correct' && assessment?.outcome !== 'partial') return 'persistent_impasse'

  if (assessment?.outcome === 'correct') {
    if (hesitation.test(value)) return 'correct_uncertain'
    if ((options.consecutiveCorrect ?? 0) >= 2 || (options.isTeachBack && assessment.teachBackStatus === 'passed')) return 'advanced_understanding'
    return 'correct_confident'
  }
  if (assessment?.outcome === 'partial') return 'partial_understanding'
  if (assessment?.outcome === 'incorrect') {
    if ((options.recentImpasses ?? 0) >= 2) return 'persistent_impasse'
    if (assessment.misconception?.trim()) return 'conceptual_misconception'
    if (executionCue.test(value)) return 'execution_slip'
    return 'conceptual_misconception'
  }

  if (!value) return 'help_request'
  if (helpCue.test(value)) return 'help_request'
  if (explanationCue.test(value)) return 'explanation_request'
  if (solutionCue.test(value)) return 'solution_request'
  if (offTopicCue.test(value)) return 'off_topic'
  if (assessment?.outcome === 'unassessed' || !assessment) return 'unassessed_or_ambiguous'
  return 'unassessed_or_ambiguous'
}

export function chooseTutorMove(state: LearnerTurnState, recentImpasses = 0): TutorPolicyDecision {
  const selected = recentImpasses >= 2 && state !== 'opening_turn' ? 'persistent_impasse' : state
  const table: Record<LearnerTurnState, [TutorMove, 0 | 1 | 2 | 3 | 4, string]> = {
    opening_turn: ['micro_teach_and_retrieve', 1, 'Introduce one small idea, then check retrieval.'],
    correct_confident: ['acknowledge_and_advance', 0, 'Acknowledge demonstrated understanding and advance one small step.'],
    correct_uncertain: ['metacognitive_probe', 0, 'Check the learner’s reasoning and confidence.'],
    advanced_understanding: ['deepen_application', 1, 'Extend understanding with a higher order transfer question.'],
    partial_understanding: ['partial_scaffold', 2, 'Name what is right and scaffold only the missing piece.'],
    execution_slip: ['mirror_problem', 1, 'Correct the procedure briefly and offer a nearby retry.'],
    conceptual_misconception: ['remediate_misconception', 3, 'Address the misconception with a brief counterexample and test a variant.'],
    off_topic: ['clarification_probe', 0, 'Briefly clarify the learning focus and return to the active objective.'],
    help_request: ['principle_hint', 1, 'Give the smallest useful hint without revealing the full answer.'],
    explanation_request: ['segmented_explanation', 2, 'Explain one or two small ideas and check understanding.'],
    solution_request: ['scaffolded_solution', 3, 'Model the key step, then ask the learner to complete a related step.'],
    persistent_impasse: ['concise_explanation_and_reretrieval', 4, 'Give a concise explanation and check retrieval with a fresh variant.'],
    unassessed_or_ambiguous: ['clarification_probe', 0, 'Ask a brief clarifying question before judging understanding.'],
  }
  const [nextMove, assistanceLevel, rationale] = table[selected]
  const targetWordCount = selected === 'explanation_request'
    ? { min: 50, max: 95, softLimit: 110 }
    : { min: 35, max: 80, softLimit: 100 }
  const moveText: Record<TutorMove, string> = {
    micro_teach_and_retrieve: 'Teach one small idea.', acknowledge_and_advance: 'Acknowledge the demonstrated answer briefly (1 sentence). Teach the next small idea.',
    deepen_application: 'Extend with a higher order application or counterfactual.', metacognitive_probe: 'Ask how confident the learner is and what reasoning supports the answer.',
    partial_scaffold: 'Acknowledge the correct part and scaffold the specific missing piece.', remediate_misconception: 'Use a brief counterexample to correct the misconception, then test a nearby variant.',
    mirror_problem: 'Correct the procedural slip briefly and give a nearby practice item.', principle_hint: 'Give one small useful hint without giving away the answer.',
    parallel_worked_example: 'Model one parallel example, then ask the learner to try a similar step.', concise_explanation_and_reretrieval: 'Explain the key idea concisely, then ask for retrieval on a fresh variant.',
    segmented_explanation: 'Explain 1–2 small ideas and finish with a check question.', scaffolded_solution: 'Model the key step without awarding mastery, then ask the learner to complete a related step.',
    clarification_probe: 'Ask one clarifying question before proceeding.',
  }
  const persistentImpasseDirective = selected === 'persistent_impasse'
    ? ' Do NOT repeat the previous question with similar wording. Pivot teaching strategy: model the specific step on a concrete micro-example (e.g. a 3-element list or parallel numbers) or offer a simpler diagnostic choice to break the impasse. End with ONE fresh question. Stay within 35–80 words.'
    : ''
  return { state: selected, nextMove, assistanceLevel, rationale, targetWordCount, requiresQuestion: true,
    instructionalDirective: `${moveText[nextMove]}${persistentImpasseDirective || ` End with exactly ONE active recall question. Stay within ${targetWordCount.min}–${targetWordCount.max} words.`}` }
}

export function buildTutorPolicyBlock(
  answer: string,
  assessmentOrImpasses?: Partial<TutorTurnAssessment> | number | null,
  options: TutorPolicyOptions = {},
): string {
  const recentImpasses = typeof assessmentOrImpasses === 'number' ? assessmentOrImpasses : (options.recentImpasses ?? 0)
  const decision = chooseTutorMove(inferLearnerTurnState(answer, assessmentOrImpasses, options), recentImpasses)
  return `\nTURN-BY-TURN LEARNING POLICY:\n- Provisional learner state: ${decision.state}\n- Required next move: ${decision.nextMove}\n- Assistance level: ${decision.assistanceLevel}/4\n- Rationale: ${decision.rationale}\n- Exact instructional directive: ${decision.instructionalDirective}\n- Strict response constraints: ${decision.targetWordCount.min}–${decision.targetWordCount.max} words (soft limit ${decision.targetWordCount.softLimit}); exactly 1 question.\n- Record what the learner demonstrated separately from what was supplied by the tutor. Do not award mastery from confidence, fluency, or a summary alone.`
}
