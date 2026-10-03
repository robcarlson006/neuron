import { validateFocusItems, buildFocusCandidates, type FocusCandidate } from '../../src/lib/focusBlockPlanner'

describe('focus block planner safeguards', () => {
  const candidates: FocusCandidate[] = [
    { subjectId: 1, topicId: 10, moduleId: 2, actionType: 'tutor_drill', targetTopic: 'Cell signalling', recommendedMinutes: 20, reasonCode: 'topic_due', evidence: 'Due today' },
    { subjectId: 1, topicId: 11, moduleId: 2, actionType: 'new_content', targetTopic: 'Receptors', recommendedMinutes: 15, reasonCode: 'new_content', evidence: 'New material' }
  ]

  test('rejects unsupported IDs, actions, duplicates, and over-budget plans', () => {
    const result = validateFocusItems([
      { subject_id: 1, topic_id: 10, action_type: 'tutor_drill', estimated_minutes: 20 },
      { subject_id: 999, topic_id: 10, action_type: 'tutor_drill', estimated_minutes: 20 },
      { subject_id: 1, topic_id: 10, action_type: 'bad', estimated_minutes: 20 }
    ], 30, candidates)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].topic_id).toBe(10)
    expect(result.items[0].estimated_minutes).toBe(20)
    expect(result.rejected).toBe(2)
  })

  test('builds bounded deterministic candidates in urgency order', () => {
    const items = buildFocusCandidates(candidates, 30)
    expect(items.map(item => item.topic_id)).toEqual([10, 11])
    expect(items.reduce((sum, item) => sum + item.estimated_minutes, 0)).toBe(30)
    expect(items[0].reason_code).toBe('topic_due')
  })
})
