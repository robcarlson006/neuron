export type FocusActionType = 'flashcards' | 'tutor_drill' | 'syllabus_read' | 'new_content'

export interface FocusCandidate {
  subjectId: number
  topicId?: number
  moduleId?: number
  actionType: FocusActionType
  targetTopic?: string | null
  recommendedMinutes: number
  reasonCode: string
  evidence: string
  successCriteria?: string
  fallbackAction?: string
}

export interface FocusItemInput {
  subject_id?: unknown
  topic_id?: unknown
  module_id?: unknown
  action_type?: unknown
  suggested_action?: unknown
  learning_objective?: unknown
  target_topic?: unknown
  estimated_minutes?: unknown
  priority?: unknown
  reason_code?: unknown
  evidence?: unknown
  success_criteria?: unknown
  fallback_action?: unknown
}

export interface ValidatedFocusItem {
  subject_id: number
  topic_id?: number
  module_id?: number
  action_type: FocusActionType
  suggested_action: string
  learning_objective: string
  target_topic: string | null
  estimated_minutes: number
  priority: number
  reason_code: string
  evidence: string
  success_criteria: string
  fallback_action: string
}

const ACTIONS = new Set<FocusActionType>(['flashcards', 'tutor_drill', 'syllabus_read', 'new_content'])

function candidateKey(candidate: { subjectId?: number; topicId?: number; actionType?: string }): string {
  return `${candidate.subjectId}:${candidate.topicId ?? 'none'}:${candidate.actionType ?? 'unknown'}`
}

export function validateFocusItems(
  rawItems: unknown,
  availableMinutes: number,
  candidates: FocusCandidate[]
): { items: ValidatedFocusItem[]; rejected: number } {
  if (!Array.isArray(rawItems)) return { items: [], rejected: 0 }
  const candidateMap = new Map(candidates.map(candidate => [candidateKey(candidate), candidate]))
  const seen = new Set<string>()
  const items: ValidatedFocusItem[] = []
  let remaining = Math.max(10, availableMinutes)
  let rejected = 0

  for (const raw of rawItems as FocusItemInput[]) {
    const subjectId = Number(raw.subject_id)
    const topicId = raw.topic_id == null ? undefined : Number(raw.topic_id)
    const actionType = typeof raw.action_type === 'string' ? raw.action_type as FocusActionType : undefined
    const candidate = actionType ? candidateMap.get(candidateKey({ subjectId, topicId, actionType })) : undefined
    const minutes = Number(raw.estimated_minutes)
    const key = candidate ? candidateKey(candidate) : ''
    if (!candidate || !ACTIONS.has(actionType!) || !Number.isFinite(minutes) || minutes < 5 || seen.has(key)) {
      rejected++
      continue
    }
    const boundedMinutes = Math.min(Math.floor(minutes), remaining)
    if (boundedMinutes < 5) {
      rejected++
      continue
    }
    seen.add(key)
    items.push({
      subject_id: candidate.subjectId,
      topic_id: candidate.topicId,
      module_id: candidate.moduleId,
      action_type: candidate.actionType,
      suggested_action: typeof raw.suggested_action === 'string' && raw.suggested_action.trim() ? raw.suggested_action.trim() : `${candidate.actionType} · ${candidate.targetTopic || 'study block'}`,
      learning_objective: typeof raw.learning_objective === 'string' && raw.learning_objective.trim() ? raw.learning_objective.trim() : candidate.evidence,
      target_topic: candidate.targetTopic || null,
      estimated_minutes: boundedMinutes,
      priority: Number.isFinite(Number(raw.priority)) ? Math.max(1, Math.min(3, Number(raw.priority))) : items.length + 1,
      reason_code: candidate.reasonCode,
      evidence: candidate.evidence,
      success_criteria: candidate.successCriteria || 'Complete the retrieval attempt and review the feedback.',
      fallback_action: candidate.fallbackAction || 'Switch to a shorter guided explanation, then retry retrieval.'
    })
    remaining -= boundedMinutes
    if (remaining < 5) break
  }

  return { items, rejected }
}

export function buildFocusCandidates(candidates: FocusCandidate[], availableMinutes: number): ValidatedFocusItem[] {
  const ordered = [...candidates].sort((a, b) => {
    const priority = (code: string): number => code === 'topic_due' ? 0 : code === 'card_due' ? 1 : code === 'misconception' ? 2 : code === 'new_content' ? 3 : 4
    return priority(a.reasonCode) - priority(b.reasonCode)
  })
  const raw = ordered.map(candidate => ({
    subject_id: candidate.subjectId,
    topic_id: candidate.topicId,
    module_id: candidate.moduleId,
    action_type: candidate.actionType,
    suggested_action: candidate.targetTopic ? `${candidate.actionType === 'new_content' ? 'Learn' : 'Review'} ${candidate.targetTopic}` : 'Study selected material',
    learning_objective: candidate.evidence,
    target_topic: candidate.targetTopic,
    estimated_minutes: candidate.recommendedMinutes,
    priority: 1
  }))
  const result = validateFocusItems(raw, availableMinutes, ordered)
  if (result.items.length > 0) {
    const total = result.items.reduce((sum, item) => sum + item.estimated_minutes, 0)
    const difference = Math.max(0, availableMinutes - total)
    if (difference >= 5) result.items[result.items.length - 1].estimated_minutes += difference
  }
  return result.items
}
