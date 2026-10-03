import type {
  AdaptiveConceptState,
  AdaptiveDecision,
  LearningOutcome,
  TutorAssistanceLevel
} from '../types'

export type TutorAction = AdaptiveDecision['action']

export interface AdaptiveEvidence {
  outcome: LearningOutcome
  confidence?: number
  assistanceLevel?: TutorAssistanceLevel
  taskType?: string
  taskDifficulty?: number
  retention?: number
  misconceptionRisk?: number
  validTask?: boolean
}

export interface AdaptiveInputs {
  concept: string
  mode: 'fixed' | 'adaptive'
  fixedLevel?: 1 | 2 | 3 | 4 | 5
  state?: Partial<AdaptiveConceptState>
  masteryProb?: number
  retention?: number
  misconceptionRisk?: number
  due?: boolean
  neverStudied?: boolean
  lastAction?: TutorAction
}

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
const clampScore = (value: number): number => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50))

export function levelForScore(score: number, previousLevel?: number): 1 | 2 | 3 | 4 | 5 {
  const value = clampScore(score)
  const prior = previousLevel && previousLevel >= 1 && previousLevel <= 5 ? previousLevel : undefined
  // Hysteresis: a level must be crossed by five points before moving away
  // from the current band. This prevents a noisy answer from thrashing UI.
  if (prior === 1) return value >= 25 ? 2 : 1
  if (prior === 2) return value >= 45 ? 3 : value < 15 ? 1 : 2
  if (prior === 3) return value >= 65 ? 4 : value < 35 ? 2 : 3
  if (prior === 4) return value >= 85 ? 5 : value < 55 ? 3 : 4
  if (prior === 5) return value < 75 ? 4 : 5
  if (value < 20) return 1
  if (value < 40) return 2
  if (value < 60) return 3
  if (value < 80) return 4
  return 5
}

export function initialAdaptiveScore(input: Pick<AdaptiveInputs, 'masteryProb' | 'retention' | 'misconceptionRisk' | 'neverStudied'>): number {
  const mastery = input.masteryProb ?? 0.3
  const retention = input.retention ?? mastery
  const misconception = input.misconceptionRisk ?? 0
  const base = (clamp(mastery) * 0.55 + clamp(retention) * 0.3 + (1 - clamp(misconception)) * 0.15) * 100
  return clampScore(input.neverStudied ? Math.min(base, 25) : base)
}

export function updateAdaptiveState(state: AdaptiveConceptState, evidence: AdaptiveEvidence): AdaptiveConceptState {
  const confidence = clamp(evidence.confidence ?? 0.5)
  const validTask = evidence.validTask !== false
  const assistance = evidence.assistanceLevel ?? 'none'
  const assistancePenalty: Record<TutorAssistanceLevel, number> = {
    none: 0,
    hint: 0.35,
    scaffold: 0.5,
    worked_example: 0.8,
    direct_answer: 1,
    unassessed: 1
  }
  const outcomeDelta: Record<LearningOutcome, number> = {
    correct: 8,
    partial: 2,
    incorrect: -9,
    unassessed: 0
  }
  const rawDelta = validTask ? outcomeDelta[evidence.outcome] : 0
  const effectiveDelta = rawDelta * (1 - assistancePenalty[assistance]) * (0.35 + confidence * 0.65)
  const retentionPenalty = evidence.retention !== undefined && evidence.retention < 0.45 && evidence.outcome !== 'incorrect' ? -2 : 0
  const misconceptionPenalty = (evidence.misconceptionRisk ?? state.misconceptionRisk ?? 0) * -4
  const delta = evidence.outcome === 'unassessed' ? 0 : effectiveDelta + retentionPenalty + misconceptionPenalty
  const observations = state.observations + (evidence.outcome === 'unassessed' ? 0 : 1)
  const confidenceGain = evidence.outcome === 'unassessed' ? 0 : 0.08 * confidence
  return {
    ...state,
    score: clampScore(state.score + delta),
    uncertainty: clamp(state.uncertainty - confidenceGain + (evidence.outcome === 'unassessed' ? 0.03 : 0), 0.05, 1),
    observations,
    correctCount: state.correctCount + (evidence.outcome === 'correct' ? 1 : 0),
    partialCount: state.partialCount + (evidence.outcome === 'partial' ? 1 : 0),
    incorrectCount: state.incorrectCount + (evidence.outcome === 'incorrect' ? 1 : 0),
    lastOutcome: evidence.outcome,
    lastAssistance: assistance,
    lastTaskType: evidence.taskType || state.lastTaskType,
    retention: evidence.retention ?? state.retention,
    misconceptionRisk: evidence.misconceptionRisk ?? state.misconceptionRisk,
    lastAssessedAt: new Date().toISOString()
  }
}

function chooseAction(input: AdaptiveInputs, level: 1 | 2 | 3 | 4 | 5): TutorAction {
  if (input.due || (input.retention !== undefined && input.retention < 0.5)) return 'interleaved_review'
  if ((input.misconceptionRisk ?? 0) >= 0.55) return level >= 4 ? 'counterexample' : 'hint_scaffold'
  if (input.neverStudied || level === 1) return 'explain'
  if (level === 2) return 'guided_application'
  if (level === 3) return input.lastAction === 'guided_application' ? 'parallel_problem' : 'basic_retrieval'
  if (level === 4) return 'counterexample'
  return input.lastAction === 'teach_back' ? 'novel_transfer' : 'teach_back'
}

export function decideAdaptiveDifficulty(input: AdaptiveInputs): AdaptiveDecision {
  const state = input.state
  const score = input.mode === 'fixed'
    ? ((input.fixedLevel ?? 3) - 1) * 25
    : state?.score ?? initialAdaptiveScore(input)
  const level = input.mode === 'fixed' ? (input.fixedLevel ?? 3) : levelForScore(score, state?.score !== undefined ? levelForScore(state.score) : undefined)
  const action = chooseAction(input, level)
  const target = action === 'novel_transfer' || action === 'counterexample'
    ? [0.45, 0.65]
    : action === 'interleaved_review'
      ? [0.7, 0.85]
      : level <= 2
        ? [0.55, 0.7]
        : [0.7, 0.85]
  const reasons: string[] = []
  if (input.due || (input.retention !== undefined && input.retention < 0.5)) reasons.push('retention is fading')
  if ((input.misconceptionRisk ?? 0) >= 0.55) reasons.push('an active misconception needs testing')
  if (input.mode === 'fixed') reasons.push(`manual level ${level} selected`)
  else if (!state || (state.observations ?? 0) < 3) reasons.push('calibrating from limited evidence')
  else reasons.push(`recent performance supports ${level}/5 challenge`)
  return {
    concept: input.concept,
    mode: input.mode,
    score: clampScore(score),
    visibleLevel: level,
    uncertainty: state?.uncertainty ?? 0.75,
    targetSuccessMin: target[0],
    targetSuccessMax: target[1],
    action,
    reason: reasons.join('; '),
    retentionStatus: input.due ? 'due' : input.retention !== undefined && input.retention < 0.5 ? 'fading' : 'stable'
  }
}

export function defaultAdaptiveState(userId: number, subjectId: number, concept: string, input: Pick<AdaptiveInputs, 'masteryProb' | 'retention' | 'misconceptionRisk' | 'neverStudied'> = {}): AdaptiveConceptState {
  return {
    userId,
    subjectId,
    concept,
    score: initialAdaptiveScore(input),
    uncertainty: 0.85,
    observations: 0,
    correctCount: 0,
    partialCount: 0,
    incorrectCount: 0,
    lastOutcome: 'unassessed',
    lastAssistance: 'unassessed',
    retention: input.retention,
    misconceptionRisk: input.misconceptionRisk
  }
}
