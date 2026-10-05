import type { LearningOutcome, TutorAssistanceLevel, TutorTurnAssessment } from '../types'

const OUTCOMES = new Set<LearningOutcome>(['correct', 'partial', 'incorrect', 'unassessed'])
const ASSISTANCE = new Set<TutorAssistanceLevel>(['none', 'hint', 'scaffold', 'worked_example', 'direct_answer', 'unassessed'])

export function buildTutorAssessmentPrompt(question: string, answer: string, concept: string, options?: { isTeachBack?: boolean }): string {
  const teachBackRules = options?.isTeachBack
    ? `\nThis is a REQUIRED TEACH-BACK. Assess whether the learner, in their own words, explains the central mechanism or relationship, gives one correct example or implication, and has no material misconception. A polished but copied, vague, or tutor-supplied answer does not pass.\nAdd these fields: "teach_back_status":"passed|needs_revision", "missing_elements":["concise missing requirement"], "own_words":true|false. Only use "passed" when every criterion is satisfied.`
    : ''
  return `Assess the student's answer for adaptive tutoring. Return JSON only.
Concept: ${concept}
Tutor question:
${question.slice(0, 6000)}
Student answer:
${answer.slice(0, 6000)}

Schema:
{"outcome":"correct|partial|incorrect|unassessed","score":0.0,"confidence":0.0,"assistance_level":"none|hint|scaffold|worked_example|direct_answer|unassessed","task_type":"recall|comprehension|application|analysis|synthesis|transfer","task_difficulty":0,"evidence_span":"short quote or paraphrase from answer","misconception":"optional concise hypothesis","followed_scaffold":true,"changed_goal":false}
Rules: mark unassessed when the question or answer is ambiguous; semantic equivalence counts as correct; do not infer mastery from one response; confidence is confidence in this assessment, not student confidence.${teachBackRules}`
}

export function parseTutorAssessment(raw: string, sessionId: number, concept: string, idempotencyKey: string, studentMessageId?: string): TutorTurnAssessment {
  let parsed: Record<string, unknown> = {}
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0]) as Record<string, unknown>
  } catch { /* malformed model output remains unassessed */ }
  const outcome = OUTCOMES.has(parsed.outcome as LearningOutcome) ? parsed.outcome as LearningOutcome : 'unassessed'
  const assistanceLevel = ASSISTANCE.has(parsed.assistance_level as TutorAssistanceLevel) ? parsed.assistance_level as TutorAssistanceLevel : 'unassessed'
  const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null
  return {
    sessionId,
    studentMessageId,
    concept,
    outcome,
    score: numberOrNull(parsed.score),
    confidence: numberOrNull(parsed.confidence) ?? 0,
    assistanceLevel,
    taskType: typeof parsed.task_type === 'string' ? parsed.task_type : undefined,
    taskDifficulty: typeof parsed.task_difficulty === 'number' ? Math.max(0, Math.min(100, parsed.task_difficulty)) : undefined,
    evidenceSpan: typeof parsed.evidence_span === 'string' ? parsed.evidence_span.slice(0, 500) : undefined,
    misconception: typeof parsed.misconception === 'string' ? parsed.misconception.slice(0, 500) : undefined,
    followedScaffold: typeof parsed.followed_scaffold === 'boolean' ? parsed.followed_scaffold : undefined,
    changedGoal: typeof parsed.changed_goal === 'boolean' ? parsed.changed_goal : undefined,
    teachBackStatus: parsed.teach_back_status === 'passed' || parsed.teach_back_status === 'needs_revision'
      ? parsed.teach_back_status
      : undefined,
    missingElements: Array.isArray(parsed.missing_elements)
      ? parsed.missing_elements.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 240)).slice(0, 5)
      : undefined,
    ownWords: typeof parsed.own_words === 'boolean' ? parsed.own_words : undefined,
    idempotencyKey
  }
}
