export type GuidedPhase =
  | 'orient'
  | 'attempt'
  | 'checkpoint'
  | 'feedback'
  | 'explain'
  | 'reattempt'
  | 'transfer'
  | 'review'

export type GuidedHintLevel = 0 | 1 | 2 | 3 | 4
export type GuidedAssistanceLevel = 'none' | 'hint' | 'worked_example' | 'direct_answer' | 'unassessed'

export interface GuidedEvaluation {
  status: 'correct' | 'partial' | 'incorrect' | 'unassessed'
  error_type?: string
  feedback: string
  next_move: 'advance' | 'retry' | 'explain' | 'review'
  hint_level: GuidedHintLevel
  learner_prompt: string
  principles?: string[]
  identified_errors?: string[]
}

export interface GuidedSessionState {
  phase: GuidedPhase
  hintLevel: GuidedHintLevel
  assistanceLevel: GuidedAssistanceLevel
  currentSubgoal: number
  subgoalCount: number
  transferAttempted: boolean
  transferCompleted: boolean
  answerRevealed: boolean
}

export function initialGuidedState(subgoalCount: number): GuidedSessionState {
  return {
    phase: 'orient',
    hintLevel: 0,
    assistanceLevel: 'none',
    currentSubgoal: 0,
    subgoalCount: Math.max(1, subgoalCount),
    transferAttempted: false,
    transferCompleted: false,
    answerRevealed: false
  }
}

export function assistanceForHint(level: GuidedHintLevel): GuidedAssistanceLevel {
  if (level === 0) return 'none'
  if (level < 4) return 'hint'
  return 'worked_example'
}

export function nextHintLevel(current: GuidedHintLevel): GuidedHintLevel {
  return Math.min(4, current + 1) as GuidedHintLevel
}

export function applyGuidedEvaluation(state: GuidedSessionState, evaluation: GuidedEvaluation): GuidedSessionState {
  const next = { ...state }
  next.hintLevel = Math.max(state.hintLevel, evaluation.hint_level) as GuidedHintLevel
  next.assistanceLevel = assistanceForHint(next.hintLevel)
  if (evaluation.status === 'correct') {
    if (state.currentSubgoal + 1 < state.subgoalCount) {
      next.currentSubgoal = state.currentSubgoal + 1
      next.phase = 'checkpoint'
    } else {
      next.phase = 'explain'
    }
  } else if (evaluation.next_move === 'explain') next.phase = 'explain'
  else if (evaluation.next_move === 'review') next.phase = 'review'
  else next.phase = 'feedback'
  return next
}

export function markSelfExplanation(state: GuidedSessionState): GuidedSessionState {
  return { ...state, phase: 'reattempt' }
}

export function markTransferStarted(state: GuidedSessionState): GuidedSessionState {
  return { ...state, phase: 'transfer', transferAttempted: true }
}

export function markTransferCompleted(state: GuidedSessionState): GuidedSessionState {
  return { ...state, phase: 'review', transferCompleted: true }
}

export function markAnswerRevealed(state: GuidedSessionState): GuidedSessionState {
  return { ...state, phase: 'reattempt', answerRevealed: true, assistanceLevel: 'direct_answer', hintLevel: 4 }
}

export function summarizeGuidedOutcome(state: GuidedSessionState): {
  masteryStatus: 'independent' | 'assisted' | 'answer_revealed' | 'unassessed'
  transferCompleted: boolean
} {
  const masteryStatus = state.answerRevealed
    ? 'answer_revealed'
    : state.assistanceLevel === 'none'
      ? 'independent'
      : state.assistanceLevel === 'unassessed' ? 'unassessed' : 'assisted'
  return { masteryStatus, transferCompleted: state.transferCompleted }
}
