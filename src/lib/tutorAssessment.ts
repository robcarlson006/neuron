import type { LearningOutcome, TutorAssistanceLevel, TutorTurnAssessment } from '../types'

const OUTCOMES = new Set<LearningOutcome>(['correct', 'partial', 'incorrect', 'unassessed'])
const ASSISTANCE = new Set<TutorAssistanceLevel>(['none', 'hint', 'scaffold', 'worked_example', 'direct_answer', 'unassessed'])

export function buildTutorAssessmentPrompt(
  question: string,
  answer: string,
  concept: string,
  options?: { isTeachBack?: boolean; rubricKeyPoints?: string[] }
): string {
  const teachBackRules = options?.isTeachBack
    ? `\nThis is a REQUIRED TEACH-BACK. Assess whether the learner, in their own words, explains the central mechanism or relationship, gives one correct example or implication, and has no material misconception. A polished but copied, vague, or tutor-supplied answer does not pass.\nAdd these fields: "teach_back_status":"passed|needs_revision", "missing_elements":["concise missing requirement"], "own_words":true|false. Only use "passed" when every criterion is satisfied.`
    : ''

  const rubricBlock = options?.rubricKeyPoints && options.rubricKeyPoints.length > 0
    ? `\nRUBRIC KEY POINTS (check strictly which 0-indexed points the student clearly understood/demonstrated in their answer):\n${options.rubricKeyPoints.map((kp, idx) => `[${idx}] ${kp}`).join('\n')}\nAdd field: "key_points_hit":[0, 1, ...]`
    : ''

  return `Assess the student's answer for adaptive tutoring. Return JSON only.
Concept: ${concept}
Tutor question:
${question.slice(0, 6000)}
Student answer:
${answer.slice(0, 6000)}

Schema:
{"outcome":"correct|partial|incorrect|unassessed","score":0.0,"confidence":0.0,"assistance_level":"none|hint|scaffold|worked_example|direct_answer|unassessed","task_type":"recall|comprehension|application|analysis|synthesis|transfer","task_difficulty":0,"evidence_span":"short quote or paraphrase from answer","misconception":"optional concise hypothesis","followed_scaffold":true,"changed_goal":false${options?.rubricKeyPoints?.length ? ',"key_points_hit":[]' : ''}}
Rules: mark unassessed when the question or answer is ambiguous; semantic equivalence counts as correct; do not infer mastery from one response; confidence is confidence in this assessment, not student confidence.
For quantitative, calculation, or numerical problems: if the student uses a valid conceptual approach but arrives at an incorrect number or uses values from a previous prompt, mark outcome as 'partial' (with evidence_span noting the numerical discrepancy), NEVER 'correct'. Mark 'correct' only when both the conceptual logic and numerical value match.
For economics problems: strictly distinguish opportunity cost (the single highest value of the next-best forgone alternative) from sunk costs (unrecoverable past costs) and the sum of unchosen alternatives.
If the student states a true fact that does not answer the specific question asked (deflection), mark as 'partial' or 'unassessed', not 'correct'.${teachBackRules}${rubricBlock}`
}

export function parseTutorAssessment(
  raw: string,
  sessionId: number,
  concept: string,
  idempotencyKey: string,
  studentMessageId?: string,
  conceptId?: number
): TutorTurnAssessment {
  let parsed: Record<string, unknown> = {}
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0]) as Record<string, unknown>
  } catch { /* malformed model output remains unassessed */ }
  const outcome = OUTCOMES.has(parsed.outcome as LearningOutcome) ? parsed.outcome as LearningOutcome : 'unassessed'
  const assistanceLevel = ASSISTANCE.has(parsed.assistance_level as TutorAssistanceLevel) ? parsed.assistance_level as TutorAssistanceLevel : 'unassessed'
  const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null

  const keyPointsHit = Array.isArray(parsed.key_points_hit)
    ? parsed.key_points_hit.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0)
    : undefined

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
    idempotencyKey,
    conceptId,
    keyPointsHit
  }
}
