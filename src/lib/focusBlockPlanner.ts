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

/**
 * Resolve a user-provided Focus Block subject selection against the active
 * subject universe. An omitted or empty selection intentionally means all
 * available subjects; a non-empty selection with no valid matches means none.
 */
export function selectFocusSubjects<T extends { id: number }>(subjects: T[], subjectIds?: number[]): T[] {
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) return subjects
  const requestedIds = new Set(subjectIds.map(Number).filter(id => Number.isInteger(id)))
  return subjects.filter(subject => requestedIds.has(subject.id))
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

export interface FocusValidationOptions {
  requireExactDuration?: boolean
}

const ACTIONS = new Set<FocusActionType>(['flashcards', 'tutor_drill', 'syllabus_read', 'new_content'])

function candidateKey(candidate: { subjectId?: number; topicId?: number; actionType?: string }): string {
  return `${candidate.subjectId}:${candidate.topicId ?? 'none'}:${candidate.actionType ?? 'unknown'}`
}

export function validateFocusItems(
  rawItems: unknown,
  availableMinutes: number,
  candidates: FocusCandidate[],
  options: FocusValidationOptions = {}
): { items: ValidatedFocusItem[]; rejected: number } {
  if (!Array.isArray(rawItems)) return { items: [], rejected: 0 }
  if (options.requireExactDuration) {
    const rawMinutes = rawItems.reduce((sum, raw) => {
      const minutes = Number((raw as FocusItemInput)?.estimated_minutes)
      return Number.isFinite(minutes) ? sum + Math.floor(minutes) : sum
    }, 0)
    if (rawMinutes !== Math.max(10, availableMinutes)) {
      return { items: [], rejected: rawItems.length }
    }
  }
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

export function focusItemsTotalMinutes(items: Pick<ValidatedFocusItem, 'estimated_minutes'>[]): number {
  return items.reduce((sum, item) => sum + item.estimated_minutes, 0)
}

export function hasExactFocusDuration(
  items: Pick<ValidatedFocusItem, 'estimated_minutes'>[],
  availableMinutes: number
): boolean {
  return focusItemsTotalMinutes(items) === Math.max(10, availableMinutes)
}

function candidateToRawItem(candidate: FocusCandidate, minutes: number): FocusItemInput {
  return {
    subject_id: candidate.subjectId,
    topic_id: candidate.topicId,
    module_id: candidate.moduleId,
    action_type: candidate.actionType,
    suggested_action: candidate.targetTopic
      ? `${candidate.actionType === 'new_content' ? 'Learn' : 'Review'} ${candidate.targetTopic}`
      : candidate.actionType === 'tutor_drill' ? 'Guided retrieval and synthesis practice' : 'Study selected material',
    learning_objective: candidate.evidence,
    target_topic: candidate.targetTopic,
    estimated_minutes: minutes,
    priority: 1
  }
}

/**
 * Compose a deterministic plan whose duration is always exact. Continuation
 * candidates are only used after all canonical work has been considered.
 */
export function buildExactFocusPlan(
  candidates: FocusCandidate[],
  availableMinutes: number,
  continuationCandidates: FocusCandidate[] = []
): ValidatedFocusItem[] {
  const targetMinutes = Math.max(10, availableMinutes)
  const ordered = [...candidates, ...continuationCandidates]
  const unique = ordered.filter((candidate, index) =>
    ordered.findIndex(other => candidateKey(other) === candidateKey(candidate)) === index
  )
  const sorted = unique.sort((a, b) => {
    const priority = (code: string): number => code === 'topic_due' ? 0 : code === 'card_due' ? 1 : code === 'misconception' ? 2 : code === 'new_content' ? 3 : 4
    return priority(a.reasonCode) - priority(b.reasonCode)
  })

  const rawItems: FocusItemInput[] = []
  let remaining = targetMinutes
  for (const candidate of sorted) {
    if (remaining <= 0) break
    const recommended = Math.max(5, Math.floor(candidate.recommendedMinutes || 15))
    const minutes = Math.min(recommended, remaining)
    if (minutes < 5) continue
    rawItems.push(candidateToRawItem(candidate, minutes))
    remaining -= minutes
  }

  // For small remainders, preserve the exact invariant by allocating them to
  // the most recently selected step rather than leaving unusable minutes.
  if (remaining > 0 && rawItems.length > 0) {
    rawItems[rawItems.length - 1].estimated_minutes = Number(rawItems[rawItems.length - 1].estimated_minutes) + remaining
    remaining = 0
  }

  const result = validateFocusItems(rawItems, targetMinutes, sorted)
  return hasExactFocusDuration(result.items, targetMinutes) ? result.items : []
}

export function buildFocusCandidates(candidates: FocusCandidate[], availableMinutes: number): ValidatedFocusItem[] {
  const ordered = [...candidates].sort((a, b) => {
    const priority = (code: string): number => code === 'topic_due' ? 0 : code === 'card_due' ? 1 : code === 'misconception' ? 2 : code === 'new_content' ? 3 : 4
    return priority(a.reasonCode) - priority(b.reasonCode)
  })
  const raw = ordered.map(candidate => candidateToRawItem(candidate, candidate.recommendedMinutes))
  const result = validateFocusItems(raw, availableMinutes, ordered)
  if (result.items.length > 0) {
    const total = focusItemsTotalMinutes(result.items)
    const difference = Math.max(0, availableMinutes - total)
    if (difference >= 5) result.items[result.items.length - 1].estimated_minutes += difference
  }
  return result.items
}
