import {
  computeRubricScore,
  computeConceptMastery,
  computeTopicRollup,
  validateTeachingOrder,
  buildCoveragePlan,
  parseConceptTag,
  stripConceptTags
} from '../../src/lib/coverage/conceptCoverage'
import type { TopicConcept } from '../../src/types'

describe('conceptCoverage', () => {
  describe('computeRubricScore', () => {
    it('calculates score based on percentage of key points demonstrated', () => {
      // 3 of 4 key points hit = 75% -> 7.5
      const score = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2],
        hasMaterialMisconception: false,
        assistanceLevel: 'none'
      })
      expect(score).toBe(7.5)
    })

    it('penalizes material misconceptions by 2 points (capped at 0)', () => {
      const score = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2, 3], // 10
        hasMaterialMisconception: true,
        assistanceLevel: 'none'
      })
      expect(score).toBe(8.0)

      const lowScore = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0], // 2.5
        hasMaterialMisconception: true,
        assistanceLevel: 'none'
      })
      expect(lowScore).toBe(0.5)
    })

    it('enforces assistance level caps (hint: 8, scaffold: 7, worked_example: 5)', () => {
      const perfectWithHint = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2, 3], // raw 10
        assistanceLevel: 'hint'
      })
      expect(perfectWithHint).toBe(8.0)

      const perfectWithScaffold = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2, 3], // raw 10
        assistanceLevel: 'scaffold'
      })
      expect(perfectWithScaffold).toBe(7.0)

      const perfectWithWorkedExample = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2, 3], // raw 10
        assistanceLevel: 'worked_example'
      })
      expect(perfectWithWorkedExample).toBe(5.0)

      const directAnswer = computeRubricScore({
        keyPointsTotal: 4,
        keyPointsHit: [0, 1, 2, 3],
        assistanceLevel: 'direct_answer'
      })
      expect(directAnswer).toBe(0)
    })
  })

  describe('computeConceptMastery', () => {
    it('returns null when no assessments exist (accuracy guardrail)', () => {
      const result = computeConceptMastery([])
      expect(result.masteryScore10).toBeNull()
      expect(result.count).toBe(0)
    })

    it('strictly caps single-assessment score at 8.0', () => {
      // Even with a 10 on first answer, cannot claim > 8 without 2nd assessment
      const result = computeConceptMastery([10.0])
      expect(result.masteryScore10).toBe(8.0)
      expect(result.count).toBe(1)
    })

    it('allows score > 8.0 when 2 or more assessments exist', () => {
      // 10 and 9.5
      const result = computeConceptMastery([10.0, 9.5])
      expect(result.masteryScore10).toBeGreaterThan(8.0)
      expect(result.count).toBe(2)
    })

    it('applies recency weighting so recent performance dominates', () => {
      // Early struggle (2.0) followed by recent mastery (9.0)
      const result = computeConceptMastery([9.0, 2.0])
      // 9.0 * 1.0 + 2.0 * 0.8 = 9.0 + 1.6 = 10.6 / 1.8 = ~5.89 -> 5.9
      expect(result.masteryScore10).toBe(5.9)
    })
  })

  describe('computeTopicRollup', () => {
    it('computes coverage % and average mastery across assessed concepts only', () => {
      const concepts: TopicConcept[] = [
        {
          id: 1,
          topic_id: 10,
          subject_id: 1,
          label: 'Concept A',
          key_points: ['p1'],
          source_chunk_ids: [],
          sort_order: 1,
          teach_order: 1,
          prerequisite_ids: [],
          content_hash: 'h1',
          status: 'active',
          created_at: '',
          progress_state: 'assessed',
          mastery_score_10: 8.0
        },
        {
          id: 2,
          topic_id: 10,
          subject_id: 1,
          label: 'Concept B',
          key_points: ['p1'],
          source_chunk_ids: [],
          sort_order: 2,
          teach_order: 2,
          prerequisite_ids: [],
          content_hash: 'h2',
          status: 'active',
          created_at: '',
          progress_state: 'assessed',
          mastery_score_10: 6.0
        },
        {
          id: 3,
          topic_id: 10,
          subject_id: 1,
          label: 'Concept C',
          key_points: ['p1'],
          source_chunk_ids: [],
          sort_order: 3,
          teach_order: 3,
          prerequisite_ids: [],
          content_hash: 'h3',
          status: 'active',
          created_at: '',
          progress_state: 'unseen',
          mastery_score_10: null
        }
      ]

      const rollup = computeTopicRollup(10, concepts)
      expect(rollup.total_concepts).toBe(3)
      expect(rollup.assessed_concepts).toBe(2)
      expect(rollup.unseen_concepts).toBe(1)
      expect(rollup.coverage_percentage).toBe(67) // 2/3 = 67%
      expect(rollup.mastery_score_10).toBe(7.0) // (8.0 + 6.0) / 2
    })
  })

  describe('validateTeachingOrder', () => {
    it('topologically sorts prerequisites before dependent concepts', () => {
      const raw = [
        {
          label: 'Advanced Derivatives',
          key_points: ['p1'],
          source_chunk_ids: ['c1'],
          prerequisite_labels: ['Limits and Continuity']
        },
        {
          label: 'Limits and Continuity',
          key_points: ['p2'],
          source_chunk_ids: ['c2'],
          prerequisite_labels: []
        }
      ]

      const ordered = validateTeachingOrder(raw)
      expect(ordered[0].label).toBe('Limits and Continuity')
      expect(ordered[0].teach_order).toBe(1)
      expect(ordered[1].label).toBe('Advanced Derivatives')
      expect(ordered[1].teach_order).toBe(2)
    })

    it('handles cyclic dependencies gracefully without crashing or dropping items', () => {
      const cyclic = [
        {
          label: 'A',
          key_points: ['k'],
          source_chunk_ids: ['c'],
          prerequisite_labels: ['B'],
          teach_order_hint: 1
        },
        {
          label: 'B',
          key_points: ['k'],
          source_chunk_ids: ['c'],
          prerequisite_labels: ['A'],
          teach_order_hint: 2
        }
      ]

      const ordered = validateTeachingOrder(cyclic)
      expect(ordered).toHaveLength(2)
      expect(ordered[0].label).toBe('A')
      expect(ordered[1].label).toBe('B')
    })
  })

  describe('buildCoveragePlan', () => {
    it('places weak or due concepts in REVIEW and unseen concepts in NEW', () => {
      const concepts: TopicConcept[] = [
        {
          id: 101,
          topic_id: 1,
          subject_id: 1,
          label: 'Weak Concept',
          key_points: ['k'],
          source_chunk_ids: [],
          sort_order: 1,
          teach_order: 1,
          prerequisite_ids: [],
          content_hash: 'h',
          status: 'active',
          created_at: '',
          progress_state: 'assessed',
          mastery_score_10: 4.5,
          assessment_count: 2
        },
        {
          id: 102,
          topic_id: 1,
          subject_id: 1,
          label: 'Mastered Concept',
          key_points: ['k'],
          source_chunk_ids: [],
          sort_order: 2,
          teach_order: 2,
          prerequisite_ids: [],
          content_hash: 'h',
          status: 'active',
          created_at: '',
          progress_state: 'assessed',
          mastery_score_10: 9.0,
          assessment_count: 3,
          is_due_for_review: false
        },
        {
          id: 103,
          topic_id: 1,
          subject_id: 1,
          label: 'Unseen Concept',
          key_points: ['k'],
          source_chunk_ids: [],
          sort_order: 3,
          teach_order: 3,
          prerequisite_ids: [],
          content_hash: 'h',
          status: 'active',
          created_at: '',
          progress_state: 'unseen'
        }
      ]

      const plan = buildCoveragePlan(concepts)
      expect(plan.review).toHaveLength(1)
      expect(plan.review[0].id).toBe(101)
      expect(plan.newConcepts).toHaveLength(1)
      expect(plan.newConcepts[0].id).toBe(103)
      expect(plan.done).toHaveLength(1)
      expect(plan.done[0].id).toBe(102)
    })

    it('pulls unseen prerequisite forward before dependent new concept', () => {
      const concepts: TopicConcept[] = [
        {
          id: 201,
          topic_id: 1,
          subject_id: 1,
          label: 'Complex Topic',
          key_points: ['k'],
          source_chunk_ids: [],
          sort_order: 1,
          teach_order: 2,
          prerequisite_ids: [202],
          content_hash: 'h',
          status: 'active',
          created_at: '',
          progress_state: 'unseen'
        },
        {
          id: 202,
          topic_id: 1,
          subject_id: 1,
          label: 'Foundation Prereq',
          key_points: ['k'],
          source_chunk_ids: [],
          sort_order: 2,
          teach_order: 1,
          prerequisite_ids: [],
          content_hash: 'h',
          status: 'active',
          created_at: '',
          progress_state: 'unseen'
        }
      ]

      const plan = buildCoveragePlan(concepts)
      expect(plan.newConcepts[0].id).toBe(202)
      expect(plan.newConcepts[1].id).toBe(201)
    })

    it('caps REVIEW items at 5 max, sorting weakest first', () => {
      const concepts: TopicConcept[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({
        id,
        topic_id: 1,
        subject_id: 1,
        label: `Concept ${id}`,
        key_points: ['k'],
        source_chunk_ids: [],
        sort_order: id,
        teach_order: id,
        prerequisite_ids: [],
        content_hash: 'h',
        status: 'active',
        created_at: '',
        progress_state: 'assessed',
        mastery_score_10: id, // 1 to 7
        assessment_count: 2
      }))

      const plan = buildCoveragePlan(concepts)
      expect(plan.review).toHaveLength(5)
      expect(plan.review.map((c: TopicConcept) => c.id)).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('tag parsing and stripping', () => {
    it('extracts [CONCEPT:42] properly', () => {
      const text = 'Here is the question. [CONCEPT:42] What is X?'
      expect(parseConceptTag(text)).toBe(42)
    })

    it('rejects concept ID not in allowed set', () => {
      const text = 'Here is the question. [CONCEPT:999]'
      expect(parseConceptTag(text, new Set([42, 43]))).toBeNull()
    })

    it('strips concept tags cleanly', () => {
      const text = 'Here is the question. [CONCEPT:42] What is X?'
      expect(stripConceptTags(text)).toBe('Here is the question.  What is X?')
    })
  })
})
